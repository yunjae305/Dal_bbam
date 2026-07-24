import { describe, expect, it } from 'vitest';
import { hasCurrentLocationConsent, LOCATION_CONSENT_VERSION } from '@/shared/location-consent';

describe('location consent versioning', () => {
  it('accepts only an explicit grant for the current consent copy', () => {
    expect(hasCurrentLocationConsent({
      consent_version: LOCATION_CONSENT_VERSION,
      granted: true
    })).toBe(true);
    expect(hasCurrentLocationConsent({
      consent_version: LOCATION_CONSENT_VERSION,
      granted: false
    })).toBe(false);
    expect(hasCurrentLocationConsent({
      consent_version: 'location-v0',
      granted: true
    })).toBe(false);
  });
});
