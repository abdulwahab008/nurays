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

/** The native plugins this site uses, as the shell exposes them (each may be missing in an older app build). */
export interface NativePlugins {
  App?: {
    addListener(event: 'appUrlOpen', cb: (e: { url: string }) => void): Promise<ListenerHandle>;
    addListener(event: 'backButton', cb: (e: { canGoBack: boolean }) => void): Promise<ListenerHandle>;
    exitApp(): Promise<void>;
  };
  SecureStorage?: SecureStoragePlugin;
  StatusBar?: { setStyle(options: { style: 'LIGHT' | 'DARK' | 'DEFAULT' }): Promise<void> };
  SplashScreen?: { hide(): Promise<void> };
}

/** The secure storage plugin's native methods (@aparajita/capacitor-secure-storage: Keychain on iOS, Keystore on Android). */
export interface SecureStoragePlugin {
  internalGetItem(options: { prefixedKey: string; sync: boolean }): Promise<{ data: string | null }>;
  internalSetItem(options: { prefixedKey: string; data: string; sync: boolean; access: number }): Promise<void>;
  internalRemoveItem(options: { prefixedKey: string; sync: boolean }): Promise<{ success: boolean }>;
}

export interface NativeWindow {
  Capacitor?: { isNativePlatform?: () => boolean; Plugins?: NativePlugins };
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

/** The token store's shape (lib/token-store.ts), repeated here so this file needs no imports. */
export interface TokenStoreLike {
  access(): string | null;
  refresh(): string | null;
  saveAccess(token: string, isolated?: boolean): void;
  savePair(access: string, refresh: string, isolated?: boolean): void;
  clear(): void;
  tabIsolated(): boolean;
}

/**
 * In the app the tokens are also kept in the phone's secure storage. Reads stay synchronous (the request interceptor
 * needs the token at once), so the page keeps working from its own copy; every change is written through, and
 * `syncTokens` brings the page's copy back when the WebView's storage was cleared (iOS may do that under storage
 * pressure, and an app update can).
 */
export function mirroredTokenStore(base: TokenStoreLike, secure: SecureKV): TokenStoreLike {
  const quietly = (p: Promise<void>) => void p.catch(() => undefined);
  return {
    access: () => base.access(),
    refresh: () => base.refresh(),
    tabIsolated: () => base.tabIsolated(),
    saveAccess(token, isolated) {
      base.saveAccess(token, isolated);
      quietly(secure.set('access', token));
    },
    savePair(access, refresh, isolated) {
      base.savePair(access, refresh, isolated);
      quietly(secure.set('access', access));
      quietly(secure.set('refresh', refresh));
    },
    clear() {
      base.clear();
      quietly(secure.remove('access'));
      quietly(secure.remove('refresh'));
    },
  };
}

/**
 * At start: a page that is signed in copies its tokens to secure storage ('mirrored'); a page that lost them takes
 * them back from there ('restored': reload so everything starts signed in); otherwise nothing ('none').
 */
export async function syncTokens(base: TokenStoreLike, secure: SecureKV): Promise<'restored' | 'mirrored' | 'none'> {
  const refresh = base.refresh();
  if (refresh) {
    await secure.set('refresh', refresh);
    const access = base.access();
    if (access) await secure.set('access', access);
    return 'mirrored';
  }
  const [savedAccess, savedRefresh] = await Promise.all([secure.get('access'), secure.get('refresh')]);
  if (!savedRefresh) return 'none';
  base.savePair(savedAccess ?? '', savedRefresh);
  return 'restored';
}
