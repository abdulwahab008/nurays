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
  latitude?: number | null;
  longitude?: number | null;
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

/**
 * Platform default when seller has no custom delivery fee.
 */
function platformDefaultFee(_subtotal: number, city?: string | null): number {
  let fee = 100;
  if (city === 'Karachi' || city === 'Lahore' || city === 'Islamabad') fee = 150;
  return fee;
}

/**
 * Get delivery fee for one seller for a given address.
 * originLat/originLng = hub or seller location (used for distance-based fee and radius check).
 */
export function getDeliveryFeeForSeller(
  seller: SellerDeliveryPolicy,
  address: AddressForDelivery,
  originLat?: number | null,
  originLng?: number | null
): number {
  // Free if customer is within seller's free-delivery radius (from business/hub location)
  const radiusKm = seller.freeDeliveryRadiusKm != null ? Number(seller.freeDeliveryRadiusKm) : null;
  if (radiusKm != null && radiusKm > 0) {
    const fromLat = originLat != null ? Number(originLat) : (seller.latitude != null ? Number(seller.latitude) : null);
    const fromLng = originLng != null ? Number(originLng) : (seller.longitude != null ? Number(seller.longitude) : null);
    const toLat = address.latitude != null ? Number(address.latitude) : null;
    const toLng = address.longitude != null ? Number(address.longitude) : null;
    if (fromLat != null && fromLng != null && toLat != null && toLng != null) {
      const distanceKm = haversineKm(fromLat, fromLng, toLat, toLng);
      if (distanceKm <= radiusKm) return 0;
    }
  }

  if (addressInFreeDeliveryAreas(address.area, address.city, seller.freeDeliveryAreas)) {
    return 0;
  }

  const feeType = seller.deliveryFeeType;
  const fixed = seller.deliveryFeeFixed != null ? Number(seller.deliveryFeeFixed) : null;
  const base = seller.deliveryFeeBase != null ? Number(seller.deliveryFeeBase) : 0;
  const perKm = seller.deliveryFeePerKm != null ? Number(seller.deliveryFeePerKm) : 0;

  if (feeType === 'fixed' && fixed != null && fixed >= 0) {
    return fixed;
  }

  if (feeType === 'distance' && perKm >= 0) {
    const fromLat = originLat != null ? Number(originLat) : (seller.latitude != null ? Number(seller.latitude) : null);
    const fromLng = originLng != null ? Number(originLng) : (seller.longitude != null ? Number(seller.longitude) : null);
    const toLat = address.latitude != null ? Number(address.latitude) : null;
    const toLng = address.longitude != null ? Number(address.longitude) : null;
    if (fromLat != null && fromLng != null && toLat != null && toLng != null) {
      const km = haversineKm(fromLat, fromLng, toLat, toLng);
      const fee = base + perKm * km;
      return Math.round(Math.max(0, fee));
    }
  }

  return platformDefaultFee(0, address.city);
}
