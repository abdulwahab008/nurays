'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from './use-socket';
import { eventReloadDelay, nextPollDelay } from '../realtime/backoff';

/** Bursts of events within this long become one reload. */
const COALESCE_MS = 250;
/**
 * After a reconnection every client of a restarted server catches up: each waits a random part of this long
 * first, so the reloads arrive over seconds instead of all in the same instant.
 */
const CATCH_UP_SPREAD_MS = 5_000;
/** Coming back to a tab reloads only when the last reload is older than this. */
const FRESH_FOR_MS = 15_000;

interface LiveRefreshOptions {
  /** Socket events after which the data may have changed. */
  events: string[];
  /** Only react to events this returns true for (e.g. those about the order on screen). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  match?: (data: any) => boolean;
  /**
   * Safety-net reload interval while the realtime connection is up, for changes that send
   * no event. While it is down the first reload comes after `offlineMs` (or `intervalMs` if sooner)
   * and the wait then doubles up to `offlineMaxMs` (see nextPollDelay).
   */
  intervalMs?: number;
  offlineMs?: number;
  offlineMaxMs?: number;
  /** At most one event-driven reload this often: the first after a quiet spell is not held back, later ones wait their turn. */
  coalesceMs?: number;
  /** Off: no reloading at all (nothing on screen yet, or nothing left that can change). */
  enabled?: boolean;
  /**
   * Reload only when one of `events` arrives: not after a reconnection, not when the tab comes back, not on
   * a timer. For a second, narrower refresh next to a full one that already does all of those.
   */
  eventsOnly?: boolean;
}

/**
 * Keep a screen current without hammering the API: `refresh` runs when a matching socket event
 * arrives (bursts are coalesced), after the connection comes back (to catch up on anything
 * missed), when the tab becomes visible again, and on a slow timer as a safety net. Timers
 * never run while the tab is hidden.
 */
export function useLiveRefresh(refresh: () => void, options: LiveRefreshOptions) {
  const {
    events,
    match,
    intervalMs = 60_000,
    offlineMs = 30_000,
    offlineMaxMs = Math.max(intervalMs, 120_000),
    coalesceMs = COALESCE_MS,
    enabled = true,
    eventsOnly = false,
  } = options;
  const { socket, connected } = useSocket();

  const refreshRef = useRef(refresh);
  const matchRef = useRef(match);
  // The latest callbacks, kept for the listeners below (updated once the render has committed, not during it).
  useEffect(() => {
    refreshRef.current = refresh;
    matchRef.current = match;
  });

  const lastRunRef = useRef(0);
  const pendingRef = useRef<{ timer: ReturnType<typeof setTimeout>; at: number } | null>(null);
  const runRef = useRef(() => {
    lastRunRef.current = Date.now();
    refreshRef.current();
  });
  // One reload pending at a time: a later request joins it, an earlier one brings it forward.
  const scheduleRef = useRef((delayMs: number) => {
    const at = Date.now() + delayMs;
    const pending = pendingRef.current;
    if (pending && pending.at <= at) return;
    if (pending) clearTimeout(pending.timer);
    pendingRef.current = {
      at,
      timer: setTimeout(() => {
        pendingRef.current = null;
        runRef.current();
      }, delayMs),
    };
  });

  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    },
    []
  );

  const eventKey = events.join('|');

  // Socket events, and a catch-up reload after every reconnection.
  useEffect(() => {
    if (!socket || !enabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onEvent = (data: any) => {
      if (!matchRef.current || matchRef.current(data)) scheduleRef.current(eventReloadDelay(Date.now(), lastRunRef.current, coalesceMs, COALESCE_MS));
    };
    const names = eventKey.split('|').filter(Boolean);
    names.forEach((name) => socket.on(name, onEvent));
    const onReconnect = () => scheduleRef.current(Math.round(Math.random() * CATCH_UP_SPREAD_MS));
    if (!eventsOnly) socket.io.on('reconnect', onReconnect);
    return () => {
      names.forEach((name) => socket.off(name, onEvent));
      socket.io.off('reconnect', onReconnect);
    };
  }, [socket, enabled, eventKey, eventsOnly, coalesceMs]);

  // Coming back to the tab, unless what is on screen was loaded moments ago.
  useEffect(() => {
    if (!enabled || eventsOnly) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunRef.current >= FRESH_FOR_MS) scheduleRef.current(COALESCE_MS);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, eventsOnly]);

  // Safety net: slow while live updates flow; while they can't, a poll that backs off instead of speeding up.
  useEffect(() => {
    if (!enabled || eventsOnly) return;
    let offlinePolls = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === 'visible') runRef.current();
        if (!connected) offlinePolls += 1;
        next();
      }, nextPollDelay({ connected, offlinePolls, intervalMs, offlineMs, offlineMaxMs }));
    };
    next();
    return () => clearTimeout(timer);
  }, [enabled, eventsOnly, connected, intervalMs, offlineMs, offlineMaxMs]);
}
