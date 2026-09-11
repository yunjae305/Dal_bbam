// Only the additions missing from the restored July database are in scope.
// Default: read-only plan. --write-bundle prepares reviewable SQL; --apply writes.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
export const migrationNames = [
  '20260828000100_shorts_video.sql',
  '20260828000200_stamp_hardening_ai.sql',
  '20260828000300_release_hardening.sql',
  '20260906000100_place_view_ranking.sql',
  '20260906000200_course_schedule_workflows.sql',
  '20260906000300_restored_actor_compatibility.sql'
];
const baseColumns = {
  'public.places': ['id', 'content_id', 'lat', 'lng', 'created_at'],
  'public.shorts': ['id', 'place_id'],
  'public.short_interactions': ['actor_key', 'short_id'],
  'public.stamps': ['id', 'actor_key', 'user_id', 'place_id', 'lat', 'lng', 'accuracy_m', 'distance_m'],
  'public.schedules': ['id', 'actor_key', 'user_id', 'title', 'start_date', 'end_date', 'share_token', 'updated_at'],
  'public.schedule_places': ['id', 'schedule_id', 'place_id', 'visit_date', 'start_time', 'stay_minutes', 'sort_order', 'note'],
  'public.courses': ['id', 'user_id', 'actor_key', 'title', 'description', 'transport', 'is_curated', 'is_ai_generated', 'share_token', 'metadata', 'updated_at'],
  'public.course_places': ['course_id', 'place_id', 'order_no', 'order_index', 'reason', 'stay_minutes'],
  'public.community_posts': ['id', 'actor_key', 'author_name', 'category', 'place_id', 'title', 'content', 'rating', 'status', 'moderation'],
  'public.community_media': ['id', 'post_id', 'actor_key', 'staging_path', 'public_path', 'status', 'created_at'],
  'public.community_bookmarks': ['actor_key'], 'public.user_badges': ['actor_key'],
  'public.cart_items': ['actor_key', 'user_id'], 'public.location_consents': ['actor_key'],
  'public.place_events': ['actor_key', 'place_id', 'event_type', 'event_date'],
  'public.api_rate_limits': ['actor_key', 'window_started_at'],
  'auth.users': ['id'], 'storage.buckets': ['id', 'name', 'public', 'file_size_limit', 'allowed_mime_types'],
  'storage.objects': ['bucket_id']
};
export const functionSignatures = [
  'public.consume_stamp_checkpoint(text,uuid)',
  'public.claim_stamp(text,uuid,uuid,uuid,boolean,text,double precision,double precision)',
  'public.approve_stamp_artwork(uuid,text,text)',
  'public.create_community_post(text,text,text,uuid,text,text,smallint,jsonb,uuid[])',
  'public.delete_actor_data(text)', 'public.cleanup_expired_runtime_data()',
  'public.get_place_view_ranking(date)',
  'public.update_schedule_with_places(uuid,text,jsonb,jsonb)',
  'public.create_schedule_with_places(text,uuid,text,date,date,text,jsonb)',
  'public.save_curated_course(uuid,text,text,text,text,text,jsonb)'
];
const literal = value => `'${value.replaceAll("'", "''")}'`;

export async function loadMigrations() {
  return Promise.all(migrationNames.map(async name => {
    const original = (await readFile(new URL(`supabase/migrations/${name}`, root), 'utf8')).replaceAll('\r\n', '\n');
    const wrappers = original.match(/^\s*(?:begin|commit);\s*$/gim) ?? [];
    if (wrappers.length !== (name.includes('stamp_hardening_ai') ? 2 : 0)) throw new Error('migration_unexpected_transaction_wrapper');
    const sql = original.replace(/^\s*(?:begin|commit);\s*$/gim, '').trim();
    return { name, version: name.slice(0, 14), sql, original, sha256: createHash('sha256').update(original).digest('hex') };
  }));
}

