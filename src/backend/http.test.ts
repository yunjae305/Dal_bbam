import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { isMutationAllowed } from '@/backend/http';

describe('mutation origin checks', () => {
  it('rejects cross-site browser requests', () => {
    const request = new NextRequest('https://dal-bbam.example/api/cart', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        'sec-fetch-site': 'cross-site'
      }
    });
    expect(isMutationAllowed(request)).toBe(false);
  });

  it('accepts same-origin requests', () => {
    const request = new NextRequest('https://dal-bbam.example/api/cart', {
      method: 'POST',
      headers: {
        origin: 'https://dal-bbam.example',
        'sec-fetch-site': 'same-origin'
      }
    });
    expect(isMutationAllowed(request)).toBe(true);
  });

  it('accepts requests whose origin matches the Host header even when nextUrl differs', () => {
    // dev server bound to 0.0.0.0: nextUrl reports the bind address, not the
    // address the browser used.
    const request = new NextRequest('http://0.0.0.0:3000/api/auth/demo', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        host: 'localhost:3000'
      }
    });
    expect(isMutationAllowed(request)).toBe(true);
  });

  it('accepts proxied requests via x-forwarded-host', () => {
    const request = new NextRequest('http://127.0.0.1:3000/api/cart', {
      method: 'POST',
      headers: {
        origin: 'https://dal-bbam.example',
        host: '127.0.0.1:3000',
        'x-forwarded-host': 'dal-bbam.example'
      }
    });
    expect(isMutationAllowed(request)).toBe(true);
  });

  it('rejects a foreign origin that matches neither host nor nextUrl', () => {
    const request = new NextRequest('http://localhost:3000/api/cart', {
      method: 'POST',
      headers: {
        origin: 'https://attacker.example',
        host: 'localhost:3000'
      }
    });
    expect(isMutationAllowed(request)).toBe(false);
  });
});
