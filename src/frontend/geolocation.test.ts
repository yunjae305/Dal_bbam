// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { acquirePosition } from '@/frontend/geolocation';

type WatchSuccess = (position: GeolocationPosition) => void;

function installWatch(samples: Array<{ accuracy: number; delayMs: number }>) {
  const clearWatch = vi.fn();
  const timers: number[] = [];
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      clearWatch,
      watchPosition: (success: WatchSuccess) => {
        samples.forEach((sample, index) => {
          timers.push(window.setTimeout(() => success({
            coords: { latitude: 35.8 + index * 0.001, longitude: 129.2, accuracy: sample.accuracy },
            timestamp: 1_000 + index
          } as GeolocationPosition), sample.delayMs));
        });
        return 7;
      }
    }
  });
  return { clearWatch, timers };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('acquirePosition', () => {
  it('resolves with the first sample that satisfies the accuracy requirement', async () => {
    vi.useFakeTimers();
    const { clearWatch } = installWatch([
      { accuracy: 900, delayMs: 10 },
      { accuracy: 40, delayMs: 20 },
      { accuracy: 5, delayMs: 30 }
    ]);
    const onSample = vi.fn();
    const pending = acquirePosition({ maxAccuracyMeters: 100, timeoutMs: 5_000, onSample });
    await vi.advanceTimersByTimeAsync(25);
    const sample = await pending;

    expect(sample.accuracy).toBe(40);
    expect(onSample).toHaveBeenCalledTimes(2);
    expect(clearWatch).toHaveBeenCalledWith(7);
  });

  it('falls back to the most accurate sample seen when the deadline passes', async () => {
    vi.useFakeTimers();
    installWatch([
      { accuracy: 900, delayMs: 10 },
      { accuracy: 300, delayMs: 20 }
    ]);
    const pending = acquirePosition({ maxAccuracyMeters: 100, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(120);

    await expect(pending).resolves.toMatchObject({ accuracy: 300 });
  });
});
