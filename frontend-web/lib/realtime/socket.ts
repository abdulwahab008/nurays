'use client';

import { io, Socket } from 'socket.io-client';
import { apiClient } from '../api-client';
import { socketUrl } from '../config';
import { backoff, jitter } from './backoff';

/**
 * The tab's one realtime connection, shared by every component that listens for live
 * updates (each used to open its own). It authenticates with the current access token,
 * reconnects with the new one whenever the token changes, and closes on logout.
 */

let socket: Socket | null = null;
let socketToken: string | null = null;
const listeners = new Set<() => void>();
let watchingTokens = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let authCheckedFor: string | null = null;

// The library's own retries after a dropped connection: the first 1.5-4.5 s after the drop, doubling up to 30 s,
// each spread ±50%, so the clients of a restarted server come back over seconds instead of all at once.
const RECONNECT = { reconnectionDelay: 3_000, reconnectionDelayMax: 30_000, randomizationFactor: 0.5 };
// A handshake the server could not check (its database failing) is retried on the same schedule, up to a minute apart.
const RETRY_BASE_MS = 3_000;
const RETRY_MAX_MS = 60_000;

/** The server marks a handshake it refused only because it could not check it (see the backend's config/socket.ts). */
const retryable = (err: Error) => (err as Error & { data?: { retryable?: unknown } }).data?.retryable === true;

function notify() {
  listeners.forEach((listener) => listener());
}

function close() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retries = 0;
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
  socketToken = null;
}

function open(token: string): Socket {
  const next = io(socketUrl(), {
    // Read at every (re)connect: access tokens are short-lived and the client renews them.
    auth: (cb) => cb({ token: apiClient.getAccessToken() ?? token }),
    transports: ['websocket', 'polling'],
    ...RECONNECT,
  });
  next.on('connect', () => {
    retries = 0;
    notify();
  });
  next.on('disconnect', notify);
  next.on('connect_error', (err) => {
    // Pages keep working without it: they reload on a slower timer while disconnected.
    if (process.env.NODE_ENV === 'development') {
      console.warn('Realtime connection unavailable; pages fall back to periodic refresh.');
    }
    notify();
    // A refused handshake stops the library's own retries (it would keep failing the same way), unlike a network error.
    if (next.active) return;
    if (retryable(err)) retryLater(next);
    else checkSession();
  });
  socket = next;
  socketToken = token;
  return next;
}

function retryLater(target: Socket) {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    if (socket === target && !target.connected) target.connect();
  }, backoff(retries++, RETRY_BASE_MS, RETRY_MAX_MS));
}

/**
 * The token was refused: most often it expired while the connection was down. One API call per token lets the
 * client renew it, and a new token re-opens the connection (see sync). A token the API accepts is not tried again.
 */
function checkSession() {
  const token = apiClient.getAccessToken();
  if (!token || authCheckedFor === token) return;
  authCheckedFor = token;
  setTimeout(() => {
    apiClient.get('/auth/me').catch(() => undefined);
  }, jitter(RETRY_BASE_MS));
}

/** Re-open with the current token, or close when there is none (logged out). */
function sync() {
  const token = apiClient.getAccessToken();
  if (!token) {
    if (socket) {
      close();
      notify();
    }
    return;
  }
  if (socket && socketToken === token) return;
  close();
  open(token);
  notify();
}

function watchTokens() {
  if (watchingTokens || typeof window === 'undefined') return;
  watchingTokens = true;
  window.addEventListener('auth:tokens-changed', sync);
}

/** The shared connection for a signed-in user (opened on first use), or null when signed out. */
export function acquireSocket(): Socket | null {
  if (typeof window === 'undefined') return null;
  watchTokens();
  sync();
  return socket;
}

/** Close the shared connection (sign-out). */
export function releaseSocket() {
  if (!socket) return;
  close();
  notify();
}

export function currentSocket(): Socket | null {
  return socket;
}

/** Called whenever the connection is replaced, connects or drops. Returns an unsubscribe. */
export function onSocketChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
