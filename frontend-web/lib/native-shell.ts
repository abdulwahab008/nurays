/**
 * The website running inside the Nuray store app (the Capacitor shell in mobile/, which opens this site). The shell's
 * native plugins are reached through window.Capacitor.Plugins, so the website bundles none of Capacitor's packages and
 * a browser never loads them. components/NativeBridge.tsx wires these helpers up when the page is in the app.
 *
 * No imports, so `npm test` covers it (tests/unit/native-shell.test.ts).
 */

/** The custom scheme the app is opened with (pk.nuray.app://orders/123), besides links to the website itself. */
export const APP_SCHEME = 'pk.nuray.app:';

interface ListenerHandle {
  remove(): Promise<void>;
}

/**
 * What addListener gives back. The plugins in window.Capacitor.Plugins come from the bridge the app injects, whose
 * addListener returns the handle itself rather than a promise of it (unlike @capacitor/core's own plugins).
 */
export type Listening = ListenerHandle | Promise<ListenerHandle>;

/** Stops a listener, whichever way addListener returned it. */
export function removeListener(listening: Listening): void {
  void Promise.resolve(listening)
    .then((h) => h.remove())
    .catch(() => undefined);
}

/** The native plugins this site uses, as the shell exposes them (each may be missing in an older app build). */
export interface NativePlugins {
  App?: {
    addListener(event: 'appUrlOpen', cb: (e: { url: string }) => void): Listening;
    addListener(event: 'backButton', cb: (e: { canGoBack: boolean }) => void): Listening;
    exitApp(): Promise<void>;
  };
  SecureStorage?: SecureStoragePlugin;
  StatusBar?: { setStyle(options: { style: 'LIGHT' | 'DARK' | 'DEFAULT' }): Promise<void> };
  SplashScreen?: { hide(): Promise<void> };
  SocialLogin?: SocialLoginPlugin;
  PushNotifications?: PushNotificationsPlugin;
  BackgroundGeolocation?: BackgroundGeolocationPlugin;
  CapacitorHttp?: CapacitorHttpPlugin;
}

/** The secure storage plugin's native methods (@aparajita/capacitor-secure-storage: Keychain on iOS, Keystore on Android). */
export interface SecureStoragePlugin {
  internalGetItem(options: { prefixedKey: string; sync: boolean }): Promise<{ data: string | null }>;
  internalSetItem(options: { prefixedKey: string; data: string; sync: boolean; access: number }): Promise<void>;
  internalRemoveItem(options: { prefixedKey: string; sync: boolean }): Promise<{ success: boolean }>;
}

export interface NativeWindow {
  Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: NativePlugins };
}

/** 'ios' or 'android' inside the app, null in a browser. */
export function nativePlatform(win: NativeWindow | undefined): 'ios' | 'android' | null {
  if (!win?.Capacitor?.isNativePlatform?.()) return null;
  const platform = win.Capacitor.getPlatform?.();
  return platform === 'ios' || platform === 'android' ? platform : null;
}

export const nativePlugins = (win: NativeWindow | undefined): NativePlugins | null =>
  win?.Capacitor?.isNativePlatform?.() ? (win.Capacitor.Plugins ?? null) : null;

/**
 * The page an app link opens: a link to this website (an App Link or Universal Link) or the app's own scheme. Anything
 * else (another site) is not opened inside the app.
 */
export function appPathFromUrl(url: string, siteOrigin: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol === APP_SCHEME) {
    // pk.nuray.app://orders/123 reads "orders" as the host: put it back in front of the path.
    const path = `/${parsed.host}${parsed.pathname}`.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');
    return `${path}${parsed.search}${parsed.hash}`;
  }
  let site: URL;
  try {
    site = new URL(siteOrigin);
  } catch {
    return null;
  }
  if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && parsed.host === site.host) {
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  }
  return null;
}

/** A small key-value face over the plugin. Values stay on the phone, encrypted by the operating system. */
export interface SecureKV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const PREFIX = 'nuray_';
const WHEN_UNLOCKED = 0;

