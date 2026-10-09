/**
 * Where Nuray delivers. A map pin outside this box (Pakistan, including Azad Kashmir and
 * Gilgit-Baltistan) cannot be a customer's door or a kitchen: it is a mis-drop or a typo,
 * and is refused before it can price a delivery or send a rider abroad.
 */
export const PAKISTAN_BOUNDS = { minLat: 23.5, maxLat: 37.5, minLng: 60.5, maxLng: 77.5 } as const;

export const PIN_OUTSIDE = 'The map pin must be inside Pakistan';

export function isInsidePakistan(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= PAKISTAN_BOUNDS.minLat && lat <= PAKISTAN_BOUNDS.maxLat &&
    lng >= PAKISTAN_BOUNDS.minLng && lng <= PAKISTAN_BOUNDS.maxLng
  );
}
