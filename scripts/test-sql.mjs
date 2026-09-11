// Actual local PostgreSQL validation without production dependencies or a remote DB.
// One-time setup (isolated and ignored):
// npm install --prefix test-results/sql-runtime --no-save --ignore-scripts --no-audit --no-fund @electric-sql/pglite@0.5.8
// Run: node scripts/test-sql.mjs
// Engine documentation: https://pglite.dev/docs/api
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
let PGlite;
try {
  ({ PGlite } = await import(new URL('test-results/sql-runtime/node_modules/@electric-sql/pglite/dist/index.js', root).href));
} catch {
  throw new Error('Install the isolated test engine first; see the setup command at the top of scripts/test-sql.mjs.');
}
const db = await PGlite.create();
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('reset role'); }
}
async function rows(sql, parameters = []) { return (await db.query(sql, parameters)).rows; }
const migrationNames = [
  '20260906000100_place_view_ranking.sql',
  '20260906000200_course_schedule_workflows.sql'
];
const placeA = randomUUID();
const placeB = randomUUID();
const missingPlace = randomUUID();
function visits(placeId = placeA, patch = {}) {
  return [{ place_id: placeId, visit_date: '2026-09-10', start_time: '09:00', stay_minutes: 60, sort_order: 0, note: 'Test visit', ...patch }];
}
async function createSchedule(items = visits(), actor = 'actor-a') {
  const [row] = await rows('select public.create_schedule_with_places($1,null,$2,$3,$4,$5,$6::jsonb) as schedule',
    [actor, 'Original trip', '2026-09-10', '2026-09-12', randomUUID(), JSON.stringify(items)]);
  return row.schedule;
}
async function updateSchedule(id, actor, patch, items = null) {
  return db.query('select public.update_schedule_with_places($1,$2,$3::jsonb,$4::jsonb)',
    [id, actor, JSON.stringify(patch), items === null ? null : JSON.stringify(items)]);
}
async function snapshot(id) {
  return {
    header: await rows('select * from public.schedules where id=$1', [id]),
    visits: await rows('select * from public.schedule_places where schedule_id=$1 order by sort_order,id', [id])
  };
}
async function course(id = null, items = [{ place_id: placeA, order_index: 0, reason: 'Test stop', stay_minutes: 60 }], title = 'Curated route', token = randomUUID()) {
  const [row] = await rows('select public.save_curated_course($1,$2,$3,$4,$5,$6,$7::jsonb) as course',
    [id, title, 'Description', 'walking', 'heritage', token, JSON.stringify(items)]);
  return row.course;
}

