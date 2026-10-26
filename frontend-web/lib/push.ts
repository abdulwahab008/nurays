'use client';

import { apiClient } from './api-client';
import { nativePlatform, nativePlugins, nativePushToken, type NativeWindow, type PushNotificationsPlugin } from './native-shell';

/**
 * Push on this device. In a browser: register the service worker, ask permission, subscribe with the server's public
 * key and tell the server. In the store app: ask the phone's permission, get its push token (FCM on Android, APNs on
 * iOS) and tell the server. Everything here is per device and browser.
 */

export type PushState = 'unsupported' | 'unavailable' | 'denied' | 'off' | 'on';

/** The store app's push plugin and platform, or null in a browser (or an app build without the plugin). */
function nativePush(): { plugin: PushNotificationsPlugin; platform: 'android' | 'ios' } | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as NativeWindow;
  const platform = nativePlatform(win);
  const plugin = nativePlugins(win)?.PushNotifications;
  return platform && plugin ? { plugin, platform } : null;
}

function browserPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushSupported(): boolean {
  return nativePush() !== null || browserPushSupported();
}

// The app's push token, once push was turned on in it (it is the app's address for the server, nothing secret).
const TOKEN_KEY = 'nuray-push-token';
const storedToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
const storeToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Private storage: push still works, the next page load just asks the phone again.
  }
};

/** Whether this server can reach this kind of app (it says so with its public key). */
async function serverReaches(platform: 'android' | 'ios'): Promise<boolean> {
  const res = await apiClient.get('/notifications/push/public-key');
  return res.data?.data?.platforms?.[platform] === true;
}

async function nativeState({ plugin, platform }: NonNullable<ReturnType<typeof nativePush>>): Promise<PushState> {
  if (!(await serverReaches(platform).catch(() => false))) return 'unavailable';
  const { receive } = await plugin.checkPermissions();
  if (receive === 'denied') return 'denied';
  return receive === 'granted' && storedToken() ? 'on' : 'off';
}

async function nativeEnable({ plugin, platform }: NonNullable<ReturnType<typeof nativePush>>): Promise<PushState> {
  if (!(await serverReaches(platform))) return 'unavailable';
  const { receive } = await plugin.requestPermissions();
  if (receive !== 'granted') return receive === 'denied' ? 'denied' : 'off';
  const token = await nativePushToken(plugin);
  await apiClient.post('/notifications/push/subscriptions', { platform, token });
  storeToken(token);
  return 'on';
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
  const native = nativePush();
  if (native) return nativeState(native);
  if (!browserPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const key = await publicKey().catch(() => null);
  if (!key) return 'unavailable';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

/** Turn push on for this device (asks the browser's permission). */
export async function enablePush(): Promise<PushState> {
  const native = nativePush();
  if (native) return nativeEnable(native);
  if (!browserPushSupported()) return 'unsupported';
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

/** The address this browser (or the app's token) receives push notifications at, or null (none, or push not supported). Never throws. */
export async function pushEndpointHere(): Promise<string | null> {
  if (nativePush()) return storedToken();
  if (!browserPushSupported()) return null;
  try {
    return (await currentSubscription())?.endpoint ?? null;
  } catch {
    return null;
  }
}

/**
 * On sign-out: this browser stops holding a subscription for the account that is leaving, so whoever uses it next
 * starts clean. (Sign-out tells the server which subscription is this device's, see `pushEndpointHere`; the account's
 * other devices keep theirs.) Never throws.
 */
export async function dropPushSubscription(): Promise<void> {
  if (nativePush()) {
    // The phone keeps its token; the server forgot it at sign-out, and push is turned on again by whoever signs in.
    storeToken(null);
    return;
  }
  if (!browserPushSupported()) return;
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
  const native = nativePush();
  if (native) {
    // Asking the phone again also picks up a token it replaced since (FCM and APNs both do that now and then).
    const previous = storedToken();
    if (!previous) return;
    try {
      if ((await native.plugin.checkPermissions()).receive !== 'granted') return;
      const token = await nativePushToken(native.plugin);
      await apiClient.post('/notifications/push/subscriptions', { platform: native.platform, token });
      storeToken(token);
      if (token !== previous) await apiClient.delete('/notifications/push/subscriptions', { data: { token: previous } }).catch(() => undefined);
    } catch {
      // Tried again at the next sign-in or page load.
    }
    return;
  }
  if (!browserPushSupported() || Notification.permission !== 'granted') return;
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
  if (nativePush()) {
    const token = storedToken();
    if (token) await apiClient.delete('/notifications/push/subscriptions', { data: { token } }).catch(() => undefined);
    storeToken(null);
    return 'off';
  }
  if (!browserPushSupported()) return 'unsupported';
  const reg = await navigator.serviceWorker.getRegistration('/');
  const sub = reg ? await reg.pushManager.getSubscription() : null;
  if (sub) {
    await apiClient.delete('/notifications/push/subscriptions', { data: { endpoint: sub.endpoint } }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  }
  return 'off';
}
