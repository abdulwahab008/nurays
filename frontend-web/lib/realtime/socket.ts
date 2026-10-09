'use client';

import { io, Socket } from 'socket.io-client';
import { apiClient } from '../api-client';
import { socketUrl } from '../config';

/**
 * The tab's one realtime connection, shared by every component that listens for live
 * updates (each used to open its own). It authenticates with the current access token,
 * reconnects with the new one whenever the token changes, and closes on logout.
 */

let socket: Socket | null = null;
let socketToken: string | null = null;
const listeners = new Set<() => void>();
let watchingTokens = false;

function notify() {
  listeners.forEach((listener) => listener());
}

function close() {
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
  });
  next.on('connect', notify);
  next.on('disconnect', notify);
  next.on('connect_error', () => {
    // Pages keep working without it: they reload on a slower timer while disconnected.
    if (process.env.NODE_ENV === 'development') {
      console.warn('Realtime connection unavailable; pages fall back to periodic refresh.');
    }
    notify();
  });
  socket = next;
  socketToken = token;
  return next;
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
  // Another tab logging in or out changes the shared tokens too.
  window.addEventListener('storage', (event) => {
    if (event.key === null || event.key === 'access_token') sync();
  });
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
