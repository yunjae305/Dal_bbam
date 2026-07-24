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
});