function columnAssertions(tables, existingOnly = false) {
  return Object.entries(tables).map(([table, columns]) => {
    const [schema, name] = table.split('.');
    const test = columns.map(column => `not exists (select 1 from information_schema.columns where table_schema=${literal(schema)} and table_name=${literal(name)} and column_name=${literal(column)})`).join(' or ');
    return `if ${existingOnly ? `to_regclass(${literal(table)}) is not null and (` : '('}${test}) then raise exception 'migration_schema_mismatch: ${table}'; end if;`;
  }).join('\n');
}

function newTableColumns(migrations) {
  const result = {};
  for (const migration of migrations) {
    for (const match of migration.sql.matchAll(/create table if not exists (public\.\w+) \(([\s\S]*?)^\);/gm)) {
      result[match[1]] = [...match[2].matchAll(/^  ([a-z_]+)\s+(?:uuid|text|timestamptz|boolean|integer|bigint|jsonb)\b/gm)].map(column => column[1]);
    }
  }
  return result;
}

export function preflightSql(migrations) {
  return `do $preflight$
begin
${columnAssertions(baseColumns)}
${columnAssertions(newTableColumns(migrations), true)}
if exists (select 1 from information_schema.columns where table_schema='public' and table_name='stamps' and column_name in ('lat','lng') and is_nullable='NO') then raise exception 'migration_july_privacy_prerequisite_missing'; end if;
if to_regprocedure('public.replace_schedule_places(uuid,text,jsonb)') is null or to_regprocedure('public.consume_api_rate_limit(text,text,timestamptz,integer)') is null then raise exception 'migration_july_rpc_prerequisite_missing'; end if;
if (select count(*) from pg_roles where rolname in ('anon','authenticated','service_role')) <> 3 then raise exception 'migration_supabase_roles_missing'; end if;
if to_regclass('supabase_migrations.schema_migrations') is not null and not exists (select 1 from information_schema.columns where table_schema='supabase_migrations' and table_name='schema_migrations' and column_name='version' and data_type='text') then raise exception 'migration_history_schema_mismatch'; end if;
if exists (select 1 from information_schema.columns where table_schema='public' and table_name='shorts' and column_name='youtube_video_id') then
  if exists (select 1 from public.shorts where youtube_video_id is not null and youtube_video_id !~ '^[A-Za-z0-9_-]{11}$') then raise exception 'migration_invalid_existing_video_id'; end if;
end if;
if exists (select 1 from information_schema.columns where table_schema='public' and table_name='shorts' and column_name='video_url') then
  if exists (select 1 from public.shorts where video_url is not null and video_url !~* '^(https?://|/[^/]).*\\.mp4([?#].*)?$') then raise exception 'migration_invalid_existing_video_url'; end if;
end if;
if (select count(*) from information_schema.columns where table_schema='public' and table_name='shorts' and column_name in ('video_url','youtube_video_id'))=2 then
  if exists (select 1 from public.shorts where video_url is not null and youtube_video_id is not null) then raise exception 'migration_multiple_existing_video_sources'; end if;
end if;
end;
$preflight$;`;
}

function postflightSql(migrations) {
  const updated = { ...newTableColumns(migrations),
    'public.shorts': ['video_url', 'youtube_video_id'],
    'public.stamps': ['stamp_target_id', 'checkpoint_id', 'checkpoint_verified_at'],
    'public.community_media': ['expires_at', 'public_storage_path', 'processed_sha256', 'width', 'height', 'deleted_at']
  };
  return `do $postflight$ begin
${columnAssertions(updated)}
if exists (select 1 from information_schema.columns where table_schema='public' and table_name in ('cart_items','schedules','courses') and column_name='user_id' and is_nullable='NO') then raise exception 'migration_actor_nullability_mismatch'; end if;
${functionSignatures.map(signature => `if to_regprocedure(${literal(signature)}) is null then raise exception 'migration_rpc_missing: ${signature}'; end if;
if has_function_privilege('anon',${literal(signature)},'EXECUTE') or has_function_privilege('authenticated',${literal(signature)},'EXECUTE') or not has_function_privilege('service_role',${literal(signature)},'EXECUTE') then raise exception 'migration_rpc_grant_mismatch: ${signature}'; end if;`).join('\n')}
end; $postflight$;`;
}

export function buildBundle(migrations) {
  return `-- Generated by node scripts/migrate-database.mjs --write-bundle
-- Applies only Aug 28 + Sept 6 additions to the verified July schema.
-- Stops and rolls back on schema/data conflicts. Does not run restore SQL.
-- Stamp candidates remain inactive until the explicit catalogue sync.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '90s';
select pg_advisory_xact_lock(hashtext('dal-bbam-schema-migrations'));
${preflightSql(migrations)}
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
${migrations.map(migration => `-- ${migration.name} sha256=${migration.sha256}
do $apply_migration$ begin
if not exists (select 1 from supabase_migrations.schema_migrations where version=${literal(migration.version)}) then
${migration.sql}
insert into supabase_migrations.schema_migrations(version) values (${literal(migration.version)});
end if;
end; $apply_migration$;`).join('\n\n')}
${postflightSql(migrations)}
notify pgrst, 'reload schema';
commit;
`;
}

export async function connectionOptions(env = process.env) {
  const connectionString = env.DATABASE_URL?.trim() || env.SUPABASE_DB_URL?.trim();
  if (!connectionString) return null;
  let url;
  try { url = new URL(connectionString); } catch { throw new Error('migration_invalid_database_url'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || !url.password) throw new Error('migration_invalid_database_url');
  if ([...url.searchParams.keys()].some(key => ['host', 'port', 'user', 'password'].includes(key.toLowerCase()))) throw new Error('migration_connection_override_not_allowed');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && url.searchParams.get('sslmode') === 'disable') throw new Error('migration_remote_tls_required');
  // pg parses URL SSL options after config; remove them so certificate checks
  // cannot be disabled by sslmode=require or sslrejectunauthorized=false.
  for (const key of [...url.searchParams.keys()]) if (key.toLowerCase().startsWith('ssl')) url.searchParams.delete(key);
  const ca = env.DATABASE_SSL_CA_FILE ? await readFile(env.DATABASE_SSL_CA_FILE, 'utf8') : undefined;
  return { connectionString: url.href, ssl: local && !ca ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) }, connectionTimeoutMillis: 10_000, query_timeout: 120_000, application_name: 'dal-bbam-migration' };
}

