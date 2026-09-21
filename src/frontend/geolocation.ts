export type PositionSample = {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
};

export type AcquirePositionOptions = {
  maxAccuracyMeters: number;
  timeoutMs?: number;
  onSample?: (sample: PositionSample) => void;
  signal?: AbortSignal;
};

export class GeolocationAcquireError extends Error {
  constructor(
    public readonly code: 'unsupported' | 'denied' | 'unavailable' | 'timeout',
    message: string
  ) {
    super(message);
    this.name = 'GeolocationAcquireError';
  }
}

function toSample(position: GeolocationPosition): PositionSample {
  return {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: position.coords.accuracy,
    timestamp: position.timestamp
  };
}

/**
 * Watches the GPS until a fix meets the accuracy requirement, or the deadline
 * passes. The first fix on a phone is often a coarse network fix (hundreds of
 * metres) that the stamp API rejects, so waiting for a better sample makes
 * on-site verification far more reliable. When the deadline passes the best
 * sample seen so far is returned so the server can still judge it.
 */
export function acquirePosition({
  maxAccuracyMeters,
  timeoutMs = 15_000,
  onSample,
  signal
}: AcquirePositionOptions): Promise<PositionSample> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Location request cancelled.', 'AbortError'));
      return;
    }
    const geolocation = typeof navigator === 'undefined' ? undefined : navigator.geolocation;
    if (!geolocation) {
      reject(new GeolocationAcquireError('unsupported', 'Geolocation is not supported.'));
      return;
    }

    let best: PositionSample | null = null;
    let watchId: number | null = null;
    let settled = false;
    let lastError: GeolocationPositionError | null = null;

    const finish = (outcome: { sample: PositionSample } | { error: Error }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      signal?.removeEventListener('abort', abort);
      if (watchId !== null) geolocation.clearWatch(watchId);
      if ('sample' in outcome) resolve(outcome.sample);
      else reject(outcome.error);
    };

    const abort = () => finish({ error: new DOMException('Location request cancelled.', 'AbortError') });

    const deadline = window.setTimeout(() => {
      if (best) {
        finish({ sample: best });
        return;
      }
      finish({
        error: lastError && lastError.code === lastError.POSITION_UNAVAILABLE
          ? new GeolocationAcquireError('unavailable', 'Position unavailable.')
          : new GeolocationAcquireError('timeout', 'Timed out waiting for a GPS fix.')
      });
    }, timeoutMs);

    signal?.addEventListener('abort', abort, { once: true });
    try {
      watchId = geolocation.watchPosition(position => {
        if (settled) return;
        const sample = toSample(position);
        if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lng)) return;
        onSample?.(sample);
        if (settled) return;
        if (!best || (Number.isFinite(sample.accuracy) && sample.accuracy < best.accuracy)) best = sample;
        if (Number.isFinite(sample.accuracy) && sample.accuracy > 0 && sample.accuracy <= maxAccuracyMeters) {
          finish({ sample });
        }
      }, error => {
        if (settled) return;
        lastError = error;
        if (error.code === error.PERMISSION_DENIED) {
          finish({ error: new GeolocationAcquireError('denied', 'Location permission denied.') });
        }
      }, {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: timeoutMs
      });
      // Test doubles and native bridges can invoke callbacks synchronously.
      if (settled) geolocation.clearWatch(watchId);
    } catch (error) {
      finish({ error: error instanceof Error ? error : new GeolocationAcquireError('unavailable', 'Position unavailable.') });
    }
  });
}
