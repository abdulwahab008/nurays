'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Search, Star, Clock, Bike, ShieldCheck, Heart, MapPin, Snowflake, ChefHat, ArrowUpDown, X } from 'lucide-react';
import { CoverImage } from '@/components/ui/CoverImage';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { PublicSellerAvailability } from '@/lib/services/seller.service';
import { favoriteService } from '@/lib/services/favorite.service';
import { displayRating, formatPrice } from '@/lib/utils';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCommunityStore } from '@/lib/store/community-store';
import { kitchensForArea, quoteOf, quoteParams, type QuotedSeller } from '@/components/marketplace/delivery-quote';
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
  /** In the chosen area (rather than a nearby one that also delivers there). */
  inArea: boolean;
  /** Fee and time to the chosen area; null when no area is chosen or the API did not quote one. */
  quote: { fee: number; min: number | null; max: number | null } | null;
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
  return tk('dayAt', { day, time: `\u2066${time}\u2069` });
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

/** "Rs 50 delivery · 40–65 min" from the quote; null without one. */
function describeQuote(quote: Kitchen['quote'], tk: KitchenT): string | null {
  if (!quote) return null;
  const fee = quote.fee === 0 ? tk('freeDelivery') : tk('amountDelivery', { amount: formatPrice(quote.fee) });
  return quote.min != null && quote.max != null ? tk('feeAndTime', { fee, min: quote.min, max: quote.max }) : fee;
}

function toKitchen(s: QuotedSeller, communityId: string | null): Kitchen {
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
    inArea: communityId != null && s.community?.id === communityId,
    quote: quoteOf(s.delivery),
  };
}

