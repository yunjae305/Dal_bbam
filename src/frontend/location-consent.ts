type ConsentPayload = {
  data?: {
    version?: string;
    consent_version?: string;
    granted?: boolean | null;
    created_at?: string | null;
  };
  error?: { message?: string };
};

export async function readLocationConsent(): Promise<boolean | null> {
  const response = await fetch('/api/location-consent', { cache: 'no-store' });
  const payload = await response.json() as ConsentPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? '위치정보 동의를 확인하지 못했습니다.');
  }
  return typeof payload.data?.granted === 'boolean' ? payload.data.granted : null;
}

export async function saveLocationConsent(granted: boolean): Promise<boolean> {
  const response = await fetch('/api/location-consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ granted })
  });
  const payload = await response.json() as ConsentPayload;
  if (!response.ok) {
    throw new Error(payload.error?.message ?? '위치정보 동의를 저장하지 못했습니다.');
  }
  return Boolean(payload.data?.granted);
}
