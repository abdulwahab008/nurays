'use client';

import { apiClient } from './api-client';

/**
 * Web push on this device: register the service worker, ask permission, subscribe with the
 * server's public key and tell the server. Everything here is per device and browser.
 */

export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function publicKey(): Promise<string | null> {
  const res = await apiClient.get('/notifications/push/public-key');
  return res.data?.data?.publicKey ?? null;
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** Where push stands on this device right now. */
export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const key = await publicKey().catch(() => null);
  if (!key) return 'unavailable';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Turn push on for this device (asks the browser's permission). */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const key = await publicKey();
  if (!key) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) as BufferSource });
  const json = sub.toJSON();
  await apiClient.post('/notifications/push/subscriptions', { endpoint: json.endpoint, keys: json.keys });
  return 'on';
}

/** This browser's own push subscription, if push was turned on here. */
async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? await reg.pushManager.getSubscription() : null;
}

/**
 * On sign-out: this browser stops holding a subscription for the account that is leaving, so whoever uses it next
 * starts clean. (The server forgets the account's subscriptions when it ends the account's sessions.) Never throws.
 */
export async function dropPushSubscription(): Promise<void> {
  if (!pushSupported()) return;
  try {
    await (await currentSubscription())?.unsubscribe();
  } catch {
    // Nothing to do: the server no longer sends to it.
  }
}

/**
 * Whoever is signed in on this browser now owns its push subscription, if push was ever turned on here: tell the
 * server (it moves a device to its newest owner, and a device it forgot at someone's sign-out comes back when that
 * person signs in again). Does nothing where push was never turned on or the permission was withdrawn. Never throws.
 */
export async function claimPushSubscription(): Promise<void> {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    const sub = await currentSubscription();
    if (!sub) return;
    const json = sub.toJSON();
    await apiClient.post('/notifications/push/subscriptions', { endpoint: json.endpoint, keys: json.keys });
  } catch {
    // Offline or signed out meanwhile: it is tried again at the next sign-in or page load.
  }
}

/** Turn push off for this device. */
export async function disablePush(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await apiClient.delete('/notifications/push/subscriptions', { data: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}
