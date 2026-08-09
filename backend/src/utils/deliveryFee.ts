/**
 * Haversine distance in km between two points.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface AddressForDelivery {
  area?: string | null;
  city?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface DistancePricingTier {
  maxKm: number;
  fee: number;
}

export interface DeliveryZone {
  name: string;
  cities: string[];
  areas: string[];
  fee: number;
}

export interface SellerDeliveryPolicy {
  freeDeliveryAreas: unknown;
  freeDeliveryRadiusKm?: number | null;
  latitude?: unknown;
  longitude?: unknown;
  deliveryFeeType?: string | null;
  deliveryFeeFixed?: number | null;
  deliveryFeeBase?: number | null;
  deliveryFeePerKm?: unknown;
  distancePricingTiers?: unknown;
  maxDeliveryDistanceKm?: number | null;
  minOrderAmountForDelivery?: unknown;
  freeDeliveryThreshold?: unknown;
  allowedPostalCodes?: string[] | null;
  deliveryZones?: unknown;
}

export interface DeliveryFeeResult {
  deliverable: boolean;
  fee: number;
  reason: string | null;
  distanceKm: number | null;
}

function addressInFreeDeliveryAreas(
  area: string | null | undefined,
  city: string | null | undefined,
  freeDeliveryAreas: unknown
): boolean {
  const list = Array.isArray(freeDeliveryAreas) ? freeDeliveryAreas : [];
  if (list.length === 0) return false;
  const normalized = list.map((a) => String(a).trim().toLowerCase()).filter(Boolean);
  const addrArea = (area && String(area).trim().toLowerCase()) || '';
  const addrCity = (city && String(city).trim().toLowerCase()) || '';
  return normalized.some((a) => a === addrArea || a === addrCity);
}

function matchZone(address: AddressForDelivery, zones: unknown): DeliveryZone | null {
  if (!Array.isArray(zones)) return null;
  const addrArea = (address.area && String(address.area).trim().toLowerCase()) || '';
  const addrCity = (address.city && String(address.city).trim().toLowerCase()) || '';
  for (const zone of zones as DeliveryZone[]) {
    const cities = (zone.cities ?? []).map((c) => c.trim().toLowerCase());
    const areas = (zone.areas ?? []).map((a) => a.trim().toLowerCase());
    if (cities.includes(addrCity) || areas.includes(addrArea)) return zone;
  }
  return null;
}

function tieredDistanceFee(distanceKm: number, tiers: unknown, base: number, perKm: number): number {
  if (Array.isArray(tiers) && tiers.length > 0) {
    const sorted = [...(tiers as DistancePricingTier[])].sort((a, b) => a.maxKm - b.maxKm);
    const tier = sorted.find((t) => distanceKm <= t.maxKm);
    if (tier) return tier.fee;
    // Beyond the last tier's bracket — fall through to the linear formula as a sane default.
  }
  return Math.round(Math.max(0, base + perKm * distanceKm));
}

/**
 * Platform default when seller has no custom delivery fee.
 */
function platformDefaultFee(city?: string | null): number {
  let fee = 100;
  if (city === 'Karachi' || city === 'Lahore' || city === 'Islamabad') fee = 150;
  return fee;
}

/**
 * Get delivery fee (and eligibility) for one seller for a given address.
 * originLat/originLng = hub or seller location (used for distance-based fee/radius/max-distance).
 * subtotal, if passed, enables minOrderAmountForDelivery and freeDeliveryThreshold checks.
 */
export function getDeliveryFeeForSeller(
  seller: SellerDeliveryPolicy,
  address: AddressForDelivery,
  originLat?: number | null,
  originLng?: number | null,
  subtotal?: number
): DeliveryFeeResult {
  const fromLat = originLat != null ? Number(originLat) : (seller.latitude != null ? Number(seller.latitude) : null);
  const fromLng = originLng != null ? Number(originLng) : (seller.longitude != null ? Number(seller.longitude) : null);
  const toLat = address.latitude != null ? Number(address.latitude) : null;
  const toLng = address.longitude != null ? Number(address.longitude) : null;
  const distanceKm =
    fromLat != null && fromLng != null && toLat != null && toLng != null
      ? haversineKm(fromLat, fromLng, toLat, toLng)
      : null;

  const maxKm = seller.maxDeliveryDistanceKm;
  if (maxKm != null && distanceKm != null && distanceKm > maxKm) {
    return { deliverable: false, fee: 0, reason: `Outside this seller's ${maxKm}km delivery range`, distanceKm };
  }

  const allowedPostalCodes = seller.allowedPostalCodes ?? [];
  if (allowedPostalCodes.length > 0) {
    const code = address.postalCode?.trim();
    if (!code || !allowedPostalCodes.includes(code)) {
      return { deliverable: false, fee: 0, reason: 'Delivery is not available for this postal code', distanceKm };
    }
  }

  const minOrderForDelivery = seller.minOrderAmountForDelivery != null ? Number(seller.minOrderAmountForDelivery) : null;
  if (minOrderForDelivery != null && subtotal != null && subtotal < minOrderForDelivery) {
    return {
      deliverable: false,
      fee: 0,
      reason: `Minimum order for delivery is Rs ${minOrderForDelivery}`,
      distanceKm,
    };
  }

  const freeThreshold = seller.freeDeliveryThreshold != null ? Number(seller.freeDeliveryThreshold) : null;
  if (freeThreshold != null && subtotal != null && subtotal >= freeThreshold) {
    return { deliverable: true, fee: 0, reason: `Free delivery above Rs ${freeThreshold}`, distanceKm };
  }

  // Free if customer is within seller's free-delivery radius (from business/hub location)
  const radiusKm = seller.freeDeliveryRadiusKm != null ? Number(seller.freeDeliveryRadiusKm) : null;
  if (radiusKm != null && radiusKm > 0 && distanceKm != null && distanceKm <= radiusKm) {
    return { deliverable: true, fee: 0, reason: null, distanceKm };
  }

  if (addressInFreeDeliveryAreas(address.area, address.city, seller.freeDeliveryAreas)) {
    return { deliverable: true, fee: 0, reason: null, distanceKm };
  }

  const configuredZones = Array.isArray(seller.deliveryZones) ? (seller.deliveryZones as DeliveryZone[]) : [];
  if (configuredZones.length > 0) {
    const zone = matchZone(address, configuredZones);
    if (zone) {
      return { deliverable: true, fee: zone.fee, reason: null, distanceKm };
    }
    // Defining zones at all is the seller declaring their complete delivery
    // coverage — an address matching none of them is out of range, not a
    // silent fall-through to the platform default fee.
    return { deliverable: false, fee: 0, reason: "Outside this seller's delivery zones", distanceKm };
  }

  const feeType = seller.deliveryFeeType;
  const fixed = seller.deliveryFeeFixed != null ? Number(seller.deliveryFeeFixed) : null;
  const base = seller.deliveryFeeBase != null ? Number(seller.deliveryFeeBase) : 0;
  const perKm = seller.deliveryFeePerKm != null ? Number(seller.deliveryFeePerKm) : 0;

  if (feeType === 'fixed' && fixed != null && fixed >= 0) {
    return { deliverable: true, fee: fixed, reason: null, distanceKm };
  }

  if (feeType === 'distance' && perKm >= 0 && distanceKm != null) {
    const fee = tieredDistanceFee(distanceKm, seller.distancePricingTiers, base, perKm);
    return { deliverable: true, fee, reason: null, distanceKm };
  }

  return { deliverable: true, fee: platformDefaultFee(address.city), reason: null, distanceKm };
}
