#!/usr/bin/env node
/**
 * Builds an installable Android APK that wraps the deployed PWA as a Trusted
 * Web Activity (Bubblewrap). Intended for on-device GPS/stamp testing.
 *
 *   node scripts/android-apk.mjs --host https://your-deployment.example
 *   node scripts/android-apk.mjs --host https://... --install   # adb install -r
 *
 * Options / environment:
 *   --host <url>        HTTPS origin the app opens (or ANDROID_TWA_HOST / https FRONTEND_URL)
 *   --package <id>      Android package id (default kr.dalbbam.gyeongju, or ANDROID_PACKAGE_ID)
 *   --name <text>       App name shown on the device (default: AI 경주)
 *   --version <x.y.z>   appVersion written into the manifest (default: package.json version)
 *   --install           Install the APK on the connected device with adb
 *   --skip-tools        Do not download/verify JDK 17 and the Android SDK (use what is configured)
 *   BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD  keystore passwords (default: dalbbam-debug)
 *   DAL_BBAM_ANDROID_TOOLS   where JDK 17 and the SDK are kept (default: ~/.dal-bbam-android)
 *
 * Every run rewrites android/twa/twa-manifest.json, regenerates the Android
 * project, builds, signs, and copies the APK and a debug assetlinks preview to
 * android/dist/. Production public/.well-known/assetlinks.json is never changed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BUBBLEWRAP_VERSION = '1.25.0';
const BUILD_TOOLS_VERSION = '36.1.0';
const PLATFORM_VERSION = 'android-36';
const CMDLINE_TOOLS_VERSION = '6609375';
const DEFAULT_PACKAGE_ID = 'kr.dalbbam.gyeongju';
const DEFAULT_APP_NAME = 'AI 경주';
const KEY_ALIAS = 'dalbbam';
const DEFAULT_KEY_PASSWORD = 'dalbbam-debug';
const SDK_LICENSES = {
  'android-sdk-license': ['8933bad161af4178b1185d1a37fbf41ea5269c55', 'd56f5187479451eabf01fb78af6dfcb131a6481e', '24333f8a63b6825ea9c5514f83c2829b004d1fee'],
  'android-sdk-preview-license': ['84831b9409646a918e30573bab4c9c91346d8abd']
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const androidDir = path.join(repoRoot, 'android');
const projectDir = path.join(androidDir, 'twa');
const distDir = path.join(androidDir, 'dist');
const keystorePath = path.join(androidDir, 'dal-bbam-debug.keystore');
const isWindows = process.platform === 'win32';

function log(message) {
  console.log(`[android-apk] ${message}`);
}

function fail(message) {
  console.error(`[android-apk] ${message}`);
  process.exit(1);
}

async function parseArgs(argv) {
  const args = { install: false, skipTools: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) fail(`${arg} requires a value`);
      index += 1;
      return value;
    };
    if (arg === '--host') args.host = next();
    else if (arg === '--package') args.packageId = next();
    else if (arg === '--name') args.name = next();
    else if (arg === '--version') args.version = next();
    else if (arg === '--install') args.install = true;
    else if (arg === '--skip-tools') args.skipTools = true;
    else if (arg.startsWith('--host=')) args.host = arg.slice(7);
    else if (arg.startsWith('--package=')) args.packageId = arg.slice(10);
    else if (arg.startsWith('--name=')) args.name = arg.slice(7);
    else if (arg.startsWith('--version=')) args.version = arg.slice(10);
    else if (arg === '--help' || arg === '-h') {
      console.log((await readFile(fileURLToPath(import.meta.url), 'utf8')).split('*/')[0]);
      process.exit(0);
    } else fail(`Unknown argument: ${arg}`);
  }
  return args;
}

