/**
 * The profile's "Signed-in devices" list: what GET /auth/sessions sends, and a short name for each device from its
 * browser's user-agent string. No imports, so a unit test can read it (tests/unit/sessions.test.ts).
 */

/** GET /auth/sessions → sessions[] */
export interface SignedInDevice {
  id: string;
  current: boolean;
  userAgent: string | null;
  ipAddress: string | null;
  signedInAt: string;
  lastActiveAt: string;
}

/** "Chrome on Windows", "Safari on iPhone", "Nuray app on Android"…; null when the browser did not say. */
export function describeDevice(userAgent: string | null | undefined): { browser: string | null; os: string | null } {
  const ua = userAgent ?? '';
  if (!ua.trim()) return { browser: null, os: null };
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Mac OS X|Macintosh/.test(ua)
            ? 'Mac'
            : /CrOS/.test(ua)
              ? 'ChromeOS'
              : /Linux/.test(ua)
                ? 'Linux'
                : null;
  // Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari".
  const browser = /Capacitor|NurayApp/i.test(ua)
    ? 'Nuray app'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\/|Opera/.test(ua)
        ? 'Opera'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung Internet'
          : /Firefox\/|FxiOS/.test(ua)
            ? 'Firefox'
            : /Chrome\/|CriOS/.test(ua)
              ? 'Chrome'
              : /Safari\//.test(ua)
                ? 'Safari'
                : null;
  return { browser, os };
}

/** This device first, then the most recently active. */
export function sortDevices(devices: SignedInDevice[]): SignedInDevice[] {
  return [...devices].sort((a, b) => (a.current !== b.current ? (a.current ? -1 : 1) : Date.parse(b.lastActiveAt) - Date.parse(a.lastActiveAt)));
}
