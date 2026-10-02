'use client';

import { useEffect, useRef, useState } from 'react';
import { riderService } from '@/lib/services/rider.service';

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
 */
export function useRiderLocation(deliveryIds: string[], onAutoAdvance?: (status: string) => void): LocationSharing {
  // What the current watch reported, tagged with the jobs it was for.
  const [reported, setReported] = useState<{ key: string; state: LocationSharing } | null>(null);
  const idsRef = useRef(deliveryIds);
  const advanceRef = useRef(onAutoAdvance);
  useEffect(() => {
    idsRef.current = deliveryIds;
    advanceRef.current = onAutoAdvance;
  });
  const key = [...deliveryIds].sort().join(',');
  const supported = typeof navigator !== 'undefined' && !!navigator.geolocation;

  useEffect(() => {
    if (!key || !supported) return;
    let last: { latitude: number; longitude: number; at: number } | null = null;
    let pending: { latitude: number; longitude: number } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const send = (here: { latitude: number; longitude: number }) => {
      last = { ...here, at: Date.now() };
      pending = null;
      for (const id of idsRef.current) {
        riderService
          .sendLocationUpdate(id, here.latitude, here.longitude)
          .then((res) => {
            const triggered = res.data?.autoTriggeredStatus;
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

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setReported((prev) => (prev?.key === key && prev.state === 'sharing' ? prev : { key, state: 'sharing' }));
        consider({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) setReported({ key, state: 'denied' });
        else if (err.code === err.POSITION_UNAVAILABLE) setReported({ key, state: 'unavailable' });
        // A timeout just means no fix yet; the watch keeps trying.
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 }
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
    };
  }, [key, supported]);

  if (!key) return 'off';
  if (!supported) return 'unavailable';
  return reported?.key === key ? reported.state : 'waiting';
}