try {
  // Supabase-managed roles/storage are absent from an embedded Postgres database.
  // All application tables, constraints, RLS policies and functions below come
  // from the real base migration, not a hand-written imitation of their shape.
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  `);
  const base = await readFile(new URL('supabase/migrations/20260709000000_tourism_core_schema.sql', root), 'utf8');
  // gen_random_uuid() is built into PostgreSQL; no pgcrypto function is used by
  // these migrations. The optional native extension is unavailable in PGlite.
  await db.exec(base.replace('create extension if not exists pgcrypto;', ''));
  await db.exec('grant usage on schema public to anon, authenticated, service_role; grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role;');
  for (const name of migrationNames) {
    const sql = await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8');
    await check(`migration applies and can be reapplied: ${name}`, async () => { await db.exec(sql); await db.exec(sql); });
  }
  await db.query('insert into public.places(id,content_id,name) values($1,$2,$3),($4,$5,$6)',
    [placeA, 'A', 'Place A', placeB, 'B', 'Place B']);

  await check('ranking aggregates all 1,503 current views before sorting, excludes old/non-view events', async () => {
    await db.query("insert into public.place_events(place_id,event_type,event_date) select $1,'view','2026-09-06' from generate_series(1,1501)", [placeA]);
    await db.query("insert into public.place_events(place_id,event_type,event_date) values($1,'view','2026-09-06'),($1,'view','2026-09-06'),($1,'view','2026-08-01'),($1,'save','2026-09-06')", [placeB]);
    await db.exec('set role service_role');
    const ranking = await rows("select * from public.get_place_view_ranking('2026-09-01')");
    assert.deepEqual(ranking.map(row => [row.content_id, Number(row.view_count)]), [['A', 1501], ['B', 2]]);
  });

  const signatures = [
    'public.get_place_view_ranking(date)',
    'public.create_schedule_with_places(text,uuid,text,date,date,text,jsonb)',
    'public.update_schedule_with_places(uuid,text,jsonb,jsonb)',
    'public.save_curated_course(uuid,text,text,text,text,text,jsonb)'
  ];
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await check(`function execution grants are restricted correctly for ${role}`, async () => {
      for (const signature of signatures) {
        const [permission] = await rows('select has_function_privilege($1,$2,\'EXECUTE\') as allowed', [role, signature]);
        assert.equal(permission.allowed, role === 'service_role', signature);
      }
      if (role !== 'service_role') {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query("select * from public.get_place_view_ranking('2026-09-01')"), /permission denied/);
        await assert.rejects(createSchedule(), /permission denied/);
      }
    });
  }

  await check('service role creates schedule header and typed visits atomically', async () => {
    await db.exec('set role service_role');
    const schedule = await createSchedule();
    const state = await snapshot(schedule.id);
    assert.equal(state.header[0].actor_key, 'actor-a');
    assert.equal(state.visits.length, 1);
    assert.equal(state.visits[0].place_id, placeA);
    assert.equal(state.visits[0].stay_minutes, 60);
  });

  await check('invalid visit foreign key rolls back a new schedule header', async () => {
    const before = await rows('select count(*)::int as total from public.schedules');
    await assert.rejects(createSchedule(visits(missingPlace)), /foreign key/);
    assert.deepEqual(await rows('select count(*)::int as total from public.schedules'), before);
  });
  for (const patch of [{ visit_date: '2026-09-13' }, { stay_minutes: 14 }, { stay_minutes: 241 }]) {
    await check(`invalid new schedule visit rolls back everything: ${JSON.stringify(patch)}`, async () => {
      const before = await rows('select count(*)::int as total from public.schedules');
      await assert.rejects(createSchedule(visits(placeA, patch)), /invalid_schedule_item/);
      assert.deepEqual(await rows('select count(*)::int as total from public.schedules'), before);
    });
  }

  await check('schedule update rejects another actor without changing metadata or visits', async () => {
    const schedule = await createSchedule();
    const before = await snapshot(schedule.id);
    await assert.rejects(updateSchedule(schedule.id, 'actor-b', { title: 'Hijacked' }, []), /schedule_not_found/);
    assert.deepEqual(await snapshot(schedule.id), before);
  });
  await check('schedule metadata and replacement visits commit together', async () => {
    const schedule = await createSchedule();
    await updateSchedule(schedule.id, 'actor-a', { title: 'Updated trip' }, visits(placeB));
    const state = await snapshot(schedule.id);
    assert.equal(state.header[0].title, 'Updated trip');
    assert.equal(state.visits.length, 1);
    assert.equal(state.visits[0].place_id, placeB);
  });
  await check('failed replacement restores the old title and old visits', async () => {
    const schedule = await createSchedule();
    const before = await snapshot(schedule.id);
    await assert.rejects(updateSchedule(schedule.id, 'actor-a', { title: 'Must roll back' }, visits(missingPlace)), /foreign key/);
    assert.deepEqual(await snapshot(schedule.id), before);
  });
  await check('shrinking a date range around existing visits rolls back the date change', async () => {
    const schedule = await createSchedule();
    const before = await snapshot(schedule.id);
    await assert.rejects(updateSchedule(schedule.id, 'actor-a', { start_date: '2026-09-11' }), /invalid_schedule_item/);
    assert.deepEqual(await snapshot(schedule.id), before);
  });
  await check('reversed dates fail without leaving a partial metadata update', async () => {
    const schedule = await createSchedule();
    const before = await snapshot(schedule.id);
    await assert.rejects(updateSchedule(schedule.id, 'actor-a', { start_date: '2026-09-14' }), /invalid_date_range/);
    assert.deepEqual(await snapshot(schedule.id), before);
  });
  await check('null replacement preserves visits while an empty array removes them', async () => {
    const schedule = await createSchedule();
    const before = (await snapshot(schedule.id)).visits;
    await updateSchedule(schedule.id, 'actor-a', { title: 'Metadata only' }, null);
    assert.deepEqual((await snapshot(schedule.id)).visits, before);
    await updateSchedule(schedule.id, 'actor-a', {}, []);
    assert.equal((await snapshot(schedule.id)).visits.length, 0);
  });
  await check('duplicate visit order causes an atomic rollback', async () => {
    const schedule = await createSchedule();
    const before = await snapshot(schedule.id);
    await assert.rejects(updateSchedule(schedule.id, 'actor-a', { title: 'Invalid order' }, [...visits(), ...visits(placeB)]), /unique constraint/);
    assert.deepEqual(await snapshot(schedule.id), before);
  });

  await check('curated creation persists metadata and ordered visits', async () => {
    await db.exec('set role service_role');
    const saved = await course(null, [
      { place_id: placeB, order_index: 0, reason: 'First', stay_minutes: 60 },
      { place_id: placeA, order_index: 1, reason: 'Second', stay_minutes: 45 }
    ]);
    assert.equal(saved.is_curated, true);
    assert.equal(saved.metadata.theme, 'heritage');
    const visits = await rows('select place_id,order_index,order_no from public.course_places where course_id=$1 order by order_index', [saved.id]);
    assert.deepEqual(visits.map(row => [row.place_id, row.order_index, row.order_no]), [[placeB, 0, 0], [placeA, 1, 1]]);
  });
  await check('curated update preserves id/share token and replaces visits', async () => {
    const first = await course();
    const updated = await course(first.id, [{ place_id: placeB, order_index: 0, reason: 'New stop', stay_minutes: 50 }], 'Updated route');
    assert.equal(updated.id, first.id);
    assert.equal(updated.share_token, first.share_token);
    assert.equal(updated.title, 'Updated route');
    assert.deepEqual((await rows('select place_id from public.course_places where course_id=$1', [first.id])).map(row => row.place_id), [placeB]);
  });
  await check('curated creation with a nonexistent place rolls back its header', async () => {
    const before = await rows('select count(*)::int as total from public.courses');
    await assert.rejects(course(null, [{ place_id: missingPlace, order_index: 0, stay_minutes: 60 }]), /foreign key/);
    assert.deepEqual(await rows('select count(*)::int as total from public.courses'), before);
  });
  await check('curated replacement failure preserves the previous header and visits', async () => {
    const saved = await course();
    const beforeHeader = await rows('select * from public.courses where id=$1', [saved.id]);
    const beforeVisits = await rows('select * from public.course_places where course_id=$1', [saved.id]);
    await assert.rejects(course(saved.id, [{ place_id: missingPlace, order_index: 0, stay_minutes: 60 }], 'Must roll back'), /foreign key/);
    assert.deepEqual(await rows('select * from public.courses where id=$1', [saved.id]), beforeHeader);
    assert.deepEqual(await rows('select * from public.course_places where course_id=$1', [saved.id]), beforeVisits);
  });
  await check('admin curated function cannot overwrite a personal course', async () => {
    const [personal] = await rows("insert into public.courses(title,actor_key,is_curated) values('Personal','actor-a',false) returning *");
    await assert.rejects(course(personal.id), /course_not_found/);
    assert.deepEqual(await rows('select * from public.courses where id=$1', [personal.id]), [personal]);
  });
} finally {
  const [engine] = await rows('select version() as version');
  await db.close();
  const output = { engine: engine.version, isolated: true, migrations: migrationNames, passed: results.filter(result => result.passed).length, failed: results.filter(result => !result.passed).length, tests: results };
  await mkdir(new URL('test-results/', root), { recursive: true });
  await writeFile(new URL('test-results/sql-integration.json', root), JSON.stringify(output, null, 2));
  console.log(`${output.passed} passed; ${output.failed} failed. Report: test-results/sql-integration.json`);
  if (output.failed) process.exitCode = 1;
}
