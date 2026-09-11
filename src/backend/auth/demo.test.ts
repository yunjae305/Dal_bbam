import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedTestEnv } from '../../../scripts/test-environment';
import { isDemoModeEnabled, isIsolatedDemoTestEnvironment } from './demo';

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'production');
  for (const [name, value] of Object.entries(isolatedTestEnv)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

describe('production demo isolation', () => {
  it('allows the explicit credential-free loopback production test harness', () => {
    expect(isIsolatedDemoTestEnvironment()).toBe(true);
    expect(isDemoModeEnabled()).toBe(true);
  });

  it('rejects a production demo account without the isolation marker', () => {
    vi.stubEnv('DEMO_ISOLATED_TEST', '');
    expect(isDemoModeEnabled()).toBe(false);
  });

  it.each(Object.entries(isolatedTestEnv).filter(([, value]) => value === '').map(([name]) => name))(
    'rejects a production test marker accompanied by %s', name => {
      vi.stubEnv(name, 'configured-external-value');
      expect(isIsolatedDemoTestEnvironment()).toBe(false);
      expect(isDemoModeEnabled()).toBe(false);
    }
  );

  it.each(['https://travel.example', 'https://localhost.example', 'http://user:password@localhost', 'file://localhost', '', 'invalid'])('rejects non-loopback frontend configuration %s', origin => {
    vi.stubEnv('FRONTEND_URL', origin);
    expect(isDemoModeEnabled()).toBe(false);
  });

  it('requires demo mode and account configuration even in an isolated harness', () => {
    vi.stubEnv('DEMO_MODE_ENABLED', 'false');
    expect(isDemoModeEnabled()).toBe(false);
    vi.stubEnv('DEMO_MODE_ENABLED', 'true');
    vi.stubEnv('DEMO_PASSWORD', '');
    expect(isDemoModeEnabled()).toBe(false);
  });

  it('preserves explicitly enabled development demos without granting production access', () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('DEMO_ISOLATED_TEST', '');
    expect(isDemoModeEnabled()).toBe(true);
  });
});
