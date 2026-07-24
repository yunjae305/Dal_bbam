export const LOCATION_CONSENT_VERSION = 'location-v1-2026-07-24';

export type LocationConsentRecord = {
  consent_version?: string | null;
  granted?: boolean | null;
  created_at?: string | null;
};

export function hasCurrentLocationConsent(record: LocationConsentRecord | null | undefined): boolean {
  return record?.consent_version === LOCATION_CONSENT_VERSION && record.granted === true;
}