function quoteBatchArgument(value) {
  // cmd.exe expands %VAR% even inside quotes. Reject values that cannot be
  // represented safely here; ordinary executable arguments never use a shell.
  if (/["%\r\n\0]/.test(value)) {
    throw new Error('Windows batch arguments cannot contain quotes, percent signs, or control characters.');
  }
  return `"${value}"`;
}

export function commandInvocation(command, args, windows = isWindows, environment = process.env) {
  if (!windows || !/\.(?:cmd|bat)$/i.test(command)) {
    return { file: command, args, options: { shell: false } };
  }
  const quotedArgs = args.map(quoteBatchArgument);
  quoteBatchArgument(command);
  // A quoted bare PATH name can make a batch file's %~dp0 resolve to cwd.
  // Resolve it first so npx.cmd can locate its own npm/bin directory.
  let batchFile = command;
  if (!/[\\/]/.test(command)) {
    const pathKey = Object.keys(environment).find(key => key.toUpperCase() === 'PATH');
    for (const directory of (environment[pathKey] ?? '').split(';').filter(Boolean)) {
      const candidate = path.join(directory.replace(/^"|"$/g, ''), command);
      if (existsSync(candidate)) {
        batchFile = path.resolve(candidate);
        break;
      }
    }
  }
  const batchCommand = [quoteBatchArgument(batchFile), ...quotedArgs].join(' ');
  return {
    file: process.env.ComSpec || 'cmd.exe',
    args: ['/d', '/v:off', '/s', '/c', `"${batchCommand}"`],
    options: { shell: false, windowsVerbatimArguments: true }
  };
}

export function formatCommandForLog(command, args) {
  let redactNext = false;
  const safeArgs = args.map(value => {
    if (redactNext) {
      redactNext = false;
      return '[redacted]';
    }
    if (/^--?(?:storepass|keypass|password)$/i.test(value)) redactNext = true;
    return value.replace(/^(--?(?:storepass|keypass|password))=.*/i, '$1=[redacted]');
  });
  return [command, ...safeArgs].join(' ');
}

export function keytoolPasswordOptions(passwords, includeKeyPassword = true) {
  return {
    args: [
      '-storepass:env', 'BUBBLEWRAP_KEYSTORE_PASSWORD',
      ...(includeKeyPassword ? ['-keypass:env', 'BUBBLEWRAP_KEY_PASSWORD'] : [])
    ],
    env: {
      BUBBLEWRAP_KEYSTORE_PASSWORD: passwords.keystore,
      ...(includeKeyPassword ? { BUBBLEWRAP_KEY_PASSWORD: passwords.key } : {})
    }
  };
}

// Runs a command asynchronously so the local icon server (and the event loop)
// keeps working while long-running tools such as Gradle execute.
function run(command, args, options = {}) {
  const pretty = formatCommandForLog(command, args);
  log(`$ ${pretty}`);
  const environment = { ...process.env, ...(options.env ?? {}) };
  const invocation = commandInvocation(command, args, isWindows, environment);
  return new Promise(resolve => {
    const child = spawn(invocation.file, invocation.args, {
      stdio: options.input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
      ...invocation.options,
      cwd: options.cwd,
      env: environment
    });
    if (options.input !== undefined) child.stdin.end(options.input);
    child.on('error', error => fail(`${pretty} failed: ${error.message}`));
    child.on('close', code => {
      if (code !== 0 && !options.allowFailure) fail(`${pretty} exited with code ${code}`);
      resolve(code);
    });
  });
}

function capture(command, args, options = {}) {
  const environment = { ...process.env, ...(options.env ?? {}) };
  const invocation = commandInvocation(command, args, isWindows, environment);
  const result = spawnSync(invocation.file, invocation.args, {
    encoding: 'utf8',
    ...invocation.options,
    cwd: options.cwd,
    env: environment
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function download(url, target) {
  log(`downloading ${url}`);
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) fail(`download failed (${response.status}) for ${url}`);
  await mkdir(path.dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  return target;
}

async function extractArchive(archive, destination) {
  await mkdir(destination, { recursive: true });
  if (archive.endsWith('.zip')) {
    if (isWindows) {
      await run('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        'Expand-Archive -LiteralPath $env:DAL_BBAM_ARCHIVE_PATH -DestinationPath $env:DAL_BBAM_EXTRACT_PATH -Force'
      ], { env: { DAL_BBAM_ARCHIVE_PATH: archive, DAL_BBAM_EXTRACT_PATH: destination } });
    } else {
      await run('unzip', ['-q', '-o', archive, '-d', destination], { shell: false });
    }
    return;
  }
  await run('tar', ['-xzf', archive, '-C', destination], { shell: false });
}

function javaExecutable(jdkHome) {
  return path.join(jdkHome, 'bin', isWindows ? 'java.exe' : 'java');
}

async function isJdk17(jdkHome) {
  if (!jdkHome || !existsSync(javaExecutable(jdkHome))) return false;
  try {
    const release = await readFile(path.join(jdkHome, 'release'), 'utf8');
    return /JAVA_VERSION="17\./.test(release);
  } catch {
    return false;
  }
}

async function findJdkInside(root) {
  if (!existsSync(root)) return null;
  if (await isJdk17(root)) return root;
  for (const entry of await readdir(root)) {
    const candidate = path.join(root, entry);
    if (!(await stat(candidate)).isDirectory()) continue;
    const macHome = path.join(candidate, 'Contents', 'Home');
    if (await isJdk17(macHome)) return macHome;
    if (await isJdk17(candidate)) return candidate;
  }
  return null;
}

async function ensureJdk17(toolsRoot) {
  for (const candidate of [process.env.DAL_BBAM_JDK17, process.env.JAVA17_HOME]) {
    if (candidate && await isJdk17(candidate)) return candidate;
  }
  const managed = path.join(toolsRoot, 'jdk17');
  const existing = await findJdkInside(managed);
  if (existing) return existing;

  const osName = isWindows ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
  const arch = process.arch === 'arm64' ? 'aarch64' : 'x64';
  const extension = isWindows ? 'zip' : 'tar.gz';
  const url = `https://api.adoptium.net/v3/binary/latest/17/ga/${osName}/${arch}/jdk/hotspot/normal/eclipse`;
  const archive = await download(url, path.join(toolsRoot, 'downloads', `temurin17.${extension}`));
  await extractArchive(archive, managed);
  const installed = await findJdkInside(managed);
  if (!installed) fail(`JDK 17 was downloaded but not found under ${managed}`);
  return installed;
}

function sdkManagerPath(sdkRoot) {
  return path.join(sdkRoot, 'tools', 'bin', isWindows ? 'sdkmanager.bat' : 'sdkmanager');
}

async function ensureAndroidSdk(toolsRoot, jdkHome) {
  const sdkRoot = path.join(toolsRoot, 'android-sdk');
  if (!existsSync(sdkManagerPath(sdkRoot))) {
    const platformName = isWindows ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux';
    const archive = await download(
      `https://dl.google.com/android/repository/commandlinetools-${platformName}-${CMDLINE_TOOLS_VERSION}_latest.zip`,
      path.join(toolsRoot, 'downloads', 'commandlinetools.zip')
    );
    await extractArchive(archive, sdkRoot);
  }

  const licenseDir = path.join(sdkRoot, 'licenses');
  await mkdir(licenseDir, { recursive: true });
  for (const [name, hashes] of Object.entries(SDK_LICENSES)) {
    await writeFile(path.join(licenseDir, name), `\n${hashes.join('\n')}\n`);
  }

  const missing = [
    [`build-tools;${BUILD_TOOLS_VERSION}`, path.join(sdkRoot, 'build-tools', BUILD_TOOLS_VERSION)],
    [`platforms;${PLATFORM_VERSION}`, path.join(sdkRoot, 'platforms', PLATFORM_VERSION)],
    ['platform-tools', path.join(sdkRoot, 'platform-tools')]
  ].filter(([, dir]) => !existsSync(dir)).map(([pkg]) => pkg);
  if (missing.length) {
    if (sdkRoot.includes(' ')) fail(`Android SDK path must not contain spaces: ${sdkRoot}. Set DAL_BBAM_ANDROID_TOOLS.`);
    await run(sdkManagerPath(sdkRoot), ['--install', ...missing, `--sdk_root=${sdkRoot}`], {
      env: { JAVA_HOME: jdkHome, ANDROID_HOME: sdkRoot },
      input: 'y\ny\ny\ny\n'
    });
  }
  return sdkRoot;
}

async function writeBubblewrapConfig(jdkPath, androidSdkPath) {
  const configDir = path.join(os.homedir(), '.bubblewrap');
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(configDir, 'config.json'), JSON.stringify({ jdkPath, androidSdkPath }, null, 2));
}

async function ensureKeystore(jdkHome, passwords) {
  if (existsSync(keystorePath)) return;
  log('creating a local debug keystore (not for Play Store releases)');
  const passwordOptions = keytoolPasswordOptions(passwords);
  await run(path.join(jdkHome, 'bin', isWindows ? 'keytool.exe' : 'keytool'), [
    '-genkeypair', '-v',
    '-keystore', keystorePath,
    '-alias', KEY_ALIAS,
    '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000',
    ...passwordOptions.args,
    '-dname', 'CN=Dal bbam Test, OU=Dev, O=Dal bbam, L=Gyeongju, C=KR'
  ], { env: passwordOptions.env });
}

function certificateFingerprint(jdkHome, passwords) {
  const passwordOptions = keytoolPasswordOptions(passwords, false);
  const result = capture(path.join(jdkHome, 'bin', isWindows ? 'keytool.exe' : 'keytool'), [
    '-list', '-v', '-keystore', keystorePath, '-alias', KEY_ALIAS, ...passwordOptions.args
  ], { env: passwordOptions.env });
  const match = result.stdout.match(/SHA256:\s*([0-9A-F:]{95})/i);
  return match ? match[1].toUpperCase() : null;
}

function serveIcons() {
  const publicDir = path.join(repoRoot, 'public');
  const server = createServer(async (request, response) => {
    const name = path.basename(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    if (!/^icon(-maskable)?-512\.png$/.test(name)) {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readFile(path.join(publicDir, name));
      response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': body.length }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ baseUrl: `http://127.0.0.1:${port}`, close: () => server.close() });
    });
  });
}

async function writeTwaManifest({ host, packageId, name, version, iconBase }) {
  const template = await readFile(path.join(androidDir, 'twa-manifest.template.json'), 'utf8');
  const manifest = template
    .replaceAll('__PACKAGE_ID__', packageId)
    .replaceAll('__HOST__', host)
    .replaceAll('__NAME__', name)
    .replaceAll('__LAUNCHER_NAME__', name)
    .replaceAll('__ICON_URL__', `${iconBase}/icon-512.png`)
    .replaceAll('__MASKABLE_ICON_URL__', `${iconBase}/icon-maskable-512.png`)
    .replaceAll('__KEYSTORE_PATH__', keystorePath.replaceAll('\\', '/'))
    .replaceAll('__KEY_ALIAS__', KEY_ALIAS)
    .replaceAll('__APP_VERSION__', version);
  await mkdir(projectDir, { recursive: true });
  const target = path.join(projectDir, 'twa-manifest.json');
  await writeFile(target, manifest);
  return target;
}

function bubblewrap(args, env) {
  return run(isWindows ? 'npx.cmd' : 'npx', ['--yes', `@bubblewrap/cli@${BUBBLEWRAP_VERSION}`, ...args], {
    cwd: projectDir,
    env
  });
}

export async function writeDebugAssetLinks(packageId, fingerprint, root = repoRoot) {
  const target = path.join(root, 'android', 'dist', 'assetlinks-debug.json');
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: { namespace: 'android_app', package_name: packageId, sha256_cert_fingerprints: [fingerprint] }
  }], null, 2)}\n`);
  return target;
}

function findAdb(sdkRoot) {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    sdkRoot,
    isWindows ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk') : path.join(os.homedir(), 'Android', 'Sdk'),
    path.join(os.homedir(), 'Library', 'Android', 'sdk')
  ].filter(Boolean);
  for (const root of candidates) {
    const adb = path.join(root, 'platform-tools', isWindows ? 'adb.exe' : 'adb');
    if (existsSync(adb)) return adb;
  }
  return null;
}

async function main() {
  const args = await parseArgs(process.argv.slice(2));
  const envFrontend = process.env.FRONTEND_URL?.startsWith('https://') ? process.env.FRONTEND_URL : undefined;
  const hostInput = args.host ?? process.env.ANDROID_TWA_HOST ?? envFrontend;
  if (!hostInput) {
    fail('Pass --host https://<deployed-origin> (a TWA needs an HTTPS origin; localhost cannot be used for GPS tests).');
  }
  let hostUrl;
  try {
    hostUrl = new URL(hostInput);
  } catch {
    fail(`--host is not a valid URL: ${hostInput}`);
  }
  if (hostUrl.protocol !== 'https:') fail('--host must be an https:// origin. Geolocation is blocked on insecure origins.');

  const packageId = args.packageId ?? process.env.ANDROID_PACKAGE_ID ?? DEFAULT_PACKAGE_ID;
  const appName = args.name ?? process.env.ANDROID_APP_NAME ?? DEFAULT_APP_NAME;
  const pkg = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'));
  const version = args.version ?? pkg.version ?? '1.0.0';
  const passwords = {
    keystore: process.env.BUBBLEWRAP_KEYSTORE_PASSWORD || DEFAULT_KEY_PASSWORD,
    key: process.env.BUBBLEWRAP_KEY_PASSWORD || DEFAULT_KEY_PASSWORD
  };
  const toolsRoot = process.env.DAL_BBAM_ANDROID_TOOLS || path.join(os.homedir(), '.dal-bbam-android');

  log(`host=${hostUrl.origin} package=${packageId} name=${appName} version=${version}`);

  let jdkHome;
  let sdkRoot;
  if (args.skipTools) {
    const config = JSON.parse(await readFile(path.join(os.homedir(), '.bubblewrap', 'config.json'), 'utf8').catch(() => '{}'));
    jdkHome = config.jdkPath;
    sdkRoot = config.androidSdkPath;
    if (!jdkHome || !sdkRoot) fail('--skip-tools needs an existing ~/.bubblewrap/config.json with jdkPath and androidSdkPath.');
  } else {
    jdkHome = await ensureJdk17(toolsRoot);
    log(`JDK 17: ${jdkHome}`);
    sdkRoot = await ensureAndroidSdk(toolsRoot, jdkHome);
    log(`Android SDK: ${sdkRoot}`);
    await writeBubblewrapConfig(jdkHome, sdkRoot);
  }

  await ensureKeystore(jdkHome, passwords);

  const icons = await serveIcons();
  try {
    const manifestPath = await writeTwaManifest({ host: hostUrl.host, packageId, name: appName, version, iconBase: icons.baseUrl });
    log(`twa-manifest: ${manifestPath}`);
    // Bubblewrap runs "gradlew.bat" by bare name through a shell. Some Windows
    // setups (NoDefaultCurrentDirectoryInExePath) do not search the current
    // directory, so put the project directory and the JDK on PATH explicitly.
    const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') ?? 'PATH';
    const env = {
      [pathKey]: [projectDir, path.join(jdkHome, 'bin'), process.env[pathKey] ?? ''].join(path.delimiter),
      JAVA_HOME: jdkHome,
      ANDROID_HOME: sdkRoot,
      BUBBLEWRAP_KEYSTORE_PASSWORD: passwords.keystore,
      BUBBLEWRAP_KEY_PASSWORD: passwords.key,
      CI: '1'
    };
    await bubblewrap(['update', '--skipVersionUpgrade'], env);
    await bubblewrap(['build', '--skipPwaValidation'], env);
  } finally {
    icons.close();
  }

  const builtApk = path.join(projectDir, 'app-release-signed.apk');
  if (!existsSync(builtApk)) fail(`expected ${builtApk} after the build`);
  await mkdir(distDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  const output = path.join(distDir, `dal-bbam-${hostUrl.hostname}-${stamp}.apk`);
  await copyFile(builtApk, output);
  log(`APK: ${output}`);

  const fingerprint = certificateFingerprint(jdkHome, passwords);
  if (fingerprint) {
    const assetLinks = await writeDebugAssetLinks(packageId, fingerprint);
    log(`debug certificate association preview: ${assetLinks} (${fingerprint}). Review it before publishing to a test host.`);
    log('Production public/.well-known/assetlinks.json was preserved.');
  } else {
    log('could not read the certificate fingerprint; no debug assetlinks preview was written.');
  }

  if (args.install) {
    const adb = findAdb(sdkRoot);
    if (!adb) fail('adb not found. Install Android platform-tools or set ANDROID_HOME.');
    await run(adb, ['install', '-r', output], { shell: false });
    log('installed on the connected device.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => fail(error instanceof Error ? error.stack ?? error.message : String(error)));
}
