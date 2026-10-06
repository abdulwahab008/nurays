import { NextResponse } from 'next/server';

/**
 * Shared by the geocoding routes. Nominatim's usage policy asks for a real User-Agent, at most one
 * request a second, and cached answers, so identical lookups are served from memory and requests are
 * spaced out. For real traffic use a paid geocoder or your own Nominatim (NOMINATIM_BASE_URL).
 */
export const NOMINATIM = process.env.NOMINATIM_BASE_URL || 'https://nominatim.openstreetmap.org';
const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { at: number; body: unknown }>();
let lastCall = 0;
let queue: Promise<void> = Promise.resolve();

const spaced = () => {
  const turn = queue.then(async () => {
    const wait = Math.max(0, lastCall + 1100 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    lastCall = Date.now();
  });
  queue = turn.catch(() => undefined);
  return turn;
};

export async function cachedNominatim(url: string, failure: string) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.body);
  try {
    await spaced();
    const res = await fetch(url, {
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
