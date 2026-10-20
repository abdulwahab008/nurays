/**
 * The home page's kitchen and dish cards, mapped from the API's sellers and dishes in the chosen language.
 * Only what the kitchen really set is shown; a missing value is null, never invented. The filters and the
 * platform numbers are in home-filters.ts.
 */
import { displayRating, formatPrice } from '@/lib/utils';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import type { Product } from '@/lib/services/product.service';
import type { Locale, Vars } from '@/lib/i18n';
import type { HomeKey } from '@/lib/i18n/messages/home';
import { formatCount, type HomeDish, type HomeKitchen } from '@/lib/home-filters';

/** The home page's translate function, passed to the helpers below. */
export type HomeT = (key: HomeKey, vars?: Vars) => string;

const PK_TIME_ZONE = 'Asia/Karachi';

const AVAILABILITY_LABELS: Record<PublicSellerAvailability['status'], HomeKey> = {
  open: 'avail.open',
  closed: 'avail.closed',
  busy: 'avail.busy',
  vacation: 'avail.vacation',
  holiday: 'avail.holiday',
  preorder_only: 'avail.preorder_only',
};

const BUSINESS_TYPE_LABELS: Record<string, HomeKey> = {
  home_kitchen: 'biz.home_kitchen',
  restaurant: 'biz.restaurant',
  bakery: 'biz.bakery',
  cafe: 'biz.cafe',
  cloud_kitchen: 'biz.cloud_kitchen',
};

const PRODUCT_TYPE_LABELS: Record<string, HomeKey> = {
  frozen: 'ptype.frozen',
  fresh: 'ptype.fresh',
  ready_to_eat: 'ptype.ready_to_eat',
  ready_to_cook: 'ptype.ready_to_cook',
};

/** "evening_snacks" → "Evening snacks"; labels that already have capitals are kept as typed. */
function humanize(value: unknown): string {
  const text = String(value ?? '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text === text.toLowerCase() ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function businessTypeLabel(t: HomeT, type?: string | null): string {
  if (!type) return t('biz.home_kitchen');
  const key = BUSINESS_TYPE_LABELS[type];
  return key ? t(key) : humanize(type) || t('biz.home_kitchen');
}

const pkDayKey = (date: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: PK_TIME_ZONE }).format(date);

/** A kitchen open/close instant as "11:00 PM", "tomorrow 9:00 AM", "Mon 9:00 AM" or "Oct 20 9:00 AM" (Pakistan time). */
function formatKitchenTime(t: HomeT, locale: Locale, value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: PK_TIME_ZONE }).format(date);
  const now = new Date();
  const day = pkDayKey(date);
  if (day === pkDayKey(now)) return time;
  if (day === pkDayKey(new Date(now.getTime() + 24 * 60 * 60 * 1000))) return t('tomorrowAt', { time });
  const withinWeek = date.getTime() - now.getTime() < 6 * 24 * 60 * 60 * 1000;
  const prefix = new Intl.DateTimeFormat(
    locale === 'ur' ? 'ur-PK' : 'en-US',
    withinWeek ? { weekday: 'short', timeZone: PK_TIME_ZONE } : { month: 'short', day: 'numeric', timeZone: PK_TIME_ZONE },
  ).format(date);
  return `${prefix} ${time}`;
}

/** Only the delivery terms the kitchen actually configured; nothing when it set none. */
function deliveryTerms(t: HomeT, s: PublicSeller): { text: string | null; free: boolean } {
  const fixed = s.deliveryFeeFixed != null ? Number(s.deliveryFeeFixed) : null;
  if (s.deliveryFeeType === 'fixed' && fixed != null && Number.isFinite(fixed) && fixed >= 0) {
    return fixed === 0 ? { text: t('freeDelivery'), free: true } : { text: t('deliveryFixed', { fee: formatPrice(fixed) }), free: false };
  }
  const threshold = s.freeDeliveryThreshold != null ? Number(s.freeDeliveryThreshold) : null;
  if (threshold != null && Number.isFinite(threshold)) {
    return threshold > 0
      ? { text: t('freeDeliveryOver', { amount: formatPrice(threshold) }), free: true }
      : { text: t('freeDelivery'), free: true };
  }
  return { text: null, free: false };
}

