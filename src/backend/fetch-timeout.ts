const DEFAULT_PROVIDER_TIMEOUT_MS = 3_000;

function boundedTimeout(value: string | undefined, fallback = DEFAULT_PROVIDER_TIMEOUT_MS): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(15_000, Math.max(500, parsed)) : fallback;
}

export const providerRequestTimeoutMs = boundedTimeout(
  process.env.PROVIDER_REQUEST_TIMEOUT_MS
);

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = providerRequestTimeoutMs
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  return fetch(input, { ...init, signal });
}

