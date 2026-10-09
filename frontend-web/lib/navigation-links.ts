/**
 * Links that hand a destination to the phone's maps app. The rider's job already carries the
 * customer's map pin (latitude/longitude) when the address has one; the address text is the fallback.
 *
 * - Google Maps URLs API (https://developers.google.com/maps/documentation/urls/get-started): the same
 *   https link opens the Google Maps app on Android and iOS when it is installed, otherwise the web map.
 * - Apple Maps (https://developer.apple.com/documentation/mapkitjs/... "Apple Maps URL scheme"): always
 *   present on an iPhone, for riders without Google Maps.
 * - geo: URI (RFC 5870): Android asks the rider which maps app to use when Google Maps is missing.
 */
export interface NavDestination {
  latitude?: number | null;
  longitude?: number | null;
  /** Shown as the label, and used as the destination when there is no pin. */
  text?: string | null;
}

const hasPin = (d: NavDestination): d is NavDestination & { latitude: number; longitude: number } =>
  typeof d.latitude === 'number' && Number.isFinite(d.latitude) && typeof d.longitude === 'number' && Number.isFinite(d.longitude);

const pinOrText = (d: NavDestination) => (hasPin(d) ? `${d.latitude},${d.longitude}` : encodeURIComponent((d.text ?? '').trim()));

/** Whether there is anything at all to navigate to. */
export const canNavigateTo = (d: NavDestination) => hasPin(d) || Boolean((d.text ?? '').trim());

export const googleMapsDirectionsUrl = (d: NavDestination) => `https://www.google.com/maps/dir/?api=1&destination=${pinOrText(d)}`;

export const appleMapsDirectionsUrl = (d: NavDestination) =>
  hasPin(d) ? `https://maps.apple.com/?daddr=${d.latitude},${d.longitude}&dirflg=d` : `https://maps.apple.com/?daddr=${pinOrText(d)}`;

export const geoUrl = (d: NavDestination) => {
  const label = encodeURIComponent((d.text ?? 'Destination').trim().slice(0, 80));
  return hasPin(d) ? `geo:${d.latitude},${d.longitude}?q=${d.latitude},${d.longitude}(${label})` : `geo:0,0?q=${pinOrText(d)}`;
};

export type MobilePlatform = 'ios' | 'android' | 'other';

export function mobilePlatform(ua: string = typeof navigator === 'undefined' ? '' : navigator.userAgent): MobilePlatform {
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/** The alternative link worth offering next to the Google Maps button on this phone, if any. */
export function alternativeMapsLink(d: NavDestination, platform: MobilePlatform = mobilePlatform()): { kind: 'apple' | 'geo'; url: string } | null {
  if (!canNavigateTo(d)) return null;
  if (platform === 'ios') return { kind: 'apple', url: appleMapsDirectionsUrl(d) };
  if (platform === 'android') return { kind: 'geo', url: geoUrl(d) };
  return null;
}
