import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { connectionOptions, executeBundle } from './migrate-database.mjs';

test('requires a Postgres URI instead of the public Supabase API URL', async () => {
  assert.equal(await connectionOptions({}), null);
  await assert.rejects(connectionOptions({ DATABASE_URL: 'https://project.example.test' }), /migration_invalid_database_url/);
  await assert.rejects(connectionOptions({ DATABASE_URL: 'postgresql://postgres@db.example.test/postgres' }), /migration_invalid_database_url/);
});

test('remote connection verifies the certificate even when URI SSL options try to override it', async () => {
  const options = await connectionOptions({ SUPABASE_DB_URL: 'postgresql://postgres:test-password@db.example.test/postgres?sslmode=require&sslrejectunauthorized=false' });
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(options.connectionString).search, '');
  await assert.rejects(connectionOptions({ DATABASE_URL: 'postgresql://postgres:test-password@db.example.test/postgres?sslmode=disable' }), /migration_remote_tls_required/);
});

test('plaintext SQL is limited to loopback connections', async () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal((await connectionOptions({ DATABASE_URL: `postgresql://postgres:test-password@${host}/postgres` })).ssl, false);
  }
  assert.deepEqual((await connectionOptions({ DATABASE_URL: 'postgresql://postgres:test-password@localhost.attacker.test/postgres' })).ssl, { rejectUnauthorized: true });
  await assert.rejects(connectionOptions({ DATABASE_URL: 'postgresql://postgres:test-password@localhost/postgres?host=db.example.test' }), /migration_connection_override_not_allowed/);
});

test('failed SQL attempts rollback and preserves the original failure', async () => {
  const failure = new Error('constraint failure');
  const queries = [];
  const client = { query: async sql => { queries.push(sql); if (queries.length === 1) throw failure; } };
  await assert.rejects(executeBundle(client, 'begin; test; commit;'), error => error === failure);
  assert.deepEqual(queries, ['begin; test; commit;', 'rollback']);
});

test('connection loss during rollback does not obscure the original failure', async () => {
  const failure = new Error('connection lost during batch');
  let calls = 0;
  const client = { query: async () => { calls += 1; throw calls === 1 ? failure : new Error('rollback connection lost'); } };
  await assert.rejects(executeBundle(client, 'begin; test; commit;'), error => error === failure);
  assert.equal(calls, 2);
});

test('default command is a read-only plan and --apply without a DB URI fails', () => {
  const env = { ...process.env, DATABASE_URL: '', SUPABASE_DB_URL: '' };
  const plan = spawnSync(process.execPath, ['scripts/migrate-database.mjs'], { encoding: 'utf8', env });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /"mode": "read-only-plan"/);
  const apply = spawnSync(process.execPath, ['scripts/migrate-database.mjs', '--apply'], { encoding: 'utf8', env });
  assert.equal(apply.status, 1);
  assert.match(apply.stdout, /"databaseConfigured": false/);
});