export default function KitchensDirectoryPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { selectedCommunity, openSelectorModal } = useCommunityStore(
    useShallow((s) => ({ selectedCommunity: s.selectedCommunity, openSelectorModal: s.openSelectorModal })),
  );
  const communityId = selectedCommunity?.id ?? null;
  const tb = useT(browseMessages);
  const tk = useT(kitchenMessages);
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>('rating');
  const [kitchens, setKitchens] = useState<Kitchen[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  // With an area chosen, only the kitchens that deliver there (its own first), each with its fee and time.
  useEffect(() => {
    let cancelled = false;
    // Calls the API directly: sellerService.getPublicSellers() turns a failed request into an
    // empty list, which would wrongly tell people there are no kitchens instead of offering a retry.
    apiClient
      .get<ApiResponse<QuotedSeller[]>>('/sellers', { params: { limit: 50, ...quoteParams(communityId) } })
      .then((res) => {
        if (cancelled) return;
        setKitchens(kitchensForArea(res.data?.data ?? [], communityId).map((s) => toKitchen(s, communityId)));
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
  }, [reloadKey, communityId]);

  // The signed-in customer's saved kitchens, so the hearts show what is really saved.
  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    favoriteService
      .getFavorites()
      .then((list) => {
        if (!cancelled) setFavorites(new Set(list.map((f) => f.sellerId)));
      })
      .catch(() => {
        // Hearts start empty; saving still works.
      });
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const retry = () => {
    setStatus('loading');
    setReloadKey((k) => k + 1);
  };

  const toggleFavorite = async (kitchen: Kitchen, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    const wasSaved = favorites.has(kitchen.id);
    const setSaved = (saved: boolean) =>
      setFavorites((prev) => {
        const next = new Set(prev);
        if (saved) next.add(kitchen.id);
        else next.delete(kitchen.id);
        return next;
      });
    setSaved(!wasSaved);
    try {
      if (wasSaved) await favoriteService.removeFavorite(kitchen.id);
      else await favoriteService.addFavorite(kitchen.id);
      showToast(tk(wasSaved ? 'toastRemovedFav' : 'toastSavedFav', { name: kitchen.name }), 'info');
    } catch {
      setSaved(wasSaved);
      showToast(tk('toastFavFailed'), 'error');
    }
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

        if (selectedFilter === 'top_rated' && (!k.rating || k.ratingValue < 4.5)) return false;
        if (selectedFilter === 'open_now' && !k.isOpen) return false;
        if (selectedFilter === 'free_delivery' && !(k.quote ? k.quote.fee === 0 : k.offersFreeDelivery)) return false;
        if (selectedFilter === 'frozen' && !k.isSubZero) return false;

        return true;
      })
      .sort((a, b) => {
        // The chosen area's own kitchens stay first; the sort applies within each group.
        if (a.inArea !== b.inArea) return a.inArea ? -1 : 1;
        if (sortBy === 'reviews') return b.reviewsCount - a.reviewsCount;
        // Highest rated first; kitchens with no reviews yet ("New") come after rated ones.
        return b.ratingValue - a.ratingValue || b.reviewsCount - a.reviewsCount;
      });
  }, [kitchens, search, selectedFilter, sortBy]);

  const isReady = status === 'ready';
  const inArea = filteredKitchens.filter((k) => k.inArea);
  const nearby = filteredKitchens.filter((k) => !k.inArea);

  const renderCard = (kitchen: Kitchen) => {
    const isFav = favorites.has(kitchen.id);
    const open = describeOpenState(kitchen.availability, tk);
    const deliveryFee =
      describeQuote(kitchen.quote, tk) ?? describeDeliveryFee(kitchen.deliveryFeeType, kitchen.fixedFee, kitchen.freeOver, tk);
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

          {kitchen.hasDiscount && (
            <span className="absolute top-3 start-3 px-2.5 py-1 rounded-full bg-accent text-on-accent text-xs font-bold">
              {tk('discounted')}
            </span>
          )}

          {/* 36px to look at, 44px to tap */}
          <button
            type="button"
            onClick={(e) => toggleFavorite(kitchen, e)}
            className="absolute top-1 end-1 w-11 h-11 flex items-center justify-center"
            aria-label={isFav ? tk('removeFav') : tk('saveFav')}
            aria-pressed={isFav}
          >
            <span className="w-9 h-9 rounded-full bg-surface/95 flex items-center justify-center shadow-xs">
              <Heart className={`w-4 h-4 ${isFav ? 'fill-red-500 text-red-500' : 'text-muted'}`} aria-hidden />
            </span>
          </button>
        </div>

        <div className="p-4 flex-1 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-bold text-ink truncate flex items-center gap-1">
                <span className="truncate">{kitchen.name}</span>
                <ShieldCheck className="w-4 h-4 shrink-0 text-brand-ink" aria-label={verifiedBadge(kitchen.businessType, tb, tk)} />
              </h3>
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

            {kitchen.rating ? (
              <span
                title={tk(kitchen.reviewsCount === 1 ? 'ratingFromOne' : 'ratingFromMany', {
                  rating: kitchen.rating,
                  count: kitchen.reviewsCount,
                })}
                className="flex-shrink-0 flex items-center gap-1 text-sm font-bold text-ink"
              >
                <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
                <span>{kitchen.rating}</span>
              </span>
            ) : (
              <span title={tk('noReviews')} className="flex-shrink-0 px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink text-xs font-medium">
                {tk('new')}
              </span>
            )}
          </div>

          {kitchen.cuisine.length > 0 && <p className="text-[13px] text-muted truncate">{kitchen.cuisine.join(' · ')}</p>}

          <p className="mt-auto pt-1 flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Bike className="w-4 h-4 text-muted shrink-0" aria-hidden />
            <span className="truncate">{deliveryFee ?? tk('feeAtCheckout')}</span>
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-medium text-muted">
            {open.label && (
              <span
                title={open.detail ?? undefined}
                className={`px-2 py-0.5 rounded-full ${kitchen.isOpen ? 'bg-brand-soft text-brand-soft-ink' : 'bg-raised text-muted'}`}
              >
                {open.label}
              </span>
            )}
            <span>{kitchen.minOrder != null ? tk('minAmount', { amount: formatPrice(kitchen.minOrder) }) : tk('noMin')}</span>
          </div>
        </div>
      </Link>
    );
  };

  const grid = (list: Kitchen[]) => <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">{list.map(renderCard)}</div>;

  const emptyCard = (title: string, body: string, action?: React.ReactNode, role?: string) => (
    <div role={role} className="bg-surface rounded-[20px] border border-dashed border-line-strong p-8 text-center max-w-md mx-auto my-10">
      <ChefHat className="w-6 h-6 text-muted mx-auto mb-3" aria-hidden />
      <h3 className="text-base font-bold text-ink mb-1">{title}</h3>
      <p className="text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-6 pb-10">
        <h1 className="text-[24px] sm:text-[32px] leading-tight font-extrabold tracking-tight text-ink">
          {selectedCommunity ? tk('titleArea', { area: selectedCommunity.name }) : tk('titleAll')}
        </h1>
        {selectedCommunity ? (
          <p className="text-sm text-muted mt-1">
            {isReady ? tk(filteredKitchens.length === 1 ? 'showingOne' : 'showingMany', { count: filteredKitchens.length }) : ' '}
          </p>
        ) : (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-brand-soft p-4">
            <p className="flex items-start gap-2 text-sm text-brand-soft-ink">
              <MapPin className="w-4 h-4 mt-0.5 shrink-0" aria-hidden />
              <span>{tk('chooseAreaBody')}</span>
            </p>
            <Button onClick={openSelectorModal} className="h-11 shrink-0 rounded-xl">
              {tk('chooseArea')}
            </Button>
          </div>
        )}

        {/* Search and filters */}
        <div className="mt-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tk('searchPlaceholder')}
              aria-label={tk('searchPlaceholder')}
              className="w-full h-12 ps-10 pe-11 rounded-xl bg-raised focus:bg-surface text-[15px] text-ink placeholder:text-muted border border-transparent focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label={tk('clearSearch')}
                className="absolute end-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center text-muted hover:text-ink"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 lg:mx-0 lg:px-0">
            {[
              { id: 'all', label: tk('chipAll'), icon: ChefHat },
              { id: 'open_now', label: tk('chipOpenNow'), icon: Clock },
              { id: 'top_rated', label: tk('chipTopRated'), icon: Star },
              { id: 'free_delivery', label: tk('chipFreeDelivery'), icon: Bike },
              { id: 'frozen', label: tk('chipFrozen'), icon: Snowflake },
            ].map((chip) => {
              const Icon = chip.icon;
              const isActive = selectedFilter === chip.id;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setSelectedFilter(chip.id)}
                  aria-pressed={isActive}
                  className={`flex-shrink-0 flex items-center gap-1.5 h-11 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${
                    isActive ? 'bg-brand-soft text-brand-soft-ink border-brand' : 'bg-surface text-ink border-line hover:bg-raised'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  <span>{chip.label}</span>
                </button>
              );
            })}

            <label className="relative flex flex-shrink-0 items-center gap-1 h-11 px-3 rounded-full border border-line bg-surface text-sm text-muted">
              <ArrowUpDown className="w-4 h-4" aria-hidden />
              <span className="sr-only">{tk('sortLabel')}</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent text-sm font-semibold text-ink outline-none cursor-pointer"
              >
                <option value="rating">{tk('sortRating')}</option>
                <option value="reviews">{tk('sortReviews')}</option>
              </select>
            </label>
          </div>
        </div>

        <main className="mt-6">
          {status === 'loading' ? (
            <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
              <span className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" aria-hidden />
              {tk('loadingKitchens')}
            </div>
          ) : status === 'error' ? (
            emptyCard(tk('loadError'), tk('loadErrorBody'), <Button onClick={retry} className="h-11 rounded-xl">{tk('tryAgain')}</Button>, 'alert')
          ) : kitchens.length === 0 ? (
            selectedCommunity
              ? emptyCard(tk('noneInArea', { area: selectedCommunity.name }), tk('noneInAreaBody'), (
                  <Button variant="outline" onClick={openSelectorModal} className="h-11 rounded-xl">
                    {tk('changeArea')}
                  </Button>
                ))
              : emptyCard(tk('noneListed'), tk('noneListedBody'))
          ) : filteredKitchens.length === 0 ? (
            emptyCard(tk('noMatch'), tk('noMatchBody'), (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('');
                  setSelectedFilter('all');
                }}
                className="h-11 rounded-xl"
              >
                {tk('viewAll')}
              </Button>
            ))
          ) : selectedCommunity && inArea.length > 0 && nearby.length > 0 ? (
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-bold text-ink mb-3">{tk('inArea', { area: selectedCommunity.name })}</h2>
                {grid(inArea)}
              </section>
              <section className="border-t border-line pt-6">
                <h2 className="text-lg font-bold text-ink mb-3">{tk('alsoDelivers', { area: selectedCommunity.name })}</h2>
                {grid(nearby)}
              </section>
            </div>
          ) : (
            grid(filteredKitchens)
          )}
        </main>
      </div>
    </div>
  );
}
