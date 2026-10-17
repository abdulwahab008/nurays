import { NextRequest, NextResponse } from 'next/server';
import { cachedNominatim, clientAddress, NOMINATIM } from '@/lib/geocode-proxy';

/**
 * Proxy for Nominatim reverse geocoding to avoid CORS and comply with
 * Nominatim usage policy (custom User-Agent, server-side only).
 */
export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get('lat');
  const lon = request.nextUrl.searchParams.get('lon');

  if (lat == null || lon == null || Number.isNaN(Number(lat)) || Number.isNaN(Number(lon))) {
    return NextResponse.json({ error: 'lat and lon required' }, { status: 400 });
  }

  // Rounded to ~10 m so nearby taps share a cached answer.
  const key = `${NOMINATIM}/reverse?format=json&lat=${Number(lat).toFixed(4)}&lon=${Number(lon).toFixed(4)}&addressdetails=1&zoom=18`;
  return cachedNominatim(key, 'Geocoding failed', clientAddress(request));
}
