'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { isAxiosError } from 'axios';
import { CoverImage } from '@/components/ui/CoverImage';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { displayRating, formatPrice } from '@/lib/utils';
import { apiClient, ApiResponse, apiErrorStatus, apiErrorCode, apiErrorDetails, errorMessage, type CartConflictDetails } from '@/lib/api-client';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import { cartService } from '@/lib/services/cart.service';
import { useCartStore } from '@/lib/store/cart-store';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useT } from '@/lib/i18n';
import { browseMessages, businessTypeKey, productTypeKey, type BrowseT } from '@/lib/i18n/messages/browse';
import { kitchenMessages, kitchenKey, type KitchenT } from '@/lib/i18n/messages/kitchen';
import {
  Star,
  Clock,
  Bike,
  ShieldCheck,
  ChefHat,
  MapPin,
  UtensilsCrossed,
  Flame,
  Snowflake,
  ChevronRight,
  ArrowLeft,
  Check,
  Bell,
  MessageSquare,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';

interface KitchenDish {
  id: string;
  name: string;
  nameUrdu?: string;
  description: string | null;
  price: number;
  /** Set only when the API's originalPrice is above the price (a real discount). */
  originalPrice: number | null;
  isFrozen: boolean;
  typeLabel: string;
  photo: string | null;
  /** e.g. "30 min prep" — only when the kitchen set a preparation time. */
  prepTime: string | null;
}

export interface KitchenReview {
  id: string;
  rating: number;
  comment?: string | null;
  createdAt: string;
  author: string;
  avatar?: string | null;
}

/** A kitchen's page, built only from what the API returns — no made-up defaults. */
export interface KitchenProfile {
  id: string;
  name: string;
  chefName: string;
  chefBio: string | null;
  area: string;
  /** Rating to show ("4.6"), or null when there are no reviews yet (shown as "New"). */
  rating: string | null;
  ratingValue: number;
  reviewCount: number;
  deliveryFee: string;
  minOrder: number | null;
  /** The API's availability; null when it wasn't provided, so no open/closed claim is made. */
  availability: PublicSellerAvailability | null;
  /** The API says the kitchen is closed right now. */
  isClosed: boolean;
  /** Takes pre-orders only (the seller's preOrderOnly setting or a 'preorder_only' status). */
  preOrderOnly: boolean;
  statusText: string | null;
  hoursText: string | null;
  opensAtText: string | null;
  coverPhoto: string | null;
  chefAvatar: string | null;
  verifiedLabel: string;
  storeNotice: string | null;
  reviews: KitchenReview[];
  dishes: KitchenDish[];
}

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

// Kitchens set their hours in Pakistan time.
const PKT = 'Asia/Karachi';

// Labels: kitchen and dish types are browseMessages `biz.*` / `type.*`; closed statuses are
// kitchenMessages `status.*` (badge) and `isClosed.*` (banner sentence).

/** A new line id for the client cart: called from the add-to-cart handlers, never while rendering. */
const newCartLineId = (dishId: string) => `${dishId}-${Date.now()}`;

function positiveAmount(value: number | null | undefined): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n > 0 ? n : null;
}

function nonNegativeAmount(value: number | null | undefined): number | null {
  const n = Number(value);
  return value != null && Number.isFinite(n) && n >= 0 ? n : null;
}

/** { day: "today" | "tomorrow" | "Mon, Oct 5", time: "7:00 PM" } in Pakistan time; null for a missing/invalid date. */
function whenParts(iso: string | null | undefined, tk: KitchenT): { day: string; time: string; isToday: boolean } | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const dayKey = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: PKT });
  const now = Date.now();
  const isToday = dayKey(date) === dayKey(new Date(now));
  const day = isToday
    ? tk('today')
    : dayKey(date) === dayKey(new Date(now + 86400000))
    ? tk('tomorrow')
    : date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: PKT });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: PKT });
  return { day, time, isToday };
}

function formatWhen(iso: string | null | undefined, tk: KitchenT): string | null {
  const parts = whenParts(iso, tk);
  return parts ? tk('dayAt', { day: parts.day, time: parts.time }) : null;
}

