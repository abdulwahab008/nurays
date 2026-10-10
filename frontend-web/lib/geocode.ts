/**
 * Asking the map service what is at a pin, and reading the answer for the address and kitchen forms. One place for
 * the request and for what each field of the answer means, so the forms agree.
 *
 * The request goes to this site's own proxy (`/api/geocode/reverse`), which avoids the map service's CORS rules.
 */
import { cityFromCoords, cityFromGeocoder } from './cities.ts';

/** What the map service says about a pin. Every text field is '' when it said nothing. */
export interface GeocodedPlace {
  /** A listed city the map's words name, else the listed city the pin is in, else the service's own city, else ''. */
  city: string;
  /** The neighbourhood: suburb, else neighbourhood, else quarter, else residential area. */
  area: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  /** The service's one-line address. */
  displayName: string;
  /** False when the service could not be asked or had no address for the pin: then only `city` (from the pin itself) can be set. */
  fromService: boolean;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** Reads a service's answer for the pin at (lat, lng) (Nominatim's `reverse` format). Never throws. */
export function placeFromGeocoder(data: unknown, lat: number, lng: number): GeocodedPlace {
  const address = data && typeof data === 'object' ? (data as { address?: unknown }).address : null;
  if (!address || typeof address !== 'object') {
    return { city: cityFromCoords(lat, lng) ?? '', area: '', street: '', houseNumber: '', postalCode: '', displayName: '', fromService: false };
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(address as Record<string, unknown>)) {
    const clean = text(value);
    if (clean) fields[key] = clean;
  }
  return {
    city: cityFromGeocoder(fields, lat, lng),
    area: fields.suburb || fields.neighbourhood || fields.quarter || fields.residential || '',
    street: fields.road || '',
    houseNumber: fields.house_number || '',
    postalCode: fields.postcode || '',
    displayName: text((data as { display_name?: unknown }).display_name),
    fromService: true,
  };
}

/**
 * What is at a pin. When the service cannot be reached, answers an error or nothing, the answer is the place the pin
 * itself names (a listed city, or nothing) with `fromService` false. Never throws.
 */
export async function reverseGeocode(lat: number, lng: number, request: typeof fetch = fetch): Promise<GeocodedPlace> {
  try {
    const response = await request(`/api/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`);
    if (!response.ok) throw new Error(`Reverse geocoding answered ${response.status}`);
    return placeFromGeocoder(await response.json(), lat, lng);
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return placeFromGeocoder(null, lat, lng);
  }
}
