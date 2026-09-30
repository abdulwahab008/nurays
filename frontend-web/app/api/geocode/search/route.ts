import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for Nominatim search to avoid CORS and comply with
 * Nominatim usage policy (custom User-Agent, server-side only).
 */
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');

  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'q (query) is required' }, { status: 400 });
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query.trim()
  )}&countrycodes=pk&limit=5&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'NurayApp/1.0 (https://github.com/nuray)',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Geocoding search service error', status: res.status },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Nominatim search proxy error:', err);
    return NextResponse.json(
      { error: 'Geocoding search failed' },
      { status: 502 }
    );
  }
}
