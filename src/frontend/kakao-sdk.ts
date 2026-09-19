let loading: Promise<void> | null = null;

/** One SDK load for both the explorer and itinerary, including a bounded maps.load callback. */
export function loadKakaoMaps(): Promise<void> {
  if (window.kakao?.maps?.Map && window.kakao.maps.LatLng) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const key = process.env.NEXT_PUBLIC_KAKAO_MAP_JS_KEY;
    if (!key) { reject(new Error('Map unavailable')); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-map-sdk]');
    const script = existing ?? document.createElement('script');
    let completed = false;
    const finish = (error?: Error) => {
      if (completed) return;
      completed = true;
      window.clearTimeout(timeout);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      if (error) { script.remove(); reject(error); } else resolve();
    };
    const onError = () => finish(new Error('Map unavailable'));
    const onLoad = () => {
      if (!window.kakao?.maps?.load) { onError(); return; }
      try { window.kakao.maps.load(() => finish()); } catch { onError(); }
    };
    const timeout = window.setTimeout(onError, 8_000);
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (window.kakao?.maps?.load) onLoad();
    else if (!existing) {
      script.dataset.kakaoMapSdk = 'true';
      script.async = true;
      script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false&libraries=clusterer`;
      document.head.appendChild(script);
    }
  }).finally(() => { loading = null; });
  return loading;
}
