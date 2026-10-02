'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  Search,
  Star,
  Clock,
  Bike,
  ShieldCheck,
  Heart,
  MapPin,
  Snowflake,
  ChefHat,
  ChevronRight,
  ArrowUpDown,
  ShoppingBag,
} from 'lucide-react';
import { BrandLockup } from '@/components/ui/Mark';
import { CoverImage } from '@/components/ui/CoverImage';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import { displayRating, formatPrice } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { CommunitySelector } from '@/components/community/CommunitySelector';
import { useT } from '@/lib/i18n';
import { browseMessages, businessTypeKey, type BrowseT } from '@/lib/i18n/messages/browse';
import { kitchenMessages, kitchenKey, type KitchenT } from '@/lib/i18n/messages/kitchen';

/** A kitchen card, built only from what the API returns — no made-up defaults. */
interface Kitchen {
  id: string;
  name: string;
  chef: string;
  /** "Area, City", or '' when the kitchen hasn't set a location. */
  area: string;
  /** Rating to show ("4.6"), or null when there are no reviews yet (shown as "New"). */
  rating: string | null;
  /** Numeric rating for sorting/filtering; 0 when there are no reviews. */
  ratingValue: number;
  reviewsCount: number;
  /** The kitchen's own delivery terms (see describeDeliveryFee). */
  deliveryFeeType: string | null;
  fixedFee: number | null;
  freeOver: number | null;
  offersFreeDelivery: boolean;
  /** Minimum order for delivery, or null when the kitchen has none. */
  minOrder: number | null;
  isOpen: boolean;
  /** The API's availability (see describeOpenState); null when the API didn't say. */
  availability: PublicSellerAvailability | null;
  /** At least one dish is really discounted (the API's originalPrice is above its price). */
  hasDiscount: boolean;
  cuisine: string[];
  coverPhoto: string | null;
  avatar: string | null;
  businessType: string | null;
  href: string;
  isSubZero: boolean;
}

type SortOption = 'rating' | 'reviews';
type LoadStatus = 'loading' | 'ready' | 'error';

// Kitchens set their hours in Pakistan time.
const PKT = 'Asia/Karachi';

// Kitchen type labels: browseMessages `biz.*`. Closed labels: kitchenMessages `closedShort.*`
// (kept short: the label sits on the card photo next to the verified badge).

function positiveAmount(value: number | null | undefined): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegativeAmount(value: number | null | undefined): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n >= 0 ? n : null;
}

/** "today at 7:00 PM", "tomorrow at 1:00 PM", "Mon, Oct 5 at 1:00 PM"; null for a missing/invalid date. */
function formatWhen(iso: string | null | undefined, tk: KitchenT): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: PKT });
  const now = Date.now();
  const day =
    dayKey(date) === dayKey(new Date(now))
      ? tk('today')
      : dayKey(date) === dayKey(new Date(now + 86400000))
      ? tk('tomorrow')
      : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: PKT });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PKT });
  return tk('dayAt', { day, time });
}

function describeOpenState(
  availability: PublicSellerAvailability | null,
  tk: KitchenT,
): { label: string | null; detail: string | null } {
  if (!availability) return { label: null, detail: null };
  if (availability.isOpen) {
    const closes = formatWhen(availability.closesAt, tk);
    return { label: tk('openNow'), detail: closes ? tk('openNowCloses', { when: closes }) : tk('openNow') };
  }
  const closedKey = kitchenKey('closedShort', availability.status);
  const label = closedKey ? tk(closedKey) : tk('closed');
  const opens = formatWhen(availability.opensAt || availability.nextOpenAt, tk);
  return { label, detail: opens ? tk('labelOpens', { label, when: opens }) : label };
}

/** The kitchen's own delivery terms in a few words, or null when it hasn't set any. */
function describeDeliveryFee(
  feeType: string | null | undefined,
  fixedFee: number | null,
  freeOver: number | null,
  tk: KitchenT,
): string | null {
  if (fixedFee === 0) return tk('freeDelivery');
  if (freeOver != null) return tk('freeOver', { amount: formatPrice(freeOver) });
  if (fixedFee != null) return tk('amountDelivery', { amount: formatPrice(fixedFee) });
  if (feeType === 'distance') return tk('feeByDistance');
  return null;
}

