import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { isolatedTestEnv } from '../../../../../scripts/test-environment';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('NODE_ENV', 'production');
  for (const [name, value] of Object.entries(isolatedTestEnv)) vi.stubEnv(name, value);
});
afterEach(() => vi.unstubAllEnvs());

const request = () => new NextRequest('http://127.0.0.1:3200/api/auth/demo', { method: 'POST' });

describe('production demo endpoint', () => {
  it('does not advertise or create production demo sessions without isolation', async () => {
    vi.stubEnv('DEMO_ISOLATED_TEST', '');
    const { GET, POST } = await import('./route');
    expect(await GET().json()).toEqual({ enabled: false });
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('does not issue an isolated test session when live credentials are present', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'configured-external-key');
    const { POST } = await import('./route');
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(response.headers.get('Set-Cookie')).toBeNull();
  });

  it('retains Secure HttpOnly cookies for the isolated production browser test', async () => {
    const { GET, POST } = await import('./route');
    expect(await GET().json()).toEqual({ enabled: true });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('Set-Cookie')).toMatch(/gy_session=/);
    expect(response.headers.get('Set-Cookie')).toMatch(/;\s*Secure(?:;|$)/i);
    expect(response.headers.get('Set-Cookie')).toMatch(/;\s*HttpOnly(?:;|$)/i);
  });
});