export function secureKV(plugin: SecureStoragePlugin): SecureKV {
  return {
    get: async (key) => (await plugin.internalGetItem({ prefixedKey: PREFIX + key, sync: false })).data ?? null,
    set: (key, value) => plugin.internalSetItem({ prefixedKey: PREFIX + key, data: value, sync: false, access: WHEN_UNLOCKED }),
    remove: async (key) => {
      await plugin.internalRemoveItem({ prefixedKey: PREFIX + key, sync: false });
    },
  };
}

/** Tokens an earlier version of the app kept in secure storage: the refresh token is now the API's httpOnly cookie. */
export async function forgetSavedTokens(secure: SecureKV): Promise<void> {
  await Promise.all([secure.remove('access'), secure.remove('refresh')]);
}

/**
 * Native sign-in (@capgo/capacitor-social-login): Google on both phones (Android's Credential Manager, Google's iOS SDK),
 * Apple on iPhones (required there because Google is offered: App Store guideline 4.8). The app gets a signed ID token,
 * which the API checks against Google's or Apple's keys (POST /auth/google with idToken, POST /auth/apple).
 */
export interface SocialLoginPlugin {
  initialize(options: SocialLoginInit): Promise<void>;
  login(options: { provider: 'google' | 'apple'; options: { scopes?: string[] } }): Promise<{ provider: string; result: SocialLoginResult }>;
}

export interface SocialLoginResult {
  idToken?: string | null;
  profile?: { givenName?: string | null; familyName?: string | null; name?: string | null };
}

export interface SocialLoginInit {
  google?: { webClientId?: string; iOSClientId?: string; iOSServerClientId?: string; mode: 'online' };
  apple?: { clientId: string; redirectUrl?: string };
}

/** What signs a person in with Google or Apple, sent to the API. */
export type SocialProof =
  | { provider: 'google'; accessToken: string }
  | { provider: 'google'; idToken: string }
  | { provider: 'apple'; identityToken: string; fullName?: string };

export interface GoogleClientIds {
  /** The web client id (NEXT_PUBLIC_GOOGLE_CLIENT_ID): Android's Credential Manager asks for it. */
  web?: string;
  /** The iOS client id (NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID). */
  ios?: string;
}

/** Which buttons the app shows: Google where its client id is set, Apple on iPhones. */
export function nativeProviders(platform: 'ios' | 'android', ids: GoogleClientIds): { google: boolean; apple: boolean } {
  return { google: platform === 'ios' ? Boolean(ids.ios && ids.web) : Boolean(ids.web), apple: platform === 'ios' };
}

/** The plugin's settings for this phone. */
export function socialLoginInit(platform: 'ios' | 'android', ids: GoogleClientIds, bundleId = 'pk.nuray.app'): SocialLoginInit {
  const providers = nativeProviders(platform, ids);
  const init: SocialLoginInit = {};
  if (providers.google) {
    init.google =
      platform === 'ios' ? { iOSClientId: ids.ios, iOSServerClientId: ids.web, mode: 'online' } : { webClientId: ids.web, mode: 'online' };
  }
  // On iOS the client id only names the provider for the plugin; Apple's own sheet signs in (no redirect).
  if (providers.apple) init.apple = { clientId: bundleId, redirectUrl: '' };
  return init;
}

/** The proof to send for the plugin's answer, or null when it carried no token. */
export function proofFromLogin(provider: 'google' | 'apple', result: SocialLoginResult): SocialProof | null {
  const token = result.idToken?.trim();
  if (!token) return null;
  if (provider === 'google') return { provider: 'google', idToken: token };
  // Apple gives the name only at the first sign-in, and never in the token: it names a new account.
  const name = [result.profile?.givenName, result.profile?.familyName].map((part) => part?.trim()).filter(Boolean).join(' ');
  return name ? { provider: 'apple', identityToken: token, fullName: name.slice(0, 100) } : { provider: 'apple', identityToken: token };
}

