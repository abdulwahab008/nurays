'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
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
} from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import { displayRating, formatPrice } from '@/lib/utils';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useT } from '@/lib/i18n';
import { browseMessages, businessTypeKey, type BrowseT } from '@/lib/i18n/messages/browse';
import { kitchenMessages, kitchenKey, type KitchenT } from '@/lib/i18n/messages/kitchen';
import { useShallow } from 'zustand/react/shallow';

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
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
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
        <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={tk('searchPlaceholder')}
          aria-label={tk('searchPlaceholder')}
          className="w-full h-12 ps-10 pe-10 rounded-[14px] bg-raised focus:bg-surface text-[15px] font-semibold text-ink placeholder:text-muted placeholder:font-medium border border-transparent focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            aria-label={tk('clearSearch')}
            className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-sm text-muted hover:text-ink hover:bg-line"
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
              aria-pressed={isActive}
              className={`flex-shrink-0 flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                isActive ? 'bg-ink text-page' : 'bg-surface hover:bg-raised text-ink border border-line'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{chip.label}</span>
            </button>
          );
        })}

        <div className="h-4 w-px bg-line mx-1 hidden lg:block" />

        <div className="hidden lg:flex flex-shrink-0 items-center gap-1 text-sm text-muted">
          <ArrowUpDown className="w-3.5 h-3.5" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label={tk('sortLabel')}
            className="bg-transparent text-sm font-bold text-ink outline-none cursor-pointer"
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
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6"
      aria-busy="true"
      aria-label={tk('loadingKitchens')}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-surface rounded-[20px] border border-line overflow-hidden animate-pulse"
        >
          <div className="aspect-[16/10] w-full bg-raised" />
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-raised flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 rounded bg-raised" />
                <div className="h-2.5 w-1/2 rounded bg-raised" />
              </div>
            </div>
            <div className="h-3 w-3/4 rounded bg-raised" />
            <div className="pt-2.5 border-t border-line flex gap-1">
              <div className="h-4 w-16 rounded-md bg-raised" />
              <div className="h-4 w-12 rounded-md bg-raised" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );

  const renderKitchensGrid = (isPublic: boolean) => (
    <div className={isPublic ? 'max-w-[1280px] mx-auto px-4 sm:px-8 py-8' : 'py-2'}>
      {isReady && kitchens.length > 0 && (
        <div className="flex items-center justify-between mb-6">
          <p className="text-xs font-semibold text-muted">
            {tk(filteredKitchens.length === 1 ? 'showingVerifiedOne' : 'showingVerifiedMany')
              .split(/(\{count\})/)
              .map((part, i) =>
                part === '{count}' ? (
                  <span key={i} className="font-bold text-ink">{filteredKitchens.length}</span>
                ) : (
                  part
                ),
              )}
          </p>
          {selectedFilter !== 'all' && (
            <button
              onClick={() => setSelectedFilter('all')}
              className="text-xs font-semibold text-brand-ink hover:underline"
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
          className="bg-surface rounded-[20px] border border-dashed border-line-strong p-10 text-center max-w-md mx-auto my-12"
        >
          <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ink mb-1">{tk('loadError')}</h3>
          <p className="text-xs text-muted mb-5">
            {tk('loadErrorBody')}
          </p>
          <button
            onClick={retry}
            className="h-11 px-5 rounded-xl bg-brand text-on-brand text-sm font-extrabold hover:bg-brand-500 transition-colors"
          >
            {tk('tryAgain')}
          </button>
        </div>
      ) : kitchens.length === 0 ? (
        <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-10 text-center max-w-md mx-auto my-12">
          <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ink mb-1">{tk('noneListed')}</h3>
          <p className="text-xs text-muted">
            {tk('noneListedBody')}
          </p>
        </div>
      ) : filteredKitchens.length === 0 ? (
        <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-10 text-center max-w-md mx-auto my-12">
          <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-3">
            <ChefHat className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-ink mb-1">{tk('noMatch')}</h3>
          <p className="text-xs text-muted mb-5">
            {tk('noMatchBody')}
          </p>
          <button
            onClick={() => {
              setSearch('');
              setSelectedFilter('all');
            }}
            className="h-11 px-5 rounded-xl bg-brand text-on-brand text-sm font-extrabold hover:bg-brand-500 transition-colors"
          >
            {tk('viewAll')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredKitchens.map((kitchen) => {
            const isFav = favorites.has(kitchen.id);
            const open = describeOpenState(kitchen.availability, tk);
            const deliveryFee = describeDeliveryFee(kitchen.deliveryFeeType, kitchen.fixedFee, kitchen.freeOver, tk);
            return (
              <Link
                key={kitchen.id}
                href={kitchen.href}
                className="group flex flex-col bg-surface rounded-[20px] border border-line hover:border-line-strong hover:shadow-[var(--shadow-card)] transition-all duration-200 overflow-hidden"
              >
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-raised">
                  <CoverImage
                    src={kitchen.coverPhoto}
                    alt={kitchen.name}
                    label={kitchen.name}
                    size="md"
                    className="w-full h-full transition-transform duration-500 group-hover:scale-[1.03]"
                  />

                  {/* Only when a dish really is discounted */}
                  {kitchen.hasDiscount && (
                    <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-accent text-on-accent text-[11px] font-extrabold">
                      {tk('discounted')}
                    </span>
                  )}

                  <button
                    onClick={(e) => toggleFavorite(kitchen.id, e)}
                    className="absolute top-3 end-3 w-9 h-9 rounded-full bg-surface/95 flex items-center justify-center text-ink hover:scale-105 transition-transform shadow-xs"
                    aria-label={tk('saveFav')}
                    aria-pressed={isFav}
                  >
                    <Heart
                      className={`w-4 h-4 transition-colors ${
                        isFav ? 'fill-red-500 text-red-500' : 'text-muted hover:text-red-500'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-4 flex-1 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-extrabold text-ink truncate">{kitchen.name}</h2>
                      <p className="text-[13px] text-muted truncate flex items-center gap-1">
                        <span>{kitchen.chef}</span>
                        {kitchen.area && (
                          <>
                            <span aria-hidden>·</span>
                            <MapPin className="w-3 h-3 inline flex-shrink-0" aria-hidden />
                            <span>{kitchen.area.split(',')[0]}</span>
                          </>
                        )}
                      </p>
                    </div>

                    {/* "New" until the kitchen has real reviews */}
                    {kitchen.rating ? (
                      <span
                        title={tk(kitchen.reviewsCount === 1 ? 'ratingFromOne' : 'ratingFromMany', {
                          rating: kitchen.rating,
                          count: kitchen.reviewsCount,
                        })}
                        className="flex-shrink-0 flex items-center gap-1 text-sm font-extrabold text-ink"
                      >
                        <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
                        <span>{kitchen.rating}</span>
                      </span>
                    ) : (
                      <span
                        title={tk('noReviews')}
                        className="flex-shrink-0 px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink text-[11px] font-extrabold"
                      >
                        {tk('new')}
                      </span>
                    )}
                  </div>

                  {kitchen.cuisine.length > 0 && <p className="text-[13px] text-muted truncate">{kitchen.cuisine.join(' · ')}</p>}

                  <div className="mt-auto pt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold text-muted">
                    {/* From the API's availability */}
                    {open.label && (
                      <span
                        title={open.detail ?? undefined}
                        className={`px-2 py-0.5 rounded-full font-extrabold ${
                          kitchen.isOpen ? 'bg-brand-soft text-brand-soft-ink' : 'bg-raised text-muted'
                        }`}
                      >
                        {open.label}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Bike className="w-3.5 h-3.5" aria-hidden />
                      {deliveryFee ?? tk('feeAtCheckout')}
                    </span>
                    <span>
                      {kitchen.minOrder != null ? tk('minAmount', { amount: formatPrice(kitchen.minOrder) }) : tk('noMin')}
                    </span>
                  </div>

                  <span className="flex items-center gap-1 text-[11px] font-bold text-brand-ink">
                    <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
                    <span>{verifiedBadge(kitchen.businessType, tb, tk)}</span>
                  </span>
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
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-brand-ink transition-colors py-1.5 px-3 rounded-xl bg-surface border border-line shadow-2xs hover:border-line-strong"
            >
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5 rotate-180" />
              <span>{tk('browseAllDishes')}</span>
            </Link>
            {isReady && (
              <span className="text-xs font-medium text-muted">
                {tk(filteredKitchens.length === 1 ? 'showingOne' : 'showingMany', { count: filteredKitchens.length })}
              </span>
            )}
          </div>

          <div className="bg-surface rounded-2xl border border-line p-5 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
              <div>
                <h2 className="text-base font-bold text-ink">{tk('communityVerified')}</h2>
                <p className="text-xs text-muted">
                  {tk('orderDirect')}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {isReady && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-raised border border-line text-xs font-semibold text-ink">
                    <ChefHat className="w-3.5 h-3.5 text-brand-ink" />
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
    <div className="min-h-screen bg-page text-ink pb-24">
      <SiteHeader />

      {/* Hero Header */}
      <section className="pt-6 sm:pt-10 pb-2">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-accent-soft text-accent-soft-ink text-xs sm:text-[13px] font-extrabold mb-3">
                <ChefHat className="w-3.5 h-3.5" />
                <span>{tk('heroBadge')}</span>
              </div>
              <h1 className="text-[28px] sm:text-[40px] leading-tight font-extrabold tracking-tight text-ink">
                {tk('dashTitle')}
              </h1>
              <p className="text-[15px] sm:text-base text-muted mt-2 max-w-2xl leading-relaxed">
                {tk('heroBody')}
              </p>
            </div>

            {/* Quick Metrics Pills — real counts, "—" while loading */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="px-4 py-2.5 rounded-2xl bg-surface border border-line text-start">
                <div className="text-xs font-semibold text-muted">{tk('dashTitle')}</div>
                <div className="text-base font-extrabold text-ink">{isReady ? kitchenCountLabel : '—'}</div>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-surface border border-line text-start">
                <div className="text-xs font-semibold text-muted">{tk('averageRating')}</div>
                <div className="text-base font-extrabold text-ink flex items-center gap-1">
                  {!isReady ? (
                    <span>—</span>
                  ) : averageRating ? (
                    <>
                      <Star className="w-3.5 h-3.5 fill-accent text-accent" />
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
          <div className="mt-6">
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