export function toHomeKitchen(s: PublicSeller, t: HomeT, locale: Locale): HomeKitchen {
  const products = s.products ?? [];
  const cuisine = Array.from(new Set((s.mealCategories ?? []).map(humanize).filter(Boolean)));
  const area = (s.chef?.area || s.community?.name || '').split(',')[0].trim();
  const city = s.chef?.city || s.community?.city || '';
  const availability = s.availability;
  const isOpen = availability?.isOpen === true;
  const prep = Number(s.minPrepTimeMinutes);
  const minOrder = s.minOrderAmountForDelivery != null ? Number(s.minOrderAmountForDelivery) : null;
  const ratingValue = Number(s.ratingAverage) || 0;
  const reviewsCount = Number(s.totalReviews) || 0;
  const delivery = deliveryTerms(t, s);

  return {
    id: s.id,
    name: s.businessName,
    chef: s.chef?.name && s.chef.name !== s.businessName ? s.chef.name : '',
    area,
    rating: displayRating(ratingValue, reviewsCount),
    ratingValue,
    reviewsCount,
    prepMinutes: Number.isFinite(prep) && prep > 0 ? prep : null,
    isOpen,
    statusLabel: availability ? t(isOpen ? 'avail.open' : (AVAILABILITY_LABELS[availability.status] ?? 'avail.closed')) : null,
    closesAt: isOpen ? formatKitchenTime(t, locale, availability?.closesAt) : null,
    opensAt: isOpen ? null : formatKitchenTime(t, locale, availability?.opensAt ?? availability?.nextOpenAt),
    deal: products.some((p) => p.originalPrice != null && Number(p.originalPrice) > Number(p.price)) ? t('deal') : null,
    deliveryFee: delivery.text,
    offersFreeDelivery: delivery.free,
    minOrder: minOrder != null && Number.isFinite(minOrder) && minOrder > 0 ? formatPrice(minOrder) : null,
    cuisine,
    coverPhoto: s.coverImageUrl || null,
    avatar: s.chef?.avatar || null,
    badge: businessTypeLabel(t, s.businessType),
    hasFrozen: products.some((p) => p.productType === 'frozen') || cuisine.some((c) => /frozen/i.test(c)),
    searchText: [s.businessName, s.chef?.name, area, city, s.community?.name, ...cuisine, ...products.map((p) => p.name)]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    href: `/kitchens/${s.id}`,
  };
}

export function toHomeDish(p: Product, t: HomeT): HomeDish {
  const price = Number(p.price);
  const original = p.originalPrice != null ? Number(p.originalPrice) : null;
  return {
    id: p.id,
    name: p.name,
    kitchenName: p.seller?.businessName ?? '',
    kitchenId: p.seller?.id ?? '',
    price,
    originalPrice: original != null && Number.isFinite(original) && original > price ? original : null,
    rating: displayRating(p.ratingAverage, p.totalReviews),
    isFrozen: p.productType === 'frozen',
    typeLabel: p.productType && PRODUCT_TYPE_LABELS[p.productType] ? t(PRODUCT_TYPE_LABELS[p.productType]) : null,
    photo: p.primaryImage || null,
  };
}

/** "1 review" / "12 reviews": the one/many message keys, filled with the formatted count. */
export const countLabel = (t: HomeT, n: number, one: HomeKey, many: HomeKey) => t(n === 1 ? one : many, { n: formatCount(n) });

export function kitchenCaption(t: HomeT, k: HomeKitchen): string | null {
  const prep = k.prepMinutes != null ? t('minPrep', { n: k.prepMinutes }) : null;
  if (k.isOpen) return prep ?? t('avail.open');
  return k.statusLabel ?? prep;
}