/** "Verified Home Kitchen" — only verified, approved kitchens are listed by the API. */
function verifiedBadge(businessType: string | null, tb: BrowseT, tk: KitchenT): string {
  const typeKey = businessTypeKey(businessType);
  return tk('verifiedType', { type: typeKey ? tb(typeKey) : tk('kitchenFallback') });
}

/** "evening_snacks" -> "Evening snacks" */
function formatCategory(category: string): string {
  const text = category.replace(/_/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function toKitchen(s: PublicSeller): Kitchen {
  const reviewsCount = Number(s.totalReviews) || 0;
  const rating = displayRating(s.ratingAverage, reviewsCount);
  const products = s.products ?? [];
  const area = [s.chef?.area, s.chef?.city || s.community?.city].filter(Boolean).join(', ') || s.community?.name || '';
  const freeOver = positiveAmount(s.freeDeliveryThreshold);
  const fixedFee = s.deliveryFeeType === 'fixed' ? nonNegativeAmount(s.deliveryFeeFixed) : null;

  return {
    id: s.id,
    name: s.businessName,
    chef: s.chef?.name || s.businessName,
    area,
    rating,
    ratingValue: rating ? Number(s.ratingAverage) : 0,
    reviewsCount,
    deliveryFeeType: s.deliveryFeeType ?? null,
    fixedFee,
    freeOver,
    offersFreeDelivery: fixedFee === 0 || freeOver != null,
    minOrder: positiveAmount(s.minOrderAmountForDelivery),
    isOpen: s.availability?.isOpen === true,
    availability: s.availability ?? null,
    hasDiscount: products.some((p) => p.originalPrice != null && Number(p.originalPrice) > Number(p.price)),
    cuisine: (s.mealCategories ?? []).map(formatCategory),
    coverPhoto: s.coverImageUrl || null,
    avatar: s.chef?.avatar || null,
    businessType: s.businessType ?? null,
    href: `/kitchens/${s.id}`,
    isSubZero: products.some((p) => p.productType === 'frozen'),
  };
}

export default function KitchensDirectoryPage() {
  const { isAuthenticated } = useAuthStore();
  const { items: cartItems } = useCartStore();
  const tb = useT(browseMessages);
  const tk = useT(kitchenMessages);
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Calls the API directly: sellerService.getPublicSellers() turns a failed request into an
    // empty list, which would wrongly tell people there are no kitchens instead of offering a retry.
    apiClient
      .get<ApiResponse<PublicSeller[]>>('/sellers', { params: { limit: 50 } })
      .then((res) => {
        if (cancelled) return;
        setKitchens((res.data?.data ?? []).map(toKitchen));
        setStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load kitchens directory:', err);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const retry = () => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  };

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredKitchens = useMemo(() => {
    const q = search.trim().toLowerCase();
    return kitchens
      .filter((k) => {
        if (q) {
          const matchesName = k.name.toLowerCase().includes(q);
          const matchesChef = k.chef.toLowerCase().includes(q);
          const matchesArea = k.area.toLowerCase().includes(q);
          const matchesCuisine = k.cuisine.some((c) => c.toLowerCase().includes(q));
          if (!matchesName && !matchesChef && !matchesArea && !matchesCuisine) return false;
        }

        if (selectedFilter === 'top_rated' && (!k.rating || k.ratingValue < 4.85)) return false;
        if (selectedFilter === 'open_now' && !k.isOpen) return false;
        if (selectedFilter === 'free_delivery' && !k.offersFreeDelivery) return false;
        if (selectedFilter === 'frozen' && !k.isSubZero) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'reviews') return b.reviewsCount - a.reviewsCount;
        // Highest rated first; kitchens with no reviews yet ("New") come after rated ones.
        return b.ratingValue - a.ratingValue || b.reviewsCount - a.reviewsCount;
      });
  }, [kitchens, search, selectedFilter, sortBy]);

  // Average over every review across the listed kitchens; null until someone has reviewed.
  const averageRating = useMemo(() => {
    let total = 0;
    let count = 0;
    for (const k of kitchens) {
      if (!k.rating) continue;
      total += k.ratingValue * k.reviewsCount;
      count += k.reviewsCount;
    }
    return count > 0 ? (total / count).toFixed(1) : null;
  }, [kitchens]);

  const isReady = status === 'ready';
  const kitchenCountLabel = tk(kitchens.length === 1 ? 'countOne' : 'countMany', { count: kitchens.length });

  const renderToolbar = () => (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
      <div className="relative flex-1 max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tk('searchPlaceholder')}
          className="w-full h-10 ps-10 pe-4 rounded-xl bg-slate-50 hover:bg-slate-100 focus:bg-white text-xs font-medium text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:border-[#FF5500] focus:ring-2 focus:ring-orange-500/10 outline-none transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
        {[
          { id: 'all', label: tk('chipAll'), icon: ChefHat },
          { id: 'top_rated', label: tk('chipTopRated'), icon: Star },
          { id: 'open_now', label: tk('chipOpenNow'), icon: Clock },
          { id: 'free_delivery', label: tk('chipFreeDelivery'), icon: Bike },
          { id: 'frozen', label: tk('chipFrozen'), icon: Snowflake },
        ].map((chip) => {
          const Icon = chip.icon;
          const isActive = selectedFilter === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setSelectedFilter(chip.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{chip.label}</span>
            </button>
          );
        })}

        <div className="h-4 w-px bg-slate-200 mx-1 hidden lg:block" />

        <div className="hidden lg:flex items-center gap-1 text-xs text-slate-500">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="bg-transparent text-xs font-semibold text-slate-700 outline-none cursor-pointer"
          >
            <option value="rating">{tk('sortRating')}</option>
            <option value="reviews">{tk('sortReviews')}</option>
          </select>
        </div>
      </div>
    </div>
  );

  const renderLoadingSkeleton = () => (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6"
      aria-busy="true"
      aria-label={tk('loadingKitchens')}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden animate-pulse"
        >
          <div className="aspect-[16/10] w-full bg-slate-100" />
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded bg-slate-100" />
                <div className="h-2.5 w-1/2 rounded bg-slate-100" />
              </div>
            </div>
            <div className="h-3 w-3/4 rounded bg-slate-100" />
            <div className="pt-2.5 border-t border-slate-100 flex gap-1">
              <div className="h-4 w-16 rounded-md bg-slate-100" />
              <div className="h-4 w-12 rounded-md bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderKitchensGrid = (isPublic: boolean) => (
    <div className={isPublic ? 'max-w-[1400px] mx-auto px-4 sm:px-6 py-8' : 'py-2'}>
      {isReady && kitchens.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-semibold text-slate-500">
            {tk(filteredKitchens.length === 1 ? 'showingVerifiedOne' : 'showingVerifiedMany')
              .split(/(\{count\})/)
              .map((part, i) =>
                part === '{count}' ? (
                  <span key={i} className="font-bold text-slate-900">{filteredKitchens.length}</span>
                ) : (
                  part
                ),
              )}
          </p>
          {selectedFilter !== 'all' && (
            <button
              onClick={() => setSelectedFilter('all')}
              className="text-xs font-semibold text-[#FF5500] hover:underline"
            >
              {tk('resetFilters')}
            </button>
          )}
        </div>
      )}

      {status === 'loading' ? (
        renderLoadingSkeleton()
      ) : status === 'error' ? (
        <div
          role="alert"
          className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-12"
        >
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">{tk('loadError')}</h3>
          <p className="text-xs text-slate-500 mb-5">
            {tk('loadErrorBody')}
          </p>
          <button
            onClick={retry}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-colors"
          >
            {tk('tryAgain')}
          </button>
        </div>
      ) : kitchens.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-12">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">{tk('noneListed')}</h3>
          <p className="text-xs text-slate-500">
            {tk('noneListedBody')}
          </p>
        </div>
      ) : filteredKitchens.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-12">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900 mb-1">{tk('noMatch')}</h3>
          <p className="text-xs text-slate-500 mb-5">
            {tk('noMatchBody')}
          </p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedFilter('all');
            }}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-colors"
          >
            {tk('viewAll')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
          {filteredKitchens.map((kitchen) => {
            const isFav = favorites.has(kitchen.id);
            const open = describeOpenState(kitchen.availability, tk);
            const deliveryFee = describeDeliveryFee(kitchen.deliveryFeeType, kitchen.fixedFee, kitchen.freeOver, tk);
            return (
              <Link
                key={kitchen.id}
                href={kitchen.href}
                className="group flex flex-col justify-between bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200 overflow-hidden"
              >
                {/* Photo Container */}
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-slate-100">
                  <CoverImage
                    src={kitchen.coverPhoto}
                    alt={kitchen.name}
                    label={kitchen.name}
                    size="md"
                    className="w-full h-full transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10" />

                  {/* Discount Ribbon — only when a dish really is discounted */}
                  {kitchen.hasDiscount && (
                    <span className="absolute top-3 start-3 px-2.5 py-1 rounded-md text-white text-[10px] font-bold bg-[#FF5500] shadow-xs uppercase tracking-wider">
                      {tk('discounted')}
                    </span>
                  )}

                  {/* Heart Favorite Button */}
                  <button
                    onClick={(e) => toggleFavorite(kitchen.id, e)}
                    className="absolute top-3 end-3 w-8 h-8 rounded-full bg-white/90 backdrop-blur-xs flex items-center justify-center text-slate-700 hover:scale-110 transition-transform shadow-xs"
                    aria-label={tk('saveFav')}
                  >
                    <Heart
                      className={`w-4 h-4 transition-colors ${
                        isFav ? 'fill-red-500 text-red-500' : 'text-slate-600 hover:text-red-500'
                      }`}
                    />
                  </button>

                  {/* Opening State Pill (from the API's availability) */}
                  {open.label && (
                    <span
                      title={open.detail ?? undefined}
                      className="absolute bottom-3 end-3 px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-xs text-white text-[11px] font-bold flex items-center gap-1 whitespace-nowrap"
                    >
                      <Clock className="w-3 h-3" />
                      <span>{open.label}</span>
                    </span>
                  )}

                  {/* Verified Kitchen Badge */}
                  <span className="absolute bottom-3 start-3 px-2 py-0.5 rounded-md bg-emerald-600/90 backdrop-blur-xs text-white text-[10px] font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{verifiedBadge(kitchen.businessType, tb, tk)}</span>
                  </span>
                </div>

                {/* Body Content */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CoverImage
                          src={kitchen.avatar}
                          alt={kitchen.chef}
                          label={kitchen.chef}
                          size="sm"
                          className="w-9 h-9 rounded-xl border border-slate-200 flex-shrink-0"
                        />
                        <div className="min-w-0">
                          <h2 className="text-sm font-bold text-slate-900 group-hover:text-[#FF5500] truncate transition-colors">
                            {kitchen.name}
                          </h2>
                          <p className="text-[11px] text-slate-500 font-medium truncate flex items-center gap-1">
                            <span>{kitchen.chef}</span>
                            {kitchen.area && (
                              <>
                                <span>•</span>
                                <MapPin className="w-3 h-3 text-slate-400 inline flex-shrink-0" />
                                <span>{kitchen.area.split(',')[0]}</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* Rating pill — "New" until the kitchen has real reviews */}
                      <span
                        title={
                          kitchen.rating
                            ? tk(kitchen.reviewsCount === 1 ? 'ratingFromOne' : 'ratingFromMany', {
                                rating: kitchen.rating,
                                count: kitchen.reviewsCount,
                              })
                            : tk('noReviews')
                        }
                        className="flex-shrink-0 bg-amber-50 text-amber-900 px-2 py-0.5 rounded-lg text-xs font-bold border border-amber-200/80 flex items-center gap-1"
                      >
                        {kitchen.rating ? (
                          <>
                            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                            <span>{kitchen.rating}</span>
                          </>
                        ) : (
                          <span>{tk('new')}</span>
                        )}
                      </span>
                    </div>

                    {/* Delivery Line */}
                    <div className="mt-2 text-xs text-slate-600 font-medium flex items-center gap-2">
                      <span className="flex items-center gap-1 text-slate-700">
                        <Bike className="w-3.5 h-3.5 text-slate-400" />
                        {deliveryFee ?? tk('feeAtCheckout')}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[11px] text-slate-400">
                        {kitchen.minOrder != null ? tk('minAmount', { amount: formatPrice(kitchen.minOrder) }) : tk('noMin')}
                      </span>
                    </div>
                  </div>

                  {/* Cuisines */}
                  {kitchen.cuisine.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap gap-1">
                      {kitchen.cuisine.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 rounded-md bg-slate-50 text-[10px] font-semibold text-slate-600 border border-slate-100"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );

  // Authenticated customer: Render inside the customer DashboardLayout shell
  if (isAuthenticated) {
    return (
      <DashboardLayout
        title={tk('dashTitle')}
        subtitle={tk('dashSubtitle')}
        sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
        userType="customer"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-1">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition-colors py-1.5 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300"
            >
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5 rotate-180" />
              <span>{tk('browseAllDishes')}</span>
            </Link>
            {isReady && (
              <span className="text-xs font-medium text-slate-500">
                {tk(filteredKitchens.length === 1 ? 'showingOne' : 'showingMany', { count: filteredKitchens.length })}
              </span>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">{tk('communityVerified')}</h2>
                <p className="text-xs text-slate-500">
                  {tk('orderDirect')}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {isReady && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700">
                    <ChefHat className="w-3.5 h-3.5 text-[#FF5500]" />
                    {tk(kitchens.length === 1 ? 'verifiedCountOne' : 'verifiedCountMany', { count: kitchens.length })}
                  </span>
                )}
              </div>
            </div>
            {renderToolbar()}
          </div>

          {renderKitchensGrid(false)}
        </div>
      </DashboardLayout>
    );
  }

  // Public visitor: Render with top marketplace header
  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 pb-24">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="hover:opacity-90 transition-opacity">
              <BrandLockup markSize={30} wordSize={20} />
            </Link>
            <div className="hidden sm:block">
              <CommunitySelector variant="navbar" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/products"
              className="hidden sm:inline-block text-xs font-semibold text-slate-700 hover:text-[#FF5500] transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
            >
              {tk('browseAllDishes')}
            </Link>
            <Link
              href="/cart"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-semibold transition-colors"
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>{tk('tray')}</span>
              {cartItems.length > 0 && (
                <span className="w-4 h-4 rounded-full bg-[#FF5500] text-white flex items-center justify-center text-[10px] font-bold">
                  {cartItems.length}
                </span>
              )}
            </Link>
            <Link
              href="/login"
              className="hidden sm:inline-block text-xs font-semibold text-slate-700 hover:text-[#FF5500] px-2 py-1.5"
            >
              {tk('signIn')}
            </Link>
            <Link
              href="/register"
              className="px-3.5 py-1.5 rounded-xl bg-[#FF5500] hover:bg-[#e04400] text-white text-xs font-bold transition-colors shadow-2xs"
            >
              {tk('join')}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Header */}
      <section className="bg-white border-b border-slate-200/80 py-8">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[#FF5500] text-xs font-bold uppercase tracking-wider mb-2.5">
                <ChefHat className="w-3.5 h-3.5" />
                <span>{tk('heroBadge')}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {tk('dashTitle')}
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1 max-w-2xl leading-relaxed">
                {tk('heroBody')}
              </p>
            </div>

            {/* Quick Metrics Pills — real counts, "—" while loading */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-start">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{tk('dashTitle')}</div>
                <div className="text-sm font-bold text-slate-900">{isReady ? kitchenCountLabel : '—'}</div>
              </div>
              <div className="px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-start">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{tk('averageRating')}</div>
                <div className="text-sm font-bold text-amber-700 flex items-center gap-1">
                  {!isReady ? (
                    <span>—</span>
                  ) : averageRating ? (
                    <>
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span>{averageRating} / 5.0</span>
                    </>
                  ) : (
                    <span>{tk('noReviews')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            {renderToolbar()}
          </div>
        </div>
      </section>

      {/* Kitchens Grid */}
      <main>
        {renderKitchensGrid(true)}
      </main>
    </div>
  );
}
