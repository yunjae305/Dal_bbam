// Run with: node --env-file=.env.local scripts/verify-db-crud.mjs --write
// Without --write, only inspect schema. Never creates Auth users or public content.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const writeEnabled = process.argv.includes('--write');
const reportPath = resolve('test-results/db-live-crud.json');
const actor = `verification:${randomUUID()}`;
const otherActor = `verification:${randomUUID()}`;
const ids = { cart: randomUUID(), schedule: randomUUID() };
const report = {
  startedAt: new Date().toISOString(),
  mode: writeEnabled ? 'live-crud' : 'read-only-preflight',
  status: 'running',
  actor,
  generatedIds: ids,
  scope: 'Service-role REST persistence and explicit actor filters, not Auth/RLS enforcement or pending RPCs.',
  writesAttempted: false,
  schema: {},
  checks: [],
  cleanup: { attempted: false, remainingRows: null }
};

async function saveReport() {
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

function check(name, passed, details = {}) {
  report.checks.push({ name, passed, ...details });
  if (!passed) throw Object.assign(new Error(name), { code: 'VERIFICATION_FAILED', check: name });
}

function errorCode(error) {
  const candidate = error?.code ?? error?.cause?.code ?? error?.name;
  return typeof candidate === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(candidate) ? candidate : 'REQUEST_FAILED';
}

const endpoint = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const secret = process.env.SUPABASE_SECRET_KEY;
async function request(path, { method = 'GET', body, params = {} } = {}) {
  const url = new URL(`${endpoint}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      Accept: path ? 'application/json' : 'application/openapi+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { Prefer: 'return=representation' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error('Database request failed'), {
      code: typeof payload?.code === 'string' ? payload.code : `HTTP_${response.status}`
    });
  }
  return payload;
}

function ownRow(id, owner = actor) {
  return { id: `eq.${id}`, actor_key: `eq.${owner}` };
}

async function verifyTableOwnership(table, id) {
  const wrongRead = await request(table, { params: { ...ownRow(id, otherActor), select: 'id' } });
  check(`${table}: other actor read excludes row`, wrongRead.length === 0);
  const wrongDelete = await request(table, { method: 'DELETE', params: ownRow(id, otherActor) });
  check(`${table}: other actor delete affects zero rows`, wrongDelete.length === 0);
  const preserved = await request(table, { params: { ...ownRow(id), select: 'id' } });
  check(`${table}: owner row survives other actor delete`, preserved.length === 1 && preserved[0].id === id);
}

try {
  if (!endpoint || !secret) throw Object.assign(new Error('Missing database configuration'), { code: 'CONFIGURATION_MISSING' });
  if (new URL(endpoint).protocol !== 'https:') throw Object.assign(new Error('HTTPS database URL required'), { code: 'HTTPS_REQUIRED' });
  const metadata = await request('');
  report.actorTableNullability = Object.fromEntries(Object.entries(metadata?.definitions ?? {})
    .filter(([, definition]) => definition.properties?.actor_key && definition.properties?.user_id)
    .map(([table, definition]) => [table, {
      requiredColumns: definition.required ?? [],
      userIdNullable: !definition.required?.includes('user_id'),
      visibleUserIdReference: definition.properties.user_id.description ?? null
    }]));
  const wanted = {
    cart_items: ['id', 'actor_key', 'user_id', 'place_id'],
    schedules: ['id', 'actor_key', 'user_id', 'title', 'start_date', 'end_date']
  };
  for (const [table, columns] of Object.entries(wanted)) {
    const definition = metadata?.definitions?.[table];
    const properties = definition?.properties ?? {};
    const required = definition?.required ?? [];
    report.schema[table] = {
      present: Boolean(definition),
      missingColumns: columns.filter(column => !(column in properties)),
      requiredColumns: required,
      userIdNullable: !required.includes('user_id'),
      visibleForeignKeys: Object.fromEntries(Object.entries(properties)
        .filter(([, property]) => property.description?.includes('<fk '))
        .map(([column, property]) => [column, property.description])),
      // PostgREST OpenAPI does not expose every CHECK/index or cross-schema FK.
      fullConstraintIntrospection: false
    };
  }
  const incompatible = Object.entries(report.schema).filter(([, value]) => !value.present || value.missingColumns.length || !value.userIdNullable);
  if (incompatible.length) {
    report.status = 'blocked-schema';
    report.blockedTables = incompatible.map(([table]) => table);
    report.reason = 'Actor-only application writes require nullable user_id and the listed columns. No writes attempted.';
    process.exitCode = 1;
  } else if (!writeEnabled) {
    report.status = 'preflight-passed';
  } else {
    // Only a public catalogue identifier is read; no existing personal rows are read.
    const places = await request('places', { params: { select: 'id', order: 'id.asc', limit: '1' } });
    check('existing public place available', places.length === 1 && typeof places[0].id === 'string');
    const placeId = places[0].id;
    const date = new Date().toISOString().slice(0, 10);
    const title = `Temporary CRUD verification ${ids.schedule.slice(0, 8)}`;

    // Persist all generated cleanup identifiers before the first network mutation.
    // Preallocated UUIDs remain known even if an INSERT response times out.
    report.writesAttempted = true;
    await saveReport();
    try {
      const cart = await request('cart_items', { method: 'POST', body: { id: ids.cart, actor_key: actor, user_id: null, place_id: placeId } });
      check('cart_items: insert', cart.length === 1 && cart[0].id === ids.cart);
      const cartRead = await request('cart_items', { params: { ...ownRow(ids.cart), select: 'id,place_id' } });
      check('cart_items: persisted place reference', cartRead.length === 1 && cartRead[0].place_id === placeId);
      await verifyTableOwnership('cart_items', ids.cart);

      const schedule = await request('schedules', { method: 'POST', body: {
        id: ids.schedule, actor_key: actor, user_id: null, title, start_date: date, end_date: date
      } });
      check('schedules: insert', schedule.length === 1 && schedule[0].id === ids.schedule);
      const read = await request('schedules', { params: { ...ownRow(ids.schedule), select: 'id,title,start_date,end_date' } });
      check('schedules: persisted fields', read.length === 1 && read[0].title === title && read[0].start_date === date && read[0].end_date === date);
      const wrongUpdate = await request('schedules', { method: 'PATCH', params: ownRow(ids.schedule, otherActor), body: { title: 'Wrong actor' } });
      check('schedules: other actor update affects zero rows', wrongUpdate.length === 0);
      const updatedTitle = `${title} updated`;
      const update = await request('schedules', { method: 'PATCH', params: ownRow(ids.schedule), body: { title: updatedTitle } });
      check('schedules: owner update', update.length === 1 && update[0].id === ids.schedule);
      const updated = await request('schedules', { params: { ...ownRow(ids.schedule), select: 'id,title' } });
      check('schedules: update persisted', updated.length === 1 && updated[0].title === updatedTitle);
      await verifyTableOwnership('schedules', ids.schedule);
      report.status = 'passed';
    } finally {
      report.cleanup.attempted = true;
      report.cleanup.tables = {};
      // A failed cleanup must not prevent cleanup of the other table.
      for (const [table, id] of [['cart_items', ids.cart], ['schedules', ids.schedule]]) {
        try {
          const deleted = await request(table, { method: 'DELETE', params: ownRow(id) });
          const remaining = await request(table, { params: { ...ownRow(id), select: 'id' } });
          report.cleanup.tables[table] = { deletedRows: deleted.length, remainingRows: remaining.length };
          check(`${table}: delete persisted`, remaining.length === 0);
        } catch (error) {
          report.cleanup.tables[table] = { error: errorCode(error) };
          report.status = 'cleanup-failed';
          process.exitCode = 1;
        }
      }
      const cleanupValues = Object.values(report.cleanup.tables);
      report.cleanup.remainingRows = cleanupValues.some(value => value.error)
        ? null : cleanupValues.reduce((sum, value) => sum + value.remainingRows, 0);
      await saveReport();
    }
  }
} catch (error) {
  if (report.status !== 'cleanup-failed') report.status = 'failed';
  report.error = { code: errorCode(error), ...(error?.check ? { check: error.check } : {}) };
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  await saveReport();
  console.log(JSON.stringify(report, null, 2));
}
