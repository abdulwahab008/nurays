'use client';

import { useEffect, useRef } from 'react';
import { useSocket } from './use-socket';

interface LiveRefreshOptions {
  /** Socket events after which the data may have changed. */
  events: string[];
  /** Only react to events this returns true for (e.g. those about the order on screen). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  match?: (data: any) => boolean;
  /**
   * Safety-net reload interval while the realtime connection is up, for changes that send
   * no event. While it is down the page reloads every `offlineMs` instead.
   */
  intervalMs?: number;
  offlineMs?: number;
  /** Off: no reloading at all (nothing on screen yet, or nothing left that can change). */
  enabled?: boolean;
}

/**
 * Keep a screen current without hammering the API: `refresh` runs when a matching socket event
 * arrives (bursts are coalesced), after the connection comes back (to catch up on anything
 * missed), when the tab becomes visible again, and on a slow timer as a safety net. Timers
 * never run while the tab is hidden.
 */
export function useLiveRefresh(refresh: () => void, options: LiveRefreshOptions) {
  const { events, match, intervalMs = 60_000, offlineMs = 15_000, enabled = true } = options;
  const { socket, connected } = useSocket();

  const refreshRef = useRef(refresh);
  const matchRef = useRef(match);
  refreshRef.current = refresh;
  matchRef.current = match;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      refreshRef.current();
    }, 250);
  });

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  const eventKey = events.join('|');

  // Socket events, and a catch-up reload after every reconnection.
  useEffect(() => {
    if (!socket || !enabled) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onEvent = (data: any) => {
      if (!matchRef.current || matchRef.current(data)) triggerRef.current();
    };
    const names = eventKey.split('|').filter(Boolean);
    names.forEach((name) => socket.on(name, onEvent));
    const onReconnect = () => triggerRef.current();
    socket.io.on('reconnect', onReconnect);
    return () => {
      names.forEach((name) => socket.off(name, onEvent));
      socket.io.off('reconnect', onReconnect);
    };
  }, [socket, enabled, eventKey]);

  // Coming back to the tab.
  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') triggerRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled]);

  // Safety net: slow while live updates flow, faster while they can't.
  useEffect(() => {
    if (!enabled) return;
    const every = connected ? intervalMs : Math.min(intervalMs, offlineMs);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshRef.current();
    }, every);
    return () => clearInterval(timer);
  }, [enabled, connected, intervalMs, offlineMs]);
}
