import { NextRequest, NextResponse } from 'next/server';

/**
 * IP-based geolocation fallback for desktop browsers and environments
 * where HTML5 Geolocation is blocked, denied, or lacks GPS hardware.
 */
export async function GET(request: NextRequest) {
  try {
    const forwardedFor = request.headers.get('x-forwarded-for');
    const clientIp = forwardedFor ? forwardedFor.split(',')[0].trim() : '';

    const ipParam = clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1' ? clientIp : '';
    const url = ipParam ? `http://ip-api.com/json/${ipParam}` : 'http://ip-api.com/json/';

    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) {
      // Default to Lahore, Pakistan
      return NextResponse.json({
        lat: 31.5204,
        lng: 74.3587,
        city: 'Lahore',
        country: 'Pakistan',
      });
    }

    const data = await res.json();
    if (data.status === 'success' && data.lat && data.lon) {
      return NextResponse.json({
        lat: data.lat,
        lng: data.lon,
        city: data.city || 'Lahore',
        country: data.country || 'Pakistan',
      });
    }

    return NextResponse.json({
      lat: 31.5204,
      lng: 74.3587,
      city: 'Lahore',
      country: 'Pakistan',
    });
  } catch (error) {
    console.error('IP geocode error:', error);
    return NextResponse.json({
      lat: 31.5204,
      lng: 74.3587,
      city: 'Lahore',
      country: 'Pakistan',
    });
  }
}
