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
  it('stops watching on cancellation and ignores queued fixes', async () => {
    vi.useFakeTimers();
    const { clearWatch } = installWatch([{ accuracy: 10, delayMs: 20 }]);
    const controller = new AbortController();
    const onSample = vi.fn();
    const pending = acquirePosition({ maxAccuracyMeters: 100, signal: controller.signal, onSample });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(30);
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(7);
    expect(onSample).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start watching an already cancelled request', async () => {
    const watchPosition = vi.fn();
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition } });
    const controller = new AbortController();
    controller.abort();
    await expect(acquirePosition({ maxAccuracyMeters: 100, signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(watchPosition).not.toHaveBeenCalled();
  });

  it('cleans up its deadline if starting the location watch throws', async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: () => { throw new Error('Native location unavailable'); } }
    });
    await expect(acquirePosition({ maxAccuracyMeters: 100 })).rejects.toThrow('Native location unavailable');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up when a native bridge returns a fix synchronously', async () => {
    vi.useFakeTimers();
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        clearWatch,
        watchPosition: (success: WatchSuccess) => {
          success({ coords: { latitude: 35.8, longitude: 129.2, accuracy: 10 }, timestamp: 1000 } as GeolocationPosition);
          return 9;
        }
      }
    });
    await expect(acquirePosition({ maxAccuracyMeters: 100 })).resolves.toMatchObject({ accuracy: 10 });
    expect(clearWatch).toHaveBeenCalledExactlyOnceWith(9);
    expect(vi.getTimerCount()).toBe(0);
  });

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
