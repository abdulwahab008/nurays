import { NextRequest, NextResponse } from 'next/server';

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

  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`;

  try {
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': process.env.NOMINATIM_USER_AGENT || 'NurayApp/1.0 (https://github.com/nuray)',
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Geocoding service error', status: res.status },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('Nominatim proxy error:', err);
    return NextResponse.json(
      { error: 'Geocoding failed' },
      { status: 502 }
    );
  }
}
