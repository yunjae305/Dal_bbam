import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  commandInvocation,
  formatCommandForLog,
  keytoolPasswordOptions,
  writeDebugAssetLinks
} from './android-apk.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(repoRoot, 'test-results', 'android-tools');

async function fixtureDirectory(prefix) {
  await mkdir(fixtureRoot, { recursive: true });
  return mkdtemp(path.join(fixtureRoot, prefix));
}

test('native executables receive literal argv without a shell on every platform', () => {
  const values = ['with spaces', 'a&b', '(round)', 'quote"kept', '%PATH%', 'bang!kept', '한글 경주', 'C:\\a b\\'];
  for (const windows of [true, false]) {
    const invocation = commandInvocation(process.execPath, [
      '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', ...values
    ], windows);
    assert.equal(invocation.options.shell, false);
    const child = spawnSync(invocation.file, invocation.args, { ...invocation.options, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), values);
  }
});

test('Windows batch commands use a bounded cmd launcher with expansion disabled', () => {
  const invocation = commandInvocation('C:\\Android Tools\\sdkmanager.bat', ['--install', 'build-tools;36.1.0'], true);
  assert.equal(invocation.options.shell, false);
  assert.equal(invocation.options.windowsVerbatimArguments, true);
  assert.deepEqual(invocation.args.slice(0, 4), ['/d', '/v:off', '/s', '/c']);
  assert.equal(invocation.args[4], '""C:\\Android Tools\\sdkmanager.bat" "--install" "build-tools;36.1.0""');
  for (const value of ['%PATH%', 'quote"break', 'line\nbreak', 'line\rbreak', 'nul\0byte']) {
    assert.throws(() => commandInvocation('npx.cmd', [value], true), /Windows batch arguments/);
    assert.throws(() => commandInvocation(`C:\\${value}\\npx.cmd`, [], true), /Windows batch arguments/);
  }
});

test('Windows batch launch resolves PATH and preserves spaces and metacharacters in real argv', {
  skip: process.platform !== 'win32' ? 'cmd.exe is only available on Windows' : false
}, async () => {
  const directory = await fixtureDirectory('batch path with spaces-');
  const script = path.join(directory, 'echo arguments.cmd');
  await writeFile(path.join(directory, 'echo-args.mjs'), 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');
  await writeFile(script, `@echo off\r\n"${process.execPath}" "%~dp0echo-args.mjs" %*\r\n`);
  const values = ['with spaces', 'rock&roll', '(round)', 'care^t', 'a|b', '<input>', 'semi;colon', 'bang!kept', '', '한글 경주'];
  const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
  const environment = { ...process.env, [pathKey]: `${directory};${process.env[pathKey] ?? ''}` };
  for (const command of [script, path.basename(script)]) {
    const invocation = commandInvocation(command, values, true, environment);
    const child = spawnSync(invocation.file, invocation.args, { ...invocation.options, env: environment, encoding: 'utf8' });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout), values);
  }
});

test('keytool passwords are supplied through environment variables and excluded from logs and argv', () => {
  const passwords = { keystore: 'store-secret-123', key: 'key-secret-456' };
  const create = keytoolPasswordOptions(passwords);
  assert.deepEqual(create.env, {
    BUBBLEWRAP_KEYSTORE_PASSWORD: passwords.keystore,
    BUBBLEWRAP_KEY_PASSWORD: passwords.key
  });
  assert.deepEqual(create.args, ['-storepass:env', 'BUBBLEWRAP_KEYSTORE_PASSWORD', '-keypass:env', 'BUBBLEWRAP_KEY_PASSWORD']);
  const inspect = keytoolPasswordOptions(passwords, false);
  assert.deepEqual(inspect.args, ['-storepass:env', 'BUBBLEWRAP_KEYSTORE_PASSWORD']);
  assert.equal(inspect.env.BUBBLEWRAP_KEY_PASSWORD, undefined);
  const log = formatCommandForLog('keytool', ['-genkeypair', ...create.args]);
  for (const secret of Object.values(passwords)) {
    assert.ok(!log.includes(secret));
    assert.ok(!create.args.includes(secret));
  }
  assert.equal(formatCommandForLog('keytool', ['-storepass', passwords.keystore, '-keypass', passwords.key]),
    'keytool -storepass [redacted] -keypass [redacted]');
  assert.equal(formatCommandForLog('tool', [`--password=${passwords.key}`]), 'tool --password=[redacted]');
});

test('debug association output preserves every existing production association byte for byte', async () => {
  const directory = await fixtureDirectory('assetlinks-');
  const productionFile = path.join(directory, 'public', '.well-known', 'assetlinks.json');
  const production = JSON.stringify([
    { target: { namespace: 'android_app', package_name: 'kr.production.app', sha256_cert_fingerprints: ['RELEASE-KEY'] } },
    { target: { namespace: 'web', site: 'https://production.example' } }
  ], null, 2) + '\n';
  await mkdir(path.dirname(productionFile), { recursive: true });
  await writeFile(productionFile, production);
  const output = await writeDebugAssetLinks('kr.debug.app', 'DEBUG-CERTIFICATE', directory);
  assert.equal(output, path.join(directory, 'android', 'dist', 'assetlinks-debug.json'));
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: 'kr.debug.app', sha256_cert_fingerprints: ['DEBUG-CERTIFICATE'] }
  }]);
  assert.equal(await readFile(productionFile, 'utf8'), production);
  await writeDebugAssetLinks('kr.debug.app', 'REPLACEMENT-DEBUG-CERTIFICATE', directory);
  assert.equal(await readFile(productionFile, 'utf8'), production);
});
