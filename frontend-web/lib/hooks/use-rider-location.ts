'use client';

import { useEffect, useRef, useState } from 'react';
import { riderService } from '@/lib/services/rider.service';
import { API_BASE_URL } from '@/lib/config';
import { tokenStore } from '@/lib/token-store';
import { absoluteApiUrl, nativePlugins, type CapacitorHttpPlugin, type NativeWindow } from '@/lib/native-shell';

export type LocationSharing = 'off' | 'waiting' | 'sharing' | 'denied' | 'unavailable';

const MIN_INTERVAL_MS = 3_000; // the server keeps at most one position every 3 s
const STEADY_INTERVAL_MS = 10_000;
const MOVED_METERS = 30;

function metersBetween(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLng = (b.longitude - a.longitude) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/**
 * While the rider has jobs in progress and this page is open, shares the phone's position on
 * each of them: the customer sees it once the food is on its way, and arriving at the kitchen
 * or the customer's door moves the job on by itself (onAutoAdvance then reloads the jobs).
 * Sends every 10 s, or after 3 s once the rider has moved 30 m. Nothing is shared without a job.
 * Browsers only run this while the dashboard is in front: when the rider comes back from Google
 * Maps the watch is restarted and a fix sent at once, and the screen is kept awake meanwhile.
 * In the store app, once the rider agreed to it (`background`, after the disclosure in
 * BackgroundLocationNotice), the phone keeps reporting with the app in the background or the screen
 * locked, still only while there is a job: the watch ends with the last one. Android shows a
 * notification (`notice`) for as long as it runs, iOS its blue location bar.
 */
export function useRiderLocation(
  deliveryIds: string[],
  onAutoAdvance?: (status: string) => void,
  options: { background?: boolean; notice?: { title: string; message: string } } = {}
): LocationSharing {
  // What the current watch reported, tagged with the jobs it was for.
  const [reported, setReported] = useState<{ key: string; state: LocationSharing } | null>(null);
  const idsRef = useRef(deliveryIds);
  const advanceRef = useRef(onAutoAdvance);
  useEffect(() => {
    idsRef.current = deliveryIds;
    advanceRef.current = onAutoAdvance;
  });
  const noticeRef = useRef(options.notice);
  useEffect(() => {
    noticeRef.current = options.notice;
  });
  const key = [...deliveryIds].sort().join(',');
  const plugins = typeof window !== 'undefined' ? nativePlugins(window as unknown as NativeWindow) : null;
  const background = !!options.background && !!plugins?.BackgroundGeolocation;
  const supported = background || (typeof navigator !== 'undefined' && !!navigator.geolocation);

  useEffect(() => {
    if (!key || !supported) return;
    let last: { latitude: number; longitude: number; at: number } | null = null;
    let pending: { latitude: number; longitude: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const phone = background ? nativePlugins(window as unknown as NativeWindow) : null;
    const http = phone?.CapacitorHttp;
    const post = (id: string, here: { latitude: number; longitude: number }) =>
      http
        ? sendThroughPhone(http, id, here)
        : riderService.sendLocationUpdate(id, here.latitude, here.longitude).then((res) => res.data?.autoTriggeredStatus ?? null);
    const send = (here: { latitude: number; longitude: number }) => {
      last = { ...here, at: Date.now() };
      pending = null;
      for (const id of idsRef.current) {
        post(id, here)
          .then((triggered) => {
            if (triggered) advanceRef.current?.(triggered);
          })
          // A job that just finished or was cancelled stops accepting positions: harmless.
          .catch(() => {});
      }
    };

    // Throttled, but the latest position is never dropped: one that comes too soon is sent
    // once it is due (a rider who stops at the door still arrives).
    const consider = (here: { latitude: number; longitude: number }) => {
      if (!last) return send(here);
      const since = Date.now() - last.at;
      const due = metersBetween(last, here) >= MOVED_METERS ? MIN_INTERVAL_MS : STEADY_INTERVAL_MS;
      if (since >= due) return send(here);
      pending = here;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (pending) consider(pending);
      }, due - since);
    };

    // No fix after a while (GPS off, or the permission prompt ignored): say so instead of
    // "finding your location" forever. A fix arriving later switches it back to sharing.
    const slowTimer = setTimeout(() => {
      setReported((prev) => (prev?.key === key ? prev : { key, state: 'unavailable' }));
    }, 12_000);

    const sharing = () => setReported((prev) => (prev?.key === key && prev.state === 'sharing' ? prev : { key, state: 'sharing' }));

    if (phone?.BackgroundGeolocation) {
      // The phone's own watch: it goes on in the background, so no restart on return and no wake lock.
      const geo = phone.BackgroundGeolocation;
      const notice = noticeRef.current;
      let watcher: string | null = null;
      let stopped = false;
      void geo
        .addWatcher(
          { backgroundTitle: notice?.title, backgroundMessage: notice?.message ?? ' ', requestPermissions: true, stale: false, distanceFilter: 10 },
          (location, error) => {
            if (error) {
              setReported({ key, state: error.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable' });
              return;
            }
            if (!location) return;
            sharing();
            consider({ latitude: location.latitude, longitude: location.longitude });
          }
        )
        .then((id) => {
          if (stopped) void geo.removeWatcher({ id }).catch(() => {});
          else watcher = id;
        })
        .catch(() => setReported({ key, state: 'unavailable' }));
      return () => {
        stopped = true;
        clearTimeout(slowTimer);
        if (timer) clearTimeout(timer);
        if (watcher) void geo.removeWatcher({ id: watcher }).catch(() => {});
      };
    }

    const onPosition = (pos: GeolocationPosition) => {
      sharing();
      consider({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    };
    const onError = (err: GeolocationPositionError) => {
      if (err.code === err.PERMISSION_DENIED) setReported({ key, state: 'denied' });
      else if (err.code === err.POSITION_UNAVAILABLE) setReported({ key, state: 'unavailable' });
      // A timeout just means no fix yet; the watch keeps trying.
    };
    const WATCH_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 };
    let watchId = navigator.geolocation.watchPosition(onPosition, onError, WATCH_OPTIONS);

    // Keep the screen on while a job is running and the dashboard is in front: a phone that
    // locks itself stops reporting. Not granted (unsupported, low battery): the watch still runs.
    let wakeLock: WakeLockSentinel | null = null;
    const keepAwake = async () => {
      try {
        if (!navigator.wakeLock || wakeLock || document.visibilityState !== 'visible') return;
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          wakeLock = null;
        });
      } catch {
        wakeLock = null;
      }
    };
    void keepAwake();

    // Back on the dashboard (from Google Maps, the lock screen or another app): browsers pause
    // or drop a position watch while the page is hidden, so start a fresh one and send where
    // the rider is right away rather than waiting for the next movement.
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(onPosition, onError, WATCH_OPTIONS);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          sharing();
          send({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 }
      );
      void keepAwake();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearTimeout(slowTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      const held = wakeLock;
      wakeLock = null;
      held?.release().catch(() => {});
    };
  }, [key, supported, background]);

  if (!key) return 'off';
  if (!supported) return 'unavailable';
  return reported?.key === key ? reported.state : 'waiting';
}

/**
 * One position for one job, sent by the phone rather than the WebView: Android slows the WebView's requests down after
 * a few minutes in the background. An answer the phone cannot use as it is (the access token expired, say) goes
 * through the site's own client instead, which renews the token.
 */
async function sendThroughPhone(http: CapacitorHttpPlugin, deliveryId: string, here: { latitude: number; longitude: number }): Promise<string | null> {
  const path = `/riders/deliveries/${encodeURIComponent(deliveryId)}/location`;
  const token = tokenStore().access();
  const res = await http
    .request({
      url: absoluteApiUrl(API_BASE_URL, path, window.location.origin),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      data: here,
      connectTimeout: 15_000,
      readTimeout: 15_000,
    })
    .catch(() => null);
  if (res && res.status >= 200 && res.status < 300) {
    const body = (typeof res.data === 'string' ? safeJson(res.data) : res.data) as { data?: { autoTriggeredStatus?: string | null } } | null;
    return body?.data?.autoTriggeredStatus ?? null;
  }
  if (res && res.status !== 401) throw new Error(`Location not accepted (${res.status})`);
  const fallback = await riderService.sendLocationUpdate(deliveryId, here.latitude, here.longitude);
  return fallback.data?.autoTriggeredStatus ?? null;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
