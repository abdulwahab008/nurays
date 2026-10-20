/**
 * The home page's kitchen filters and its platform numbers. No imports, so a unit test can read it
 * (tests/unit/home-filters.test.ts); the mapping from the API's sellers and dishes is in home-feed.ts.
 */

export type LoadState = 'loading' | 'ready' | 'error';

export const KITCHEN_FILTERS = ['all', 'top_rated', 'fast', 'free_delivery', 'deals', 'frozen'] as const;
export type KitchenFilter = (typeof KITCHEN_FILTERS)[number];

export const isKitchenFilter = (value: string): value is KitchenFilter => (KITCHEN_FILTERS as readonly string[]).includes(value);

export const TOP_RATED_MIN_RATING = 4.5;
export const TOP_RATED_MIN_REVIEWS = 5;
export const QUICK_PREP_MAX_MINUTES = 30;

/** A kitchen card's data, mapped from a real PublicSeller. Missing values are null, never invented. */
export interface HomeKitchen {
  id: string;
  name: string;
  /** Chef's name; empty when it's just the business name again. */
  chef: string;
  area: string;
  /** Display rating ("4.6"), or null when there are no reviews yet (shown as "New"). */
  rating: string | null;
  ratingValue: number;
  reviewsCount: number;
  prepMinutes: number | null;
  isOpen: boolean;
  /** "Open now" / "Closed" / "Busy right now" …, or null when availability is unknown. */
  statusLabel: string | null;
  closesAt: string | null;
  opensAt: string | null;
  /** "Deal" only when one of the kitchen's dishes is really discounted. */
  deal: string | null;
  deliveryFee: string | null;
  offersFreeDelivery: boolean;
  minOrder: string | null;
  cuisine: string[];
  coverPhoto: string | null;
  avatar: string | null;
  badge: string;
  hasFrozen: boolean;
  searchText: string;
  href: string;
}

/** A dish card's data, mapped from a real Product. */
export interface HomeDish {
  id: string;
  name: string;
  kitchenName: string;
  kitchenId: string;
  price: number;
  /** Only set when the API gives an original price above the current price. */
  originalPrice: number | null;
  rating: string | null;
  isFrozen: boolean;
  typeLabel: string | null;
  photo: string | null;
}

/** GET /stats/public */
export interface PublicStats {
  kitchens: number;
  communities: number;
  dishes: number;
  reviews: number;
  averageRating: number | null;
}

/** The numbers from GET /stats/public, or null when the answer is not usable (the stats band then stays hidden). */
export function parseStats(data: unknown): PublicStats | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  if (!isCount(d.kitchens) || !isCount(d.communities) || !isCount(d.dishes)) return null;
  return {
    kitchens: d.kitchens,
    communities: d.communities,
    dishes: d.dishes,
    reviews: isCount(d.reviews) ? d.reviews : 0,
    averageRating: typeof d.averageRating === 'number' && Number.isFinite(d.averageRating) ? d.averageRating : null,
  };
}

export function matchesText(k: HomeKitchen, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return k.searchText.includes(q) || (q === 'frozen' && k.hasFrozen);
}

/** The kitchens the search box, the cuisine carousel and the filter chip all let through. */
export function filterKitchens(kitchens: HomeKitchen[], search: string, cuisine: string, filter: KitchenFilter): HomeKitchen[] {
  return kitchens.filter((k) => {
    if (!matchesText(k, search)) return false;
    if (cuisine && !matchesText(k, cuisine)) return false;
    switch (filter) {
      case 'top_rated':
        return k.ratingValue >= TOP_RATED_MIN_RATING && k.reviewsCount >= TOP_RATED_MIN_REVIEWS;
      case 'fast':
        return k.prepMinutes != null && k.prepMinutes < QUICK_PREP_MAX_MINUTES;
      case 'free_delivery':
        return k.offersFreeDelivery;
      case 'deals':
        return k.deal != null;
      case 'frozen':
        return k.hasFrozen;
      default:
        return true;
    }
  });
}

export const formatCount = (n: number) => n.toLocaleString('en-US');