/** Capacitor's push plugin (@capacitor/push-notifications): FCM on Android, APNs on iOS. */
export interface PushNotificationsPlugin {
  checkPermissions(): Promise<{ receive: string }>;
  requestPermissions(): Promise<{ receive: string }>;
  register(): Promise<void>;
  addListener(event: 'registration', cb: (token: { value: string }) => void): Listening;
  addListener(event: 'registrationError', cb: (error: { error: string }) => void): Listening;
  addListener(event: 'pushNotificationActionPerformed', cb: (action: { notification: { data?: Record<string, unknown> } }) => void): Listening;
}

/**
 * Ask the phone for its push token: `register()` answers through the 'registration' event (or 'registrationError').
 * Rejects after `timeoutMs` when neither comes, which is what a phone without Google Play services does.
 */
export async function nativePushToken(plugin: PushNotificationsPlugin, timeoutMs = 15_000): Promise<string> {
  const handles: Listening[] = [];
  try {
    return await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The phone gave no push token')), timeoutMs);
      handles.push(
        plugin.addListener('registration', ({ value }) => {
          clearTimeout(timer);
          if (value) resolve(value);
          else reject(new Error('The phone gave an empty push token'));
        })
      );
      handles.push(
        plugin.addListener('registrationError', ({ error }) => {
          clearTimeout(timer);
          reject(new Error(error || 'Push registration failed'));
        })
      );
      plugin.register().catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  } finally {
    handles.forEach(removeListener);
  }
}

/** The page a tapped notification opens: its `url` when that is a path on this site, else null. */
export function notificationPath(data: Record<string, unknown> | undefined): string | null {
  const url = data?.url;
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return null;
  return url;
}

/** A position from the background location plugin (@capacitor-community/background-geolocation). */
export interface BackgroundLocation {
  latitude: number;
  longitude: number;
  accuracy?: number;
  time?: number | null;
}

/**
 * The background location plugin. A watcher with `backgroundMessage` keeps reporting while the app is in the background
 * (on Android through a foreground service, which shows a notification with that text, on iOS with the blue bar).
 */
export interface BackgroundGeolocationPlugin {
  addWatcher(
    options: { backgroundMessage?: string; backgroundTitle?: string; requestPermissions?: boolean; stale?: boolean; distanceFilter?: number },
    callback: (location?: BackgroundLocation, error?: { code?: string; message?: string }) => void
  ): string | Promise<string>; // The app's bridge returns the id itself (a callback method), not a promise.
  removeWatcher(options: { id: string }): Promise<void>;
  /** Capacitor's own permission request; on Android it asks for location before a watch starts. */
  requestPermissions(): Promise<{ location?: string }>;
  openSettings(): Promise<void>;
}

/** Capacitor's own HTTP plugin: a request made by the phone, not the WebView (which Android slows down in the background). */
export interface CapacitorHttpPlugin {
  request(options: { url: string; method: string; headers?: Record<string, string>; data?: unknown; connectTimeout?: number; readTimeout?: number }): Promise<{ status: number; data: unknown }>;
}

/**
 * The rider's answer to the disclosure about sharing their location in the background: 'yes', 'no' (only while the app
 * is open), or null (not asked yet). Kept on the phone.
 */
export const BACKGROUND_LOCATION_CHOICE = 'nuray-rider-background-location';
export type BackgroundLocationChoice = 'yes' | 'no' | null;

export function backgroundLocationChoice(storage: Pick<Storage, 'getItem'> | null): BackgroundLocationChoice {
  try {
    const value = storage?.getItem(BACKGROUND_LOCATION_CHOICE);
    return value === 'yes' || value === 'no' ? value : null;
  } catch {
    return null;
  }
}

/** An absolute URL for an API path (the phone's HTTP plugin cannot resolve a relative one). */
export function absoluteApiUrl(apiBase: string, path: string, origin: string): string {
  return new URL(`${apiBase.replace(/\/+$/, '')}${path}`, origin).toString();
}
