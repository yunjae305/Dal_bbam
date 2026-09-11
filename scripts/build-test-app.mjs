import { spawnSync } from 'node:child_process';
import { isolatedTestEnv } from './test-environment.ts';

const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
  cwd: new URL('../', import.meta.url), env: { ...process.env, ...isolatedTestEnv }, stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