export async function executeBundle(client, bundle) {
  try { await client.query(bundle); }
  catch (error) { await client.query('rollback').catch(() => {}); throw error; }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.some(arg => !['--plan', '--apply', '--write-bundle'].includes(arg)) || (args.includes('--plan') && args.includes('--apply'))) throw new Error('migration_invalid_arguments');
  const migrations = await loadMigrations();
  const bundle = buildBundle(migrations);
  if (args.includes('--write-bundle')) {
    await writeFile(new URL('supabase/apply-pending-2026-09-06.sql', root), bundle);
    console.log('Prepared supabase/apply-pending-2026-09-06.sql (no remote changes).');
    if (!args.includes('--apply') && !args.includes('--plan')) return;
  }
  const options = await connectionOptions();
  console.log(JSON.stringify({ mode: args.includes('--apply') ? 'apply' : 'read-only-plan', databaseConfigured: Boolean(options), migrations: migrations.map(({ name, sha256 }) => ({ name, sha256 })) }, null, 2));
  if (!options) {
    console.log('Configure DATABASE_URL or SUPABASE_DB_URL with a Postgres connection URI; the Supabase HTTPS API key is insufficient.');
    if (args.includes('--apply')) process.exitCode = 1;
    return;
  }
  let Client;
  try {
    const requireRuntime = createRequire(new URL('test-results/db-runtime/package.json', root));
    ({ Client } = requireRuntime('pg'));
  } catch { throw new Error('migration_install_pg_runtime: npm install --prefix test-results/db-runtime --no-save --ignore-scripts --no-audit --no-fund pg@8.16.3'); }
  const client = new Client(options);
  try {
    await client.connect();
    await client.query('begin read only');
    await client.query("set local statement_timeout = '15s'");
    await client.query(preflightSql(migrations));
    const historyExists = (await client.query("select to_regclass('supabase_migrations.schema_migrations') is not null as present")).rows[0].present;
    const history = historyExists ? (await client.query('select version from supabase_migrations.schema_migrations order by version')).rows.map(row => row.version) : [];
    await client.query('commit');
    const pending = migrations.filter(migration => !history.includes(migration.version)).map(migration => migration.name);
    console.log(JSON.stringify({ preflight: 'passed', recordedVersions: history, pending }, null, 2));
    if (args.includes('--apply')) {
      await executeBundle(client, bundle);
      console.log(JSON.stringify({ applied: pending, postflight: 'passed', schemaReload: 'notified' }));
    }
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally { await client.end().catch(() => {}); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    // Connection errors can contain credentials, hosts or private row values.
    console.error(error.message?.startsWith('migration_') ? error.message : `Database operation failed (${String(error.code ?? 'connection_or_query_error').replace(/[^A-Za-z0-9_]/g, '')}); verify remote migration state before retrying.`);
    process.exitCode = 1;
  });
}
