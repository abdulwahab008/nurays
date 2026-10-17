import { NextResponse } from 'next/server';
import { createRateGuard } from './rate-guard';

/**
 * Shared by the geocoding routes. Nominatim's usage policy asks for a real User-Agent, at most one
 * request a second, and cached answers, so identical lookups are served from memory and requests are
 * spaced out. For real traffic use a paid geocoder or your own Nominatim (NOMINATIM_BASE_URL) and
 * set what the provider allows:
 *   NOMINATIM_API_KEY / NOMINATIM_API_KEY_PARAM  the account key and the query parameter it travels in (default `key`)
 *   NOMINATIM_MIN_INTERVAL_MS                    pause between calls to the provider (default 1100; 0 for no pacing)
 *   NOMINATIM_MAX_PENDING                        lookups allowed to wait their turn (default 20)
 *   GEOCODE_PER_IP_PER_MINUTE                    lookups one address may make a minute (default 120)
 */
export const NOMINATIM = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';

/** A positive number from the environment, or the default when it is unset or not a number. */
export function numberSetting(value: string | undefined, fallback: number, min: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

/** The lookup address with the provider's account key added, when there is one. Never part of a cache key. */
export function withApiKey(url: string, key = process.env.NOMINATIM_API_KEY, param = process.env.NOMINATIM_API_KEY_PARAM || 'key'): string {
  if (!key) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${encodeURIComponent(param)}=${encodeURIComponent(key)}`;
}

/** Who is asking: the first address in X-Forwarded-For, else X-Real-IP. Spoofable behind a proxy that does not overwrite it, which only weakens the guard. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const MIN_INTERVAL_MS = numberSetting(process.env.NOMINATIM_MIN_INTERVAL_MS, 1100, 0);
const cache = new Map<string, { at: number; body: unknown }>();
let lastCall = 0;
let queue: Promise<void> = Promise.resolve();
// Lookups waiting their turn. Beyond this the caller is told to retry rather than queued for
// minutes (at the public server's one request a second, 20 is already a 20 s wait).
let pending = 0;
const MAX_PENDING = numberSetting(process.env.NOMINATIM_MAX_PENDING, 20, 1);
// One address can fill the queue and starve everyone else; this is the generous guard against that
// (many users share one mobile-network address, and a person typing an address makes about ten lookups a minute).
const perAddress = createRateGuard(numberSetting(process.env.GEOCODE_PER_IP_PER_MINUTE, 120, 1), 60_000);

const spaced = () => {
  pending++;
  const turn = queue.then(async () => {
    const wait = Math.max(0, lastCall + MIN_INTERVAL_MS - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  });
  queue = turn.catch(() => undefined);
  return turn.finally(() => {
    pending--;
  });
};

export async function cachedNominatim(url: string, failure: string, asker = 'unknown') {
  if (!perAddress.allow(asker)) {
    return NextResponse.json({ error: 'Too many address lookups, please wait a minute' }, { status: 429, headers: { 'Retry-After': '60' } });
  }
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);
  if (pending >= MAX_PENDING) {
    return NextResponse.json({ error: 'The geocoder is busy, please try again in a moment' }, { status: 503, headers: { 'Retry-After': '5' } });
  }
  try {
    await spaced();
    const res = await fetch(withApiKey(url), {
      headers: { 'Accept-Language': 'en', 'User-Agent': process.env.NOMINATIM_USER_AGENT || 'NurayApp/1.0 (https://github.com/nuray)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return NextResponse.json({ error: failure, status: res.status }, { status: 502 });
    const body = await res.json();
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(url, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch (err) {
    console.error('Geocoding proxy error:', err);
    return NextResponse.json({ error: failure }, { status: 502 });
  }
}
