type ConsentPayload = {
  data?: {
    version?: string;
    consent_version?: string;
    granted?: boolean | null;
    created_at?: string | null;
  };
  error?: { code?: string; message?: string };
};

const SESSION_KEY = 'dal-bbam-location-consent';

function readSessionConsent(): boolean | null {
  try {
    const value = window.sessionStorage.getItem(SESSION_KEY);
    return value === 'true' ? true : value === 'false' ? false : null;
  } catch {
    return null;
  }
}

function writeSessionConsent(granted: boolean) {
  try {
    window.sessionStorage.setItem(SESSION_KEY, String(granted));
  } catch {
    // Session storage can be unavailable (private mode); the server record is authoritative anyway.
  }
}

/**
 * Reads the recorded consent. When the consent service itself is unavailable
 * (503, network error) the answer given earlier in this browser session is
 * reused so the map can still ask the browser for a position; stamp
 * verification always re-checks the server-side record.
 */
export async function readLocationConsent(): Promise<boolean | null> {
  let response: Response;
  try {
    response = await fetch('/api/location-consent', { cache: 'no-store' });
  } catch {
    return readSessionConsent();
  }
  const payload = await response.json().catch(() => null) as ConsentPayload | null;
  if (!response.ok) {
    if (response.status >= 500) return readSessionConsent();
    throw new Error(payload?.error?.message ?? '위치정보 동의를 확인하지 못했습니다.');
  }
  const granted = typeof payload?.data?.granted === 'boolean' ? payload.data.granted : null;
  if (granted !== null) writeSessionConsent(granted);
  return granted;
}

export async function saveLocationConsent(granted: boolean): Promise<boolean> {
  let response: Response;
  try {
    response = await fetch('/api/location-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ granted })
    });
  } catch {
    writeSessionConsent(granted);
    return granted;
  }
  const payload = await response.json().catch(() => null) as ConsentPayload | null;
  if (!response.ok) {
    if (response.status >= 500) {
      console.warn('[location-consent] service unavailable, keeping the answer for this session only');
      writeSessionConsent(granted);
      return granted;
    }
    throw new Error(payload?.error?.message ?? '위치정보 동의를 저장하지 못했습니다.');
  }
  writeSessionConsent(Boolean(payload?.data?.granted));
  return Boolean(payload?.data?.granted);
}
