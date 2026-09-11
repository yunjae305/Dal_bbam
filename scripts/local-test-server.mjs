import { createServer } from 'node:net';

export async function assertPortAvailable(port, hostname = '127.0.0.1') {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Use a valid local test port (1–65535).');
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => reject(new Error(`Cannot start isolated tests on ${hostname}:${port}: ${error.code}. Stop the existing listener or choose another port.`, { cause: error })));
    probe.listen({ host: hostname, port, exclusive: true }, () => probe.close(error => error ? reject(error) : resolve()));
  });
}

export function monitorLocalServer(server) {
  let output = '';
  let ready = false;
  let failure;
  const capture = chunk => {
    output = (output + String(chunk)).slice(-16_000);
    // Next's owned process emits this after binding its listening socket.
    // Waiting for it closes the race between our port probe and spawn: another
    // process cannot impersonate readiness if this child exits with EADDRINUSE.
    if (/Ready in\s/.test(output)) ready = true;
  };
  server.stdout?.on('data', capture);
  server.stderr?.on('data', capture);
  server.on('error', error => { failure = error; });
  return {
    get ready() { return ready; },
    get output() { return output; },
    assertRunning() {
      if (failure) throw new Error(`Local test server could not start: ${failure.message}`, { cause: failure });
      if (server.exitCode !== null || server.signalCode !== null) throw new Error(`Local test server exited early.\n${output}`);
    }
  };
}

export async function waitForLocalServer(server, monitor, url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    monitor.assertRunning();
    if (monitor.ready) {
      try {
        const response = await fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(Math.max(1, Math.min(3000, deadline - Date.now())))
        });
        await response.arrayBuffer();
        monitor.assertRunning();
        if (response.status >= 200 && response.status < 400) return;
      } catch {
        monitor.assertRunning();
      }
    }
    await new Promise(resolve => setTimeout(resolve, Math.max(1, Math.min(250, deadline - Date.now()))));
  }
  throw new Error(`Timed out waiting for the isolated production server. Run npm run build:test first.\n${monitor.output}`);
}

export async function stopLocalServer(server) {
  if (!server || server.exitCode !== null || server.signalCode !== null || !server.pid) return;
  await new Promise((resolve, reject) => {
    let timer;
    const finish = error => {
      clearTimeout(timer);
      server.removeListener('exit', onExit);
      server.removeListener('error', onError);
      if (error) reject(error); else resolve();
    };
    const onExit = () => finish();
    const onError = error => finish(error);
    server.once('exit', onExit);
    server.once('error', onError);
    timer = setTimeout(() => {
      try {
        server.kill('SIGKILL');
        timer = setTimeout(() => finish(new Error('Local test server did not exit after termination.')), 2000);
      } catch (error) { finish(error); }
    }, 3000);
    try { server.kill('SIGTERM'); } catch (error) { finish(error); }
  });
}
