/**
 * Where the browser reaches the backend. NEXT_PUBLIC_* values are baked in at build time.
 *
 *  NEXT_PUBLIC_API_URL  e.g. https://api.nuray.pk/api/v1 (or a relative /api/v1 behind the same domain)
 *  NEXT_PUBLIC_WS_URL   optional; the realtime (Socket.IO) server. Defaults to the API's origin,
 *                       so a production build never silently points live updates at localhost.
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export function socketUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_WS_URL;
  if (explicit) return explicit;
  if (/^https?:\/\//i.test(API_BASE_URL)) {
    try {
      return new URL(API_BASE_URL).origin;
    } catch {
      /* fall through */
    }
  }
  // A relative API URL means the backend sits behind the same domain as the site.
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
}
