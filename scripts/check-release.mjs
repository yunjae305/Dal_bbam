// Read-only release prerequisites. No migrations, uploads, accounts or messages.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { publicHttpsUrl, validateReleaseConfiguration } from '../src/shared/release-configuration.ts';

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));

export function parseReleaseArgs(args) {
  const options = { configurationOnly: false, baseUrl: undefined, help: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--configuration-only') options.configurationOnly = true;
    else if (args[index] === '--help') options.help = true;
    else if (args[index] === '--base-url' && args[index + 1] && !args[index + 1].startsWith('--')) options.baseUrl = args[++index];
    else throw new Error('Use --configuration-only, --base-url <HTTPS origin>, or --help.');
  }
  if (options.configurationOnly && options.baseUrl) throw new Error('A deployed check requires the full prerequisite check.');
  return options;
}

async function probeProviders(env) {
  let output;
  try {
    output = await execFileAsync(process.execPath, [fileURLToPath(new URL('./verify-providers.mjs', import.meta.url))], {
      cwd: root, env, encoding: 'utf8', windowsHide: true, timeout: 45_000, maxBuffer: 2_000_000
    });
  } catch (error) {
    // A failing readiness probe deliberately exits 1 and still returns its JSON.
    if (!error.killed && error.code === 1 && error.stdout) output = { stdout: error.stdout };
    else return null;
  }
  try { return JSON.parse(output.stdout); } catch { return null; }
}

function providerSummary(value) {
  if (!value || typeof value !== 'object') return { operational: false };
  const summary = {};
  for (const key of ['configured', 'operational', 'reachable', 'schemaReady', 'storageReady', 'contentReady']) {
    if (typeof value[key] === 'boolean') summary[key] = value[key];
  }
  return summary;
}

export async function checkRelease(env, options = {}, dependencies = {}) {
  const configuration = validateReleaseConfiguration(env);
  const report = {
    checkedAt: new Date().toISOString(), readOnly: true,
    scope: options.configurationOnly ? 'configuration' : options.baseUrl ? 'deployment-prerequisites-and-health' : 'deployment-prerequisites',
    ready: false, configuration, providers: {}, deployedHealth: null,
    issues: [...configuration.issues],
    // Passing prerequisites does not prove real email/OAuth/GPS/AI or store review.
    verification: { actualUserFlows: 'not_run', remoteWrites: 'not_run', deploymentPerformed: false }
  };
  if (options.configurationOnly) {
    report.ready = configuration.ready;
    return report;
  }

  const probe = await (dependencies.probeProviders ?? probeProviders)(env);
  // The AI slot is whichever provider is configured: Gemini when its key is set.
  const aiProvider = env.GEMINI_API_KEY?.trim() ? 'gemini' : 'openai';
  const required = ['database', 'tourApi', 'kakao', ...(env.FEATURE_AI?.trim().toLowerCase() === 'true' ? [aiProvider] : [])];
  for (const name of required) {
    const value = probe?.providers?.[name];
    report.providers[name] = providerSummary(value);
    if (value?.operational !== true) report.issues.push({ code: 'PROVIDER_NOT_READY', fields: [name], message: '실제 서비스 연결 또는 운영 선행 조건을 확인하지 못했습니다. test:providers 결과를 확인하세요.' });
  }
  for (const key of ['schemaReady', 'storageReady', 'contentReady']) {
    if (probe?.providers?.database?.[key] !== true) {
      report.issues.push({ code: `DATABASE_${key.replace('Ready', '').toUpperCase()}_NOT_READY`, fields: [key], message: 'DB 접속과 별개로 스키마·저장소·출시 콘텐츠 준비를 완료해야 합니다.' });
    }
  }

  if (options.baseUrl) {
    const target = publicHttpsUrl(options.baseUrl);
    const configured = publicHttpsUrl(env.FRONTEND_URL);
    if (!target || target.origin !== configured?.origin || target.pathname !== '/' || target.search || target.hash) {
      report.issues.push({ code: 'DEPLOYMENT_ORIGIN_MISMATCH', fields: ['FRONTEND_URL'], message: '배포 검사는 설정된 운영 HTTPS 오리진에서만 실행합니다.' });
      report.deployedHealth = { verified: false };
    } else {
      try {
        const response = await (dependencies.fetch ?? fetch)(new URL('/api/health', target), {
          headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(20_000)
        });
        const payload = await response.json();
        const verified = response.status === 200 && payload.ok === true && payload.configuration?.release?.ready === true
          && ['database', 'databaseSchema', 'storage', 'launchContent', 'releaseConfiguration'].every(key => payload.readiness?.[key] === true);
        report.deployedHealth = { verified, httpStatus: response.status };
        if (!verified) report.issues.push({ code: 'DEPLOYED_HEALTH_NOT_READY', fields: ['/api/health'], message: '배포된 앱의 운영 상태 검사를 통과하지 못했습니다.' });
      } catch {
        report.deployedHealth = { verified: false };
        report.issues.push({ code: 'DEPLOYED_HEALTH_UNREACHABLE', fields: ['/api/health'], message: '배포된 앱의 HTTPS 상태 응답을 확인하지 못했습니다.' });
      }
    }
  }
  report.ready = report.issues.length === 0;
  return report;
}

async function main() {
  const options = parseReleaseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('node scripts/check-release.mjs [--configuration-only | --base-url <configured HTTPS origin>]\nRead-only prerequisites; exit 1 means not ready. Does not deploy or execute database writes.');
    return;
  }
  const { loadEnvConfig } = createRequire(import.meta.url)('@next/env');
  loadEnvConfig(root, false, { info() {}, error() {} });
  const report = await checkRelease(process.env, options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ready) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(() => {
    console.error('Release check failed. Use --help for supported arguments; no writes were performed.');
    process.exitCode = 1;
  });
}
