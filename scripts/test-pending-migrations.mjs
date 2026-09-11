import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { PGlite } from '../test-results/sql-runtime/node_modules/@electric-sql/pglite/dist/index.js';
import { buildBundle, loadMigrations } from './migrate-database.mjs';

// Actual PostgreSQL engine; optional isolated setup is documented in test-sql.mjs.
// Supabase-managed auth/storage/roles are stubbed only for local execution. All
// application schema, policies, functions and generated bundle run unchanged.
const bootstrapSql = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const db = await PGlite.create();
const tests = [];
const migrations = (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
const pending = migrations.filter(name => name >= '20260828000100');
const checksums = {};
const query = async (sql, values = []) => (await db.query(sql, values)).rows;
async function check(name, run) {
  try { await run(); tests.push({ name, passed: true }); console.log(`PASS ${name}`); }
  catch (error) { tests.push({ name, passed: false, error: error.message }); console.log(`FAIL ${name}: ${error.message}`); }
  finally { await db.exec('reset role'); }
}
async function apply(name, engine = db) {
  const sql = await readFile(`supabase/migrations/${name}`, 'utf8');
  checksums[name] = createHash('sha256').update(sql).digest('hex');
  // gen_random_uuid is built in; PGlite cannot load the unused native pgcrypto.
  await engine.exec(sql.replace('create extension if not exists pgcrypto;', ''));
}
async function julyBaseline(engine) {
  await engine.exec(bootstrapSql);
  for (const name of migrations.filter(name => name < '20260828000100')) await apply(name, engine);
}
const ids = Object.fromEntries(['place', 'second', 'outside', 'course', 'schedule', 'stamp', 'staged', 'approved'].map(name => [name, randomUUID()]));
const core = ['places', 'courses', 'course_places', 'schedules', 'schedule_places', 'stamps', 'community_media'];
const counts = async () => Object.fromEntries(await Promise.all(core.map(async table => [table, (await query(`select count(*)::int as count from public.${table}`))[0].count])));
try {
  await julyBaseline(db);
  await db.query("insert into public.places(id,content_id,name,overview,lat,lng) values($1,'fixture-a','Existing A','Source A',35.84,129.22),($2,'fixture-b','Existing B','Source B',35.85,129.21),($3,'fixture-outside','Outside','Source outside',37.56,126.97)", [ids.place, ids.second, ids.outside]);
  await db.query("insert into public.courses(id,title,is_curated,share_token) values($1,'Existing curated route',true,'existing-share')", [ids.course]);
  await db.query('insert into public.course_places(course_id,place_id,order_no,order_index) values($1,$2,0,0)', [ids.course, ids.place]);
  await db.query("insert into public.schedules(id,actor_key,title,start_date,end_date) values($1,'existing-actor','Existing schedule','2026-09-10','2026-09-12')", [ids.schedule]);
  await db.query("insert into public.schedule_places(schedule_id,place_id,visit_date,stay_minutes,sort_order) values($1,$2,'2026-09-10',60,0)", [ids.schedule, ids.place]);
  await db.query("insert into public.stamps(id,actor_key,place_id) values($1,'existing-actor',$2)", [ids.stamp, ids.place]);
  await db.query("insert into public.community_media(id,actor_key,staging_path,mime_type,size_bytes,status,public_path,created_at) values($1,'existing-actor','existing/staged','image/png',32,'staged',null,'2026-09-01'),($2,'existing-actor','existing/approved','image/png',32,'approved','https://fixture.example/storage/v1/object/public/community-public/existing/approved.png','2026-09-01')", [ids.staged, ids.approved]);
  // The restored live schema retained these old NOT NULL constraints despite
  // having actor_key columns. Preserve its old user row while repairing drift.
  await db.query('update public.schedules set user_id=$1 where id=$2', [randomUUID(), ids.schedule]);
  await db.exec('alter table public.cart_items alter column user_id set not null; alter table public.schedules alter column user_id set not null;');
  const beforeCounts = await counts();
  const beforePlaces = await query('select * from public.places order by id');
  const beforeCourses = await query('select * from public.courses order by id');
  const beforeSchedule = await query('select * from public.schedule_places order by id');
  for (const name of pending) await check(`pending migration applies: ${name}`, () => apply(name));
  await check('pending migrations preserve preexisting core rows and values', async () => {
    assert.deepEqual(await counts(), beforeCounts);
    assert.deepEqual(await query('select * from public.places order by id'), beforePlaces);
    assert.deepEqual(await query('select * from public.courses order by id'), beforeCourses);
    assert.deepEqual(await query('select * from public.schedule_places order by id'), beforeSchedule);
  });
  await check('stamp backfill registers only in-region places as inactive and links existing stamp', async () => {
    const targets = await query('select place_id,is_active from public.stamp_targets order by place_id');
    assert.equal(targets.length, 2);
    assert.ok(targets.every(target => target.is_active === false && target.place_id !== ids.outside));
    assert.ok((await query('select stamp_target_id from public.stamps where id=$1', [ids.stamp]))[0].stamp_target_id);
  });
  await check('release media backfills preserve deletable path and add expiry', async () => {
    assert.equal((await query('select public_storage_path from public.community_media where id=$1', [ids.approved]))[0].public_storage_path, 'existing/approved.png');
    assert.equal((await query('select expires_at-created_at = interval \'1 hour\' as valid from public.community_media where id=$1', [ids.staged]))[0].valid, true);
  });
  const afterFirst = await query('select * from public.stamp_targets order by id');
  for (const name of pending) await check(`pending migration reapplies: ${name}`, () => apply(name));
  await check('reapplication preserves all core counts and target identities', async () => {
    assert.deepEqual(await counts(), beforeCounts);
    assert.deepEqual(await query('select * from public.stamp_targets order by id'), afterFirst);
    assert.equal((await query('select count(*)::int as count from public.stamp_reward_definitions'))[0].count, 3);
  });
  await check('compatibility migration permits actor-only cart and schedule writes', async () => {
    await db.exec('begin');
    try {
      await db.query("insert into public.cart_items(actor_key,place_id) values('actor-only-fixture',$1)", [ids.place]);
      const [row] = await query("select public.create_schedule_with_places('actor-only-fixture',null,'Actor draft','2026-09-10','2026-09-12','actor-only-token','[]'::jsonb) as schedule");
      assert.equal(row.schedule.user_id, null);
      assert.equal(row.schedule.actor_key, 'actor-only-fixture');
    } finally { await db.exec('rollback'); }
  });
  await check('all 12 application RPCs allow service role and deny anon/authenticated', async () => {
    const functions = await query("select proname,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated,has_function_privilege('service_role',oid,'EXECUTE') as service from pg_proc where pronamespace='public'::regnamespace order by proname");
    assert.equal(functions.length, 12);
    assert.ok(functions.every(fn => !fn.anon && !fn.authenticated && fn.service), JSON.stringify(functions));
  });
  await check('release private tables and audit artwork rows deny direct client reads', async () => {
    const tables = ['app_sessions','auth_actor_identities','community_comments','community_reports','user_blocks','stamp_artworks','stamp_checkpoint_tokens','user_stamp_rewards','community_posts'];
    for (const table of tables) {
      const [permissions] = await query("select has_table_privilege('anon',$1,'SELECT') as anon,has_table_privilege('authenticated',$1,'SELECT') as authenticated", [`public.${table}`]);
      assert.deepEqual(permissions, { anon: false, authenticated: false }, table);
    }
  });
  await check('all newly added tables enforce RLS and artwork bucket privacy is correct', async () => {
    const newTables = ['app_sessions','auth_actor_identities','community_comments','community_reports','user_blocks','stamp_targets','stamp_artworks','stamp_checkpoint_tokens','stamp_reward_definitions','user_stamp_rewards'];
    const rows = await query("select relname,relrowsecurity from pg_class where relnamespace='public'::regnamespace and relname=any($1)", [newTables]);
    assert.equal(rows.length, 10); assert.ok(rows.every(row => row.relrowsecurity));
    assert.deepEqual(await query("select id,public from storage.buckets where id like 'stamp-artworks%' order by id"), [{ id: 'stamp-artworks', public: true }, { id: 'stamp-artworks-staging', public: false }]);
  });
  await check('invalid schedule creation rolls back header after full migration chain', async () => {
    const before = await counts();
    await assert.rejects(db.query("select public.create_schedule_with_places('fixture-actor',null,'Bad draft','2026-09-10','2026-09-12','test-token',$1::jsonb)", [JSON.stringify([{place_id:randomUUID(),visit_date:'2026-09-10',stay_minutes:60,sort_order:0}])]), /foreign key/);
    assert.deepEqual(await counts(), before);
  });
  await check('invalid schedule edit preserves existing header and stops', async () => {
    const before = await query('select * from public.schedules where id=$1', [ids.schedule]);
    await assert.rejects(db.query("select public.update_schedule_with_places($1,'existing-actor','{\"title\":\"Should roll back\"}'::jsonb,$2::jsonb)", [ids.schedule, JSON.stringify([{place_id:randomUUID(),visit_date:'2026-09-10',stay_minutes:60,sort_order:0}])]), /foreign key/);
    assert.deepEqual(await query('select * from public.schedules where id=$1', [ids.schedule]), before);
    assert.deepEqual(await query('select * from public.schedule_places order by id'), beforeSchedule);
    await assert.rejects(db.query("select public.update_schedule_with_places($1,'other-actor','{}'::jsonb,null)", [ids.schedule]), /schedule_not_found/);
  });
  await check('community post cannot steal another actor approved media', async () => {
    await assert.rejects(db.query("select public.create_community_post('wrong-actor','Fixture','photo',$1,'Title','Body',null,'{}'::jsonb,$2::uuid[])", [ids.place, [ids.approved]]), /media_not_available/);
    assert.equal((await query('select count(*)::int as count from public.community_posts'))[0].count, 0);
    assert.equal((await query('select post_id from public.community_media where id=$1', [ids.approved]))[0].post_id, null);
  });
  await check('stamp claim enforces inactive target, checkpoint and duplicate idempotence', async () => {
    const [target] = await query('select id from public.stamp_targets where place_id=$1', [ids.second]);
    const call = token => query("select public.claim_stamp('claim-fixture',null,$1,$2,true,$3,5,10) as result", [ids.second,target.id,token]);
    assert.equal((await call(null))[0].result.status, 'target_invalid');
    await db.query('update public.stamp_targets set is_active=true,checkpoint_required=true where id=$1', [target.id]);
    assert.equal((await call(null))[0].result.status, 'checkpoint_invalid');
    const token = 'a'.repeat(64);
    await db.query("insert into public.stamp_checkpoint_tokens(stamp_target_id,token_hash,token_hint,expires_at,max_uses) values($1,$2,'fixture',now()+interval '1 hour',1)", [target.id,token]);
    assert.equal((await call(token))[0].result.status, 'acquired');
    assert.equal((await call(token))[0].result.status, 'already_acquired');
    assert.equal((await query('select uses_count from public.stamp_checkpoint_tokens where token_hash=$1', [token]))[0].uses_count, 1);
    const [stamp] = await query("select lat,lng from public.stamps where actor_key='claim-fixture'");
    assert.deepEqual(stamp, {lat:null,lng:null});
  });
  const bundleMigrations = await loadMigrations();
  const bundle = buildBundle(bundleMigrations);
  await check('checked-in SQL bundle exactly matches its generating migrations', async () => {
    const checkedIn = (await readFile('supabase/apply-pending-2026-09-06.sql', 'utf8')).replaceAll('\r\n', '\n');
    assert.equal(checkedIn, bundle.replaceAll('\r\n', '\n'));
  });
  await check('exact generated bundle repairs legacy drift atomically and ledger skips replay', async () => {
    const engine = await PGlite.create();
    try {
      await julyBaseline(engine);
      await engine.exec("alter table public.cart_items alter column user_id set not null; alter table public.schedules alter column user_id set not null; insert into public.places(content_id,name,lat,lng) values('bundle-fixture','Preserved place',35.84,129.22);");
      await engine.exec(bundle);
      const ledger = (await engine.query('select version from supabase_migrations.schema_migrations order by version')).rows;
      assert.deepEqual(ledger.map(row => row.version), bundleMigrations.map(migration => migration.version));
      const before = (await engine.query('select * from public.stamp_targets order by id')).rows;
      assert.equal(before.length, 1); assert.equal(before[0].is_active, false);
      await engine.exec(bundle);
      assert.deepEqual((await engine.query('select * from public.stamp_targets order by id')).rows, before);
      assert.deepEqual((await engine.query('select version from supabase_migrations.schema_migrations order by version')).rows, ledger);
      await engine.exec("insert into public.cart_items(actor_key,place_id) select 'bundle-actor',id from public.places; select public.create_schedule_with_places('bundle-actor',null,'Bundle draft','2026-09-10','2026-09-12','bundle-token','[]'::jsonb);");
      assert.equal((await engine.query('select count(*)::int as count from public.places')).rows[0].count, 1);
    } finally { await engine.close(); }
  });
  await check('bundle preflight rejects invalid existing video without schema or row changes', async () => {
    const engine = await PGlite.create();
    try {
      await julyBaseline(engine);
      await engine.exec("alter table public.shorts add column video_url text; insert into public.places(content_id,name) values('hostile-fixture','Existing place'); insert into public.shorts(place_id,title,summary,narration,video_url) select id,'Existing','Summary','Narration','javascript:invalid' from public.places;");
      const before = (await engine.query('select * from public.shorts')).rows;
      await assert.rejects(engine.exec(bundle), /migration_invalid_existing_video_url/);
      await engine.exec('rollback');
      assert.deepEqual((await engine.query('select * from public.shorts')).rows, before);
      assert.equal((await engine.query("select to_regclass('public.stamp_targets') as targets,to_regclass('supabase_migrations.schema_migrations') as ledger")).rows[0].targets, null);
      assert.equal((await engine.query("select to_regclass('supabase_migrations.schema_migrations') as ledger")).rows[0].ledger, null);
    } finally { await engine.close(); }
  });
  await check('a mid-bundle failure rolls back earlier DDL, backfills and migration ledger', async () => {
    const engine = await PGlite.create();
    try {
      await julyBaseline(engine);
      await engine.exec("insert into public.places(content_id,name,lat,lng) values('rollback-fixture','Preserved place',35.84,129.22);");
      const injected = bundleMigrations.map((migration, index) => index === 2 ? { ...migration, sql: `${migration.sql}\nraise exception 'test_injected_failure';` } : migration);
      await assert.rejects(engine.exec(buildBundle(injected)), /test_injected_failure/);
      await engine.exec('rollback');
      const [state] = (await engine.query("select to_regclass('public.stamp_targets') as targets,to_regclass('public.app_sessions') as sessions,to_regclass('supabase_migrations.schema_migrations') as ledger,(select count(*)::int from information_schema.columns where table_schema='public' and table_name='shorts' and column_name='video_url') as video_columns,(select count(*)::int from public.places) as places")).rows;
      assert.deepEqual(state, { targets: null, sessions: null, ledger: null, video_columns: 0, places: 1 });
    } finally { await engine.close(); }
  });
} finally {
  const engine = (await query('select version() as version'))[0].version;
  await db.close();
  const report = { checkedAt: new Date().toISOString(), isolated: true, remoteWrites: 0, engine, migrations, checksums, passed: tests.filter(test => test.passed).length, failed: tests.filter(test => !test.passed).length, tests };
  await writeFile('test-results/pending-migrations-sql-validation.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify({passed:report.passed,failed:report.failed,artifact:'test-results/pending-migrations-sql-validation.json'}));
  if (report.failed) process.exitCode = 1;
}
