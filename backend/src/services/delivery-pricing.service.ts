import prisma from '../config/database';
import type { PlatformDeliveryPricing } from '../utils/deliveryFee';

/**
 * Nuray's delivery prices (see platformDeliveryFee in utils/deliveryFee.ts): each community's
 * fixed fees, edited on the admin Communities page, and the per-km settings on the admin
 * Settings page. Kept for a minute, and dropped as soon as an admin changes either.
 */

export const DELIVERY_SETTING_DEFAULTS = {
  deliveryPerKm: 20,
  deliveryIncludedKm: 3,
  deliveryMaxKm: 20,
  deliveryFallbackFee: 150,
};

let cached: { at: number; value: PlatformDeliveryPricing } | null = null;

export function invalidateDeliveryPricing() {
  cached = null;
}

const num = (v: unknown, fallback: number) => (v != null && Number.isFinite(Number(v)) ? Number(v) : fallback);

export async function getPlatformDeliveryPricing(): Promise<PlatformDeliveryPricing> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value;
  const [settings, communities] = await Promise.all([
    prisma.systemSetting.findMany({ where: { key: { in: Object.keys(DELIVERY_SETTING_DEFAULTS) } } }),
    prisma.community.findMany({ select: { id: true, centerLatitude: true, centerLongitude: true, deliveryBaseFee: true, crossCommunityBaseFee: true } }),
  ]);
  const s = Object.fromEntries(settings.map((r) => [r.key, r.value])) as Record<string, unknown>;
  const value: PlatformDeliveryPricing = {
    perKm: num(s.deliveryPerKm, DELIVERY_SETTING_DEFAULTS.deliveryPerKm),
    includedKm: num(s.deliveryIncludedKm, DELIVERY_SETTING_DEFAULTS.deliveryIncludedKm),
    maxKm: num(s.deliveryMaxKm, DELIVERY_SETTING_DEFAULTS.deliveryMaxKm),
    fallbackBaseFee: num(s.deliveryFallbackFee, DELIVERY_SETTING_DEFAULTS.deliveryFallbackFee),
    communities: new Map(
      communities.map((c) => [
        c.id,
        {
          centerLat: Number(c.centerLatitude),
          centerLng: Number(c.centerLongitude),
          sameCommunityFee: Number(c.deliveryBaseFee),
          crossCommunityBaseFee: Number(c.crossCommunityBaseFee),
        },
      ])
    ),
  };
  cached = { at: Date.now(), value };
  return value;
}