/** "18:00" -> "6:00 PM" */
function formatCutoff(hhmm: string): string | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!match) return null;
  const hour = Number(match[1]);
  if (hour > 23) return null;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`;
}

/** Closing time when open, next opening when closed, else today's order cutoff — whatever the API gave. */
function describeHours(
  availability: PublicSellerAvailability | null,
  orderCutoffTime: string | null | undefined,
  tk: KitchenT,
): string | null {
  if (availability?.isOpen) {
    const closes = whenParts(availability.closesAt, tk);
    if (closes) return closes.isToday ? tk('closesAt', { time: closes.time }) : tk('closesDayAt', { day: closes.day, time: closes.time });
  } else if (availability) {
    const opens = formatWhen(availability.opensAt || availability.nextOpenAt, tk);
    return opens ? tk('opensWhen', { when: opens }) : null;
  }
  const cutoff = orderCutoffTime ? formatCutoff(orderCutoffTime) : null;
  return cutoff ? tk('orderCutoff', { time: cutoff }) : null;
}

/** The kitchen's own delivery terms. Without any, the fee depends on the address and is worked out at checkout. */
function describeDeliveryFee(s: PublicSeller, tk: KitchenT): string {
  const freeOver = positiveAmount(s.freeDeliveryThreshold);
  const fixedFee = s.deliveryFeeType === 'fixed' ? nonNegativeAmount(s.deliveryFeeFixed) : null;
  const freeOverNote = freeOver != null ? tk('freeOverNote', { amount: formatPrice(freeOver) }) : '';
  if (fixedFee === 0) return tk('freeDelivery');
  if (fixedFee != null) return `${tk('amountDelivery', { amount: formatPrice(fixedFee) })}${freeOverNote}`;
  if (s.deliveryFeeType === 'distance') return `${tk('feeByDistanceLong')}${freeOverNote}`;
  if (freeOver != null) return tk('freeDeliveryOver', { amount: formatPrice(freeOver) });
  return tk('feeAtCheckout');
}

function toKitchenProfile(s: PublicSeller, tb: BrowseT, tk: KitchenT): KitchenProfile {
  const availability = s.availability ?? null;
  const reviewCount = Number(s.totalReviews) || (s.reviews?.length ?? 0);
  const rating = displayRating(s.ratingAverage, reviewCount);
  const businessKey = businessTypeKey(s.businessType);
  const typeLabel = businessKey ? tb(businessKey) : tk('kitchenFallback');
  const isVerified = s.isVerified === true || s.verificationStatus === 'approved';

  let statusText: string | null = null;
  if (availability) {
    const closedKey = kitchenKey('status', availability.status);
    statusText = availability.isOpen ? tk('statusOpen') : closedKey ? tk(closedKey) : tk('closed');
  }

  return {
    id: s.id,
    name: s.businessName,
    chefName: s.chef?.name || s.businessName,
    chefBio: s.chef?.bio || s.description || null,
    area: [s.chef?.area, s.chef?.city || s.community?.city].filter(Boolean).join(', ') || s.community?.name || '',
    rating,
    ratingValue: rating ? Number(s.ratingAverage) : 0,
    reviewCount,
    deliveryFee: describeDeliveryFee(s, tk),
    minOrder: positiveAmount(s.minOrderAmountForDelivery),
    availability,
    isClosed: availability != null && !availability.isOpen,
    preOrderOnly: s.preOrderOnly === true || availability?.status === 'preorder_only',
    statusText,
    hoursText: describeHours(availability, s.orderCutoffTime, tk),
    opensAtText:
      availability && !availability.isOpen ? formatWhen(availability.opensAt || availability.nextOpenAt, tk) : null,
    coverPhoto: s.coverImageUrl || null,
    chefAvatar: s.chef?.avatar || null,
    verifiedLabel: isVerified ? tk('verifiedType', { type: typeLabel }) : typeLabel,
    storeNotice: s.storeNotice || null,
    reviews: (s.reviews ?? []).map((r) => ({
      id: r.id,
      rating: Number(r.rating) || 0,
      comment: r.comment,
      createdAt: r.createdAt,
      author: r.author || tk('verifiedBuyer'),
      avatar: r.avatar || null,
    })),
    dishes: (s.products ?? []).map((p) => {
      const price = Number(p.price);
      const originalPrice = p.originalPrice != null ? Number(p.originalPrice) : null;
      const prepMinutes = positiveAmount(p.preparationTime);
      const typeKey = productTypeKey(p.productType);
      return {
        id: p.id,
        name: p.name,
        nameUrdu: p.nameUrdu || undefined,
        description: p.description || null,
        price,
        originalPrice: originalPrice != null && originalPrice > price ? originalPrice : null,
        isFrozen: p.productType === 'frozen',
        typeLabel: typeKey ? tb(typeKey) : p.productType ? p.productType.replace(/_/g, ' ') : tk('dish'),
        photo: p.images?.[0] || null,
        prepTime: prepMinutes != null ? tb('minPrep', { min: prepMinutes }) : null,
      };
    }),
  };
}

/**
 * `initial` is the server's copy of the kitchen (the same public read its link preview uses): with it the page is
 * rendered with the kitchen and its menu on the server, and the browser then refreshes it.
 */
export default function KitchenStorefrontPage({ initial }: { initial?: PublicSeller }) {
  const params = useParams();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const tb = useT(browseMessages);
  const tk = useT(kitchenMessages);
  // The API's seller; the page's text is built from it in the current language.
  const [seller, setSeller] = useState<PublicSeller | null>(initial ?? null);
  const kitchen = useMemo(() => (seller ? toKitchenProfile(seller, tb, tk) : null), [seller, tb, tk]);
  const [loadState, setLoadState] = useState<LoadState>(initial ? 'ready' : 'loading');
  // A kitchen on screen stays there if a refresh cannot reach the API (a 404 still says it is gone).
  const shownRef = useRef(Boolean(initial));
  const [reloadKey, setReloadKey] = useState(0);
  const [activeCategory, setActiveCategory] = useState('all');
  const [addedItems, setAddedItems] = useState<Record<string, number>>({});
  const [cartCount, setCartCount] = useState(0);
  const [cartTotal, setCartTotal] = useState(0);
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    existingKitchenName: string;
    dish: KitchenDish | null;
  }>({
    isOpen: false,
    existingKitchenName: '',
    dish: null,
  });
  const [switchingKitchen, setSwitchingKitchen] = useState(false);

  const idParam = params?.id;
  const kitchenId = (Array.isArray(idParam) ? idParam[0] : idParam) ?? '';

  useEffect(() => {
    if (!kitchenId) return;
    let cancelled = false;

    // Calls the API directly rather than sellerService.getPublicSeller(), which returns null for every
    // failure: a kitchen that doesn't exist (404) must read differently from a request that failed.
    apiClient
      .get<ApiResponse<PublicSeller>>(`/sellers/${kitchenId}`)
      .then((res) => {
        if (cancelled) return;
        const sellerData = res.data?.data;
        if (sellerData) {
          shownRef.current = true;
          setSeller(sellerData);
          setLoadState('ready');
        } else {
          setSeller(null);
          setLoadState('not_found');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const gone = isAxiosError(err) && apiErrorStatus(err) === 404;
        if (!gone && shownRef.current) return;
        shownRef.current = false;
        setSeller(null);
        if (gone) {
          setLoadState('not_found');
        } else {
          console.error('Failed to load seller storefront:', err);
          setLoadState('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [kitchenId, reloadKey]);

  const retryLoad = () => {
    setLoadState('loading');
    setReloadKey((k) => k + 1);
  };

  const handleAddToCart = async (dish: KitchenDish) => {
    if (kitchen && kitchen.isClosed && !kitchen.preOrderOnly) {
      showToast(tk('toastClosed', { name: kitchen.name }), 'error');
      return;
    }

    setAddedItems((prev) => ({
      ...prev,
      [dish.id]: (prev[dish.id] || 0) + 1,
    }));
    setCartCount((c) => c + 1);
    setCartTotal((t) => t + dish.price);

    if (kitchen?.preOrderOnly) {
      showToast(tk('toastPreorderOnly', { name: kitchen.name }), 'info');
    }

    // Add to global client cart store
    useCartStore.getState().addItem({
      id: newCartLineId(dish.id),
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo ?? undefined,
      sellerId: kitchen?.id || 'unknown',
      sellerName: kitchen?.name || tb('homeKitchen'),
      quantity: 1,
      unitPrice: dish.price,
      stockType: dish.isFrozen ? 'hub' : 'direct',
      subtotal: dish.price,
    });

    if (isAuthenticated) {
      try {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
        });
      } catch (err) {
        if (apiErrorStatus(err) === 409 || apiErrorCode(err) === 'CART_SELLER_MISMATCH') {
          const details = apiErrorDetails(err) as CartConflictDetails | undefined;
          // Revert optimistic add
          setAddedItems((prev) => {
            const next = { ...prev };
            if (next[dish.id] <= 1) delete next[dish.id];
            else next[dish.id] -= 1;
            return next;
          });
          setCartCount((c) => Math.max(0, c - 1));
          setCartTotal((t) => Math.max(0, t - dish.price));

          setConflictModal({
            isOpen: true,
            existingKitchenName: details?.existingSeller?.name || tk('anotherHomeKitchen'),
            dish,
          });
          return;
        } else {
          console.warn('Backend cart add notice:', errorMessage(err, ''));
        }
      }
    }

    showToast(tk('toastAddedTray', { name: dish.name }), 'success');
  };

  const handleConfirmSwitchKitchen = async () => {
    const dish = conflictModal.dish;
    if (!dish) return;
    setSwitchingKitchen(true);
    try {
      await cartService.addToCart({
        productId: dish.id,
        quantity: 1,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        clearAndAdd: true,
      });
      useCartStore.getState().clearCart();
      useCartStore.getState().addItem({
        id: newCartLineId(dish.id),
        productId: dish.id,
        productName: dish.name,
        productImage: dish.photo ?? undefined,
        sellerId: kitchen?.id || 'unknown',
        sellerName: kitchen?.name || tb('homeKitchen'),
        quantity: 1,
        unitPrice: dish.price,
        stockType: dish.isFrozen ? 'hub' : 'direct',
        subtotal: dish.price,
      });
      setAddedItems({ [dish.id]: 1 });
      setCartCount(1);
      setCartTotal(dish.price);
      showToast(tk('toastTrayUpdated', { name: kitchen?.name }), 'success');
      setConflictModal({ isOpen: false, existingKitchenName: '', dish: null });
    } catch {
      showToast(tb('toastReplaceItemsFailed'), 'error');
    } finally {
      setSwitchingKitchen(false);
    }
  };

  const handleRemoveFromCart = async (dish: KitchenDish) => {
    if (!addedItems[dish.id]) return;
    setAddedItems((prev) => {
      const next = { ...prev };
      if (next[dish.id] <= 1) delete next[dish.id];
      else next[dish.id] -= 1;
      return next;
    });
    setCartCount((c) => Math.max(0, c - 1));
    setCartTotal((t) => Math.max(0, t - dish.price));

    const itemInStore = useCartStore.getState().items.find((i) => i.productId === dish.id);
    if (itemInStore) {
      if (itemInStore.quantity <= 1) {
        useCartStore.getState().removeItem(itemInStore.id);
      } else {
        useCartStore.getState().updateItem(itemInStore.id, itemInStore.quantity - 1);
      }
    }

    if (isAuthenticated) {
      try {
        const serverCart = await cartService.getCart();
        const serverItem = serverCart.data?.items?.find((i) => i.product.id === dish.id);
        if (serverItem) {
          if (serverItem.quantity <= 1) {
            await cartService.removeCartItem(serverItem.id);
          } else {
            await cartService.updateCartItem(serverItem.id, serverItem.quantity - 1);
          }
        }
      } catch (err) {
        console.warn('Backend cart item update:', err);
      }
    }
  };

  const renderPublicHeader = () => <SiteHeader />;

  // Not-found / error pages, in the same shell as the storefront.
  const renderStatePage = (title: string, subtitle: string, body: ReactNode) => {
    if (isAuthenticated) {
      return (
        <DashboardLayout title={title} subtitle={subtitle} sidebarItems={CUSTOMER_SIDEBAR_ITEMS} userType="customer">
          {body}
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-page text-ink pb-32">
        {renderPublicHeader()}
        {body}
      </div>
    );
  };

  const pageState: LoadState = kitchenId ? loadState : 'not_found';

  if (pageState === 'not_found') {
    return renderStatePage(
      tk('notFound'),
      tk('notFoundSub'),
      <div className="text-center py-14 px-6 bg-surface rounded-3xl border border-line shadow-xs max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-ink flex items-center justify-center mx-auto mb-4">
          <ChefHat className="w-6 h-6" />
        </div>
        <h1 className="font-bold text-ink text-base">{tk('notFound')}</h1>
        <p className="text-xs text-muted mt-1.5 leading-relaxed">
          {tk('notFoundBody')}
        </p>
        <Link
          href="/kitchens"
          className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-xl bg-ink text-page text-xs font-semibold hover:bg-ink/90 transition-colors"
        >
          <ArrowLeft className="rtl:-scale-x-100 w-3.5 h-3.5" />
          <span>{tk('browseAllKitchens')}</span>
        </Link>
      </div>
    );
  }

  if (pageState === 'error') {
    return renderStatePage(
      tk('errorTitle'),
      tk('errorSub'),
      <div
        role="alert"
        className="text-center py-14 px-6 bg-surface rounded-3xl border border-line shadow-xs max-w-md mx-auto my-12"
      >
        <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-ink flex items-center justify-center mx-auto mb-4">
          <ChefHat className="w-6 h-6" />
        </div>
        <h1 className="font-bold text-ink text-base">{tk('errorHeading')}</h1>
        <p className="text-xs text-muted mt-1.5 leading-relaxed">
          {tk('errorBody')}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={retryLoad}
            className="px-4 py-2 rounded-xl bg-ink text-page text-xs font-semibold hover:bg-ink/90 transition-colors"
          >
            {tk('tryAgain')}
          </button>
          <Link
            href="/kitchens"
            className="px-4 py-2 rounded-xl bg-surface border border-line text-ink text-xs font-semibold hover:bg-raised transition-colors"
          >
            {tk('allKitchens')}
          </Link>
        </div>
      </div>
    );
  }

  if (!kitchen) {
    if (isAuthenticated) {
      return (
        <DashboardLayout
          title={tk('loadingTitle')}
          subtitle={tk('loadingSub')}
          sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
          userType="customer"
        >
          <div className="text-center py-20 bg-surface rounded-3xl border border-line shadow-xs max-w-md mx-auto my-8">
            <div className="w-12 h-12 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-bold text-ink text-sm">{tk('loadingStorefront')}</p>
            <p className="text-xs text-muted mt-1">{tk('fetchingMenu')}</p>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-page text-ink flex items-center justify-center">
        <div className="text-center p-8 bg-surface rounded-3xl border border-line shadow-sm max-w-sm">
          <div className="w-12 h-12 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-ink text-sm">{tk('loadingStorefront')}</p>
          <p className="text-xs text-muted mt-1">{tk('fetchingMenu')}</p>
        </div>
      </div>
    );
  }

  const filteredDishes = activeCategory === 'all'
    ? kitchen.dishes
    : activeCategory === 'frozen'
    ? kitchen.dishes.filter((d) => d.isFrozen)
    : kitchen.dishes.filter((d) => !d.isFrozen);

  const isOpenNow = kitchen.availability?.isOpen === true;
  const orderingBlocked = kitchen.isClosed && !kitchen.preOrderOnly;

  const renderStorefrontBody = (isPublic: boolean) => (
    <>

      {/* Kitchen Hero Banner */}
      <div className="relative">
        <div className="h-48 sm:h-72 w-full overflow-hidden relative bg-raised">
          <CoverImage
            src={kitchen.coverPhoto}
            alt={kitchen.name}
            label={kitchen.name}
            size="lg"
            eager
            className="w-full h-full"
          />
        </div>

        {/* Kitchen Info Card overlapping banner */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 -mt-14 sm:-mt-20 relative z-10">
          <div className="bg-surface rounded-[24px] p-5 sm:p-7 shadow-[var(--shadow-card)] border border-line text-ink flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <CoverImage
                  src={kitchen.chefAvatar}
                  alt={kitchen.chefName}
                  label={kitchen.chefName}
                  size="sm"
                  eager
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ring-4 ring-surface shadow-md"
                />
                <div className="absolute -bottom-1.5 -end-1.5 bg-brand text-on-brand text-xs font-bold p-1 rounded-full shadow-xs">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </div>
              </div>

              <div>
                {/* Opening state — only what the API reports */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {kitchen.statusText && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-extrabold ${
                        isOpenNow ? 'bg-brand-soft text-brand-soft-ink' : 'bg-accent-soft text-accent-soft-ink'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${isOpenNow ? 'bg-brand' : 'bg-accent-soft-ink'}`}
                      />
                      <span>{kitchen.statusText}</span>
                    </span>
                  )}
                  {kitchen.hoursText && (
                    <span className="px-2.5 py-1 rounded-full bg-raised text-ink text-xs font-bold">
                      {kitchen.hoursText}
                    </span>
                  )}
                  {kitchen.preOrderOnly && kitchen.availability?.status !== 'preorder_only' && (
                    <span className="px-2.5 py-1 rounded-full bg-raised text-ink text-xs font-bold">
                      {tb('preOrdersOnly')}
                    </span>
                  )}
                </div>

                <h1 className="text-[24px] sm:text-[32px] leading-tight font-extrabold tracking-tight text-ink">
                  {kitchen.name}
                </h1>
                <p className="text-sm font-bold text-brand-ink mt-0.5">
                  {tk('operatedBy', { name: kitchen.chefName })}
                </p>
                {kitchen.area && (
                  <p className="text-[13px] text-muted mt-1 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>{kitchen.area}</span>
                  </p>
                )}

                {kitchen.chefBio && (
                  <p className="text-sm text-muted mt-2 max-w-xl line-clamp-2 leading-relaxed">
                    {kitchen.chefBio}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-wrap md:flex-col gap-2.5 w-full md:w-auto border-t md:border-t-0 md:border-s border-line pt-3 md:pt-0 md:ps-6">
              <a
                href="#customer-reviews"
                className="flex items-center gap-1.5 bg-accent-soft hover:bg-accent-200/60 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                title={kitchen.rating ? tk('viewReviews') : tk('noReviews')}
              >
                {kitchen.rating ? (
                  <>
                    <Star className="w-3.5 h-3.5 fill-accent text-accent" />
                    <span className="text-accent-soft-ink font-extrabold text-sm">{kitchen.rating}</span>
                    <span className="text-[11px] text-accent-soft-ink font-medium">
                      {tk(kitchen.reviewCount === 1 ? 'reviewsParenOne' : 'reviewsParenMany', { count: kitchen.reviewCount })}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-accent-soft-ink font-bold text-xs">{tk('new')}</span>
                    <span className="text-[11px] text-accent-soft-ink font-medium">{tk('noReviews')}</span>
                  </>
                )}
              </a>
              <div className="flex items-center gap-2 bg-raised px-3 py-1.5 rounded-xl">
                <span className="text-xs font-medium text-ink flex items-center gap-1">
                  <Bike className="w-3 h-3 text-muted" />
                  <span>{kitchen.deliveryFee}</span>
                </span>
              </div>
              <div className="text-xs font-semibold text-muted bg-raised px-3 py-1.5 rounded-xl">
                {kitchen.minOrder != null ? tk('minOrderLabel', { amount: formatPrice(kitchen.minOrder) }) : tk('noMinimum')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification badge */}
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-soft text-brand-soft-ink text-xs font-bold whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{kitchen.verifiedLabel}</span>
          </span>
        </div>
      </div>

      {/* Closed Kitchen / Pre-Order Banner (only when the API says the kitchen is closed) */}
      {kitchen.isClosed && (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-5">
          <div className="bg-accent-soft rounded-[20px] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-accent flex items-center justify-center text-on-accent shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-surface text-ink text-[11px] font-extrabold">
                    {tk('closedInstant')}
                  </span>
                  {kitchen.preOrderOnly && (
                    <span className="px-2.5 py-0.5 rounded-full bg-brand-soft text-brand-soft-ink text-[11px] font-extrabold">
                      {tk('acceptingPreOrders')}
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-ink text-sm">
                  {kitchen.preOrderOnly
                    ? tk('takingPreorders', { name: kitchen.name })
                    : (() => {
                        const closedKey = kitchenKey('isClosed', kitchen.availability?.status);
                        return tk(closedKey ?? 'isClosedNow', { name: kitchen.name });
                      })()}
                </h4>
                <p className="text-[13px] text-accent-soft-ink mt-0.5 leading-relaxed max-w-2xl">
                  {kitchen.preOrderOnly
                    ? `${tk('preorderBody')}${kitchen.opensAtText ? tk('preorderOpens', { when: kitchen.opensAtText }) : ''}`
                    : kitchen.opensAtText
                    ? tk('pausedWithOpen', { when: kitchen.opensAtText })
                    : tk('pausedNoOpen')}
                </p>
                {kitchen.availability?.isManualOverride && kitchen.availability.reason && (
                  <p className="text-xs font-medium text-accent-soft-ink mt-1">
                    {tk('kitchenNote', { reason: kitchen.availability.reason })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/products?openNow=true&view=kitchens"
                className="inline-flex items-center h-11 px-4 rounded-xl bg-on-accent text-accent-100 hover:opacity-90 text-sm font-extrabold transition-opacity whitespace-nowrap"
              >
                {tk('browseOpenNow')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Store Notice banner if set by Chef */}
      {kitchen.storeNotice && (
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-4">
          <div className="bg-accent-soft rounded-[20px] p-4 flex items-start gap-3">
            <div className="p-1.5 rounded-xl bg-accent text-on-accent shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-accent-soft-ink">{tk('noticeFromChef')}</h4>
              <p className="text-sm text-accent-soft-ink mt-0.5">{kitchen.storeNotice}</p>
            </div>
          </div>
        </div>
      )}

      {/* Menu Categories Bar */}
      {kitchen.dishes.length > 0 && (
        <div className="sticky top-(--header-offset) z-30 bg-page/95 backdrop-blur-md border-b border-line py-3 mt-6">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-8 flex items-center gap-2.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveCategory('all')}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${
                activeCategory === 'all'
                  ? 'bg-ink text-page'
                  : 'bg-surface text-ink hover:bg-raised border border-line'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{tk('fullMenu', { count: kitchen.dishes.length })}</span>
            </button>
            <button
              onClick={() => setActiveCategory('fresh')}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${
                activeCategory === 'fresh'
                  ? 'bg-brand text-on-brand'
                  : 'bg-surface text-ink hover:bg-raised border border-line'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{tk('freshSpecials')}</span>
            </button>
            <button
              onClick={() => setActiveCategory('frozen')}
              className={`flex-shrink-0 inline-flex items-center gap-1.5 h-10 px-4 rounded-full text-sm font-bold transition-colors whitespace-nowrap ${
                activeCategory === 'frozen'
                  ? 'bg-frozen text-white'
                  : 'bg-surface text-ink hover:bg-raised border border-line'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5" />
              <span>{tk('frozenPantry')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Dishes Menu Grid */}
      <main className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-8">
        {kitchen.dishes.length === 0 ? (
          <div className="text-center py-14 px-6 bg-surface rounded-[20px] border border-dashed border-line-strong">
            <UtensilsCrossed className="w-8 h-8 text-line-strong mx-auto mb-2" />
            <p className="text-sm font-bold text-ink">{tk('noDishes')}</p>
            <p className="text-xs text-muted mt-1">{tk('noDishesBody')}</p>
            <Link
              href="/kitchens"
              className="inline-flex items-center gap-1.5 mt-4 h-11 px-5 rounded-xl bg-brand text-on-brand text-sm font-extrabold hover:bg-brand-500 transition-colors"
            >
              {tb('browseKitchens')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight text-ink">
                  {activeCategory === 'all'
                    ? tk('currentMenu')
                    : activeCategory === 'fresh'
                    ? tk('freshMeals')
                    : tk('frozenPacks')}
                </h2>
                <p className="text-sm text-muted mt-0.5">
                  {tk('preparedBy', { name: kitchen.chefName })}
                </p>
              </div>
              <span className="text-sm font-semibold text-muted flex-shrink-0">
                {tk(filteredDishes.length === 1 ? 'dishOne' : 'dishMany', { count: filteredDishes.length })}
              </span>
            </div>

            {filteredDishes.length === 0 ? (
              <p className="text-center text-sm text-muted py-10 bg-surface rounded-[20px] border border-dashed border-line-strong">
                {activeCategory === 'frozen'
                  ? tk('noFrozen')
                  : tk('noFresh')}
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {filteredDishes.map((dish) => {
                  const count = addedItems[dish.id] || 0;
                  return (
                    <div
                      key={dish.id}
                      className="bg-surface rounded-[20px] p-3 sm:p-4 border border-line hover:border-line-strong transition-colors flex gap-3 sm:gap-4 items-stretch"
                    >
                      <div className="order-last w-28 h-28 sm:w-36 sm:h-36 rounded-2xl overflow-hidden relative flex-shrink-0 bg-raised">
                        <CoverImage
                          src={dish.photo}
                          alt={dish.name}
                          label={dish.name}
                          size="md"
                          className="w-full h-full"
                        />
                        {dish.originalPrice != null && (
                          <span className="absolute top-2 start-2 px-2 py-0.5 rounded-full bg-accent text-on-accent text-[11px] font-extrabold">
                            {tk('specialDeal')}
                          </span>
                        )}
                        <span
                          className={`absolute bottom-2 start-2 px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 ${
                            dish.isFrozen ? 'bg-frozen-soft text-frozen-ink' : 'bg-surface/95 text-ink'
                          }`}
                        >
                          {dish.isFrozen ? <Snowflake className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
                          <span>{dish.typeLabel}</span>
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-extrabold text-ink text-[15px] sm:text-base leading-snug">
                              {dish.name}
                            </h3>
                          </div>
                          {dish.nameUrdu && (
                            <p className="text-xs text-brand-ink font-medium mt-0.5 font-urdu">
                              {dish.nameUrdu}
                            </p>
                          )}
                          {dish.description && (
                            <p className="text-[13px] text-muted mt-1 line-clamp-2 leading-relaxed">
                              {dish.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-2 flex-wrap">
                          <div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-base font-extrabold text-ink">
                                {formatPrice(dish.price)}
                              </span>
                              {dish.originalPrice != null && (
                                <span className="text-xs text-muted line-through">
                                  {formatPrice(dish.originalPrice)}
                                </span>
                              )}
                            </div>
                            {dish.prepTime && (
                              <span className="text-[11px] text-muted font-medium block">
                                {dish.prepTime}
                              </span>
                            )}
                          </div>

                          {orderingBlocked ? (
                            <span className="inline-flex items-center h-9 px-3 rounded-[10px] bg-raised text-muted text-sm font-bold cursor-not-allowed">
                              {tk('closed')}
                            </span>
                          ) : count === 0 ? (
                            <button
                              onClick={() => handleAddToCart(dish)}
                              className={`inline-flex items-center gap-1.5 h-9 px-4 rounded-[10px] text-sm font-extrabold transition-all active:scale-95 ${
                                kitchen.preOrderOnly ? 'bg-accent hover:bg-accent-300 text-on-accent' : 'bg-brand hover:bg-brand-500 text-on-brand'
                              }`}
                            >
                              {kitchen.preOrderOnly ? (
                                <>
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>{tk('preOrder')}</span>
                                </>
                              ) : (
                                tk('addToCart')
                              )}
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 bg-raised p-1 rounded-[12px]">
                              <button
                                onClick={() => handleRemoveFromCart(dish)}
                                aria-label={tk('removeOne', { name: dish.name })}
                                className="w-8 h-8 rounded-[9px] bg-surface text-ink font-extrabold hover:bg-line transition-colors flex items-center justify-center text-base shadow-xs"
                              >
                                -
                              </button>
                              <span className="font-extrabold text-sm text-ink min-w-6 text-center" aria-live="polite">
                                {count}
                              </span>
                              <button
                                onClick={() => handleAddToCart(dish)}
                                aria-label={tk('addOne', { name: dish.name })}
                                className="w-8 h-8 rounded-[9px] bg-brand text-on-brand font-extrabold hover:bg-brand-500 transition-colors flex items-center justify-center text-base"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Customer Reviews & Feedback Section */}
      <section id="customer-reviews" className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-14 mb-10 scroll-mt-24">
        <div className="bg-surface rounded-[24px] p-5 sm:p-8 border border-line">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-line">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent-soft text-accent-soft-ink text-xs font-extrabold mb-2">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>{tk('verifiedFeedback')}</span>
              </div>
              <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight text-ink">
                {tk('reviewsTitle')}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {tk('reviewsSub', { name: kitchen.chefName })}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-accent-soft rounded-2xl px-4 py-3 self-start sm:self-auto">
              <div className="text-3xl font-black text-accent-soft-ink">{kitchen.rating ?? tk('new')}</div>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= Math.round(kitchen.ratingValue)
                          ? 'fill-accent text-accent'
                          : 'text-line-strong'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-accent-soft-ink font-semibold mt-0.5 block">
                  {kitchen.reviewCount > 0
                    ? tk(kitchen.reviewCount === 1 ? 'verifiedReviewsOne' : 'verifiedReviewsMany', { count: kitchen.reviewCount })
                    : tk('noReviews')}
                </span>
              </div>
            </div>
          </div>

          {/* Reviews List */}
          <div className="mt-6">
            {kitchen.reviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {kitchen.reviews.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-4 rounded-2xl bg-raised flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-brand-soft flex items-center justify-center text-brand-soft-ink font-extrabold text-sm">
                            {rev.author.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-ink block leading-tight">
                              {rev.author}
                            </span>
                            <span className="text-[11px] text-brand-soft-ink font-semibold inline-flex items-center gap-0.5">
                              <Check className="w-2.5 h-2.5" />
                              <span>{tk('verifiedCustomer')}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${
                                s <= rev.rating
                                  ? 'fill-accent text-accent'
                                  : 'text-line-strong'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {rev.comment ? (
                        <p className="text-sm text-ink leading-relaxed mt-2">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      ) : (
                        <p className="text-xs text-muted mt-2">{tk('noComment')}</p>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-line text-[11px] text-muted">
                      {new Date(rev.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-muted bg-raised rounded-2xl border border-dashed border-line-strong">
                <ChefHat className="w-8 h-8 text-line-strong mx-auto mb-2" />
                <p className="text-sm font-bold text-ink">{tk('noReviewsKitchen')}</p>
                <p className="text-xs text-muted mt-1">
                  {tk('beFirstKitchen', { name: kitchen.name })}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Floating Kitchen Cart Pill (Foodpanda/DoorDash style) */}
      {cartCount > 0 && (
        <div className="fixed bottom-[calc(1.5rem+var(--safe-bottom)+var(--tabbar-offset))] inset-x-0 z-50 flex justify-center px-4">
          <div className="bg-[#0D2624] text-white p-2.5 ps-3 rounded-[18px] shadow-xl flex items-center justify-between gap-4 max-w-lg w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-on-brand font-extrabold text-sm">
                {cartCount}
              </div>
              <div>
                <div className="text-xs text-[#A3BCB7] font-semibold">
                  {kitchen.preOrderOnly ? tk('preOrderTotal') : tk('totalOrder')}
                </div>
                <div className="text-base font-extrabold text-white">{formatPrice(cartTotal)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {orderingBlocked ? (
                <button
                  type="button"
                  disabled
                  className="h-11 px-4 rounded-xl bg-white/10 text-[#A3BCB7] text-sm font-bold cursor-not-allowed"
                >
                  {tk('checkoutDisabled')}
                </button>
              ) : (
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-1 h-11 px-4 rounded-xl bg-brand hover:bg-brand-500 text-on-brand text-sm font-extrabold transition-colors"
                >
                  <span>{kitchen.preOrderOnly ? tk('schedulePreOrder') : tk('reviewCheckout')}</span>
                  <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Styled Modern Modal for Single Kitchen Batch Switching */}
      <ConfirmModal
        isOpen={conflictModal.isOpen}
        title={tk('switchTitle')}
        message={tk('switchMessage', { existing: conflictModal.existingKitchenName, name: kitchen.name })}
        confirmText={tk('clearTray')}
        cancelText={tk('keepTray')}
        variant="warning"
        loading={switchingKitchen}
        onConfirm={handleConfirmSwitchKitchen}
        onCancel={() => setConflictModal({ isOpen: false, existingKitchenName: '', dish: null })}
      />
    </>
  );

  // Authenticated customer: Render inside the customer DashboardLayout shell
  if (isAuthenticated) {
    return (
      <DashboardLayout
        title={kitchen.name}
        subtitle={[kitchen.chefName, kitchen.area, kitchen.verifiedLabel].filter(Boolean).join(' • ')}
        sidebarItems={CUSTOMER_SIDEBAR_ITEMS}
        userType="customer"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-1">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-muted hover:text-brand-ink transition-colors py-1.5 px-3 rounded-xl bg-surface border border-line shadow-2xs hover:border-line-strong"
            >
              <ArrowLeft className="rtl:-scale-x-100 w-3.5 h-3.5" />
              <span>{tk('backToKitchensMenus')}</span>
            </Link>
            <Link
              href="/kitchens"
              className="text-xs font-semibold text-muted hover:text-brand-ink transition-colors"
            >
              {tk('viewDirectory')}
            </Link>
          </div>

          {renderStorefrontBody(false)}
        </div>
      </DashboardLayout>
    );
  }

  // Public visitor: Render with top marketplace header
  return (
    <div className="min-h-screen bg-page text-ink pb-32">
      {renderPublicHeader()}

      {renderStorefrontBody(true)}
    </div>
  );
}
