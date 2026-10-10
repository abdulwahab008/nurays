import { NextRequest, NextResponse } from 'next/server';
import { cachedNominatim, NOMINATIM } from '@/lib/geocode-proxy';

/**
 * Proxy for Nominatim search to avoid CORS and comply with
 * Nominatim usage policy (custom User-Agent, server-side only).
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'q (query) is required' }, { status: 400 });
  }

  const url = `${NOMINATIM}/search?format=json&q=${encodeURIComponent(query.trim().toLowerCase())}&countrycodes=pk&limit=5&addressdetails=1`;
  return cachedNominatim(url, 'Geocoding search failed');
}
