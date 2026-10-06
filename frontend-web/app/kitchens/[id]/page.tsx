'use client';

import { useState, useEffect, useMemo, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { isAxiosError } from 'axios';
import { BrandLockup } from '@/components/ui/Mark';
import { CoverImage } from '@/components/ui/CoverImage';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { displayRating, formatPrice } from '@/lib/utils';
import { apiClient, ApiResponse } from '@/lib/api-client';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import { cartService } from '@/lib/services/cart.service';
import { useCartStore } from '@/lib/store/cart-store';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { CommunitySelector } from '@/components/community/CommunitySelector';
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
  ShoppingBag,
  ChevronRight,
  ArrowLeft,
  Check,
  Bell,
  MessageSquare,
} from 'lucide-react';

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

export default function KitchenStorefrontPage() {
  const params = useParams();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuthStore();
  const tb = useT(browseMessages);
  const tk = useT(kitchenMessages);
  // The API's seller; the page's text is built from it in the current language.
  const [seller, setSeller] = useState<PublicSeller | null>(null);
  const kitchen = useMemo(() => (seller ? toKitchenProfile(seller, tb, tk) : null), [seller, tb, tk]);
  const [loadState, setLoadState] = useState<LoadState>('loading');
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
          setSeller(sellerData);
          setLoadState('ready');
        } else {
          setSeller(null);
          setLoadState('not_found');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setSeller(null);
        if (isAxiosError(err) && err.response?.status === 404) {
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
      id: `${dish.id}-${Date.now()}`,
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
      } catch (err: any) {
        if (err?.response?.status === 409 || err?.response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
          const details = err?.response?.data?.error?.details;
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
          console.warn('Backend cart add notice:', err?.message);
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
        id: `${dish.id}-${Date.now()}`,
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

  const renderPublicHeader = () => (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-2xs">
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-4">
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
            className="hidden sm:inline-block text-xs font-semibold text-slate-700 hover:text-[#FF5500] px-3 py-1.5"
          >
            {tk('browseMarketplace')}
          </Link>
          <Link
            href="/cart"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0C1016] text-white text-xs font-bold shadow-xs hover:bg-black transition-colors"
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span>{tk('cart')}</span>
            {cartCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#FF5500] text-white flex items-center justify-center text-[11px] font-bold">
                {cartCount}
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
  );

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
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-32">
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
      <div className="text-center py-14 px-6 bg-white rounded-3xl border border-slate-200 shadow-xs max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center mx-auto mb-4">
          <ChefHat className="w-6 h-6" />
        </div>
        <h1 className="font-bold text-slate-900 text-base">{tk('notFound')}</h1>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          {tk('notFoundBody')}
        </p>
        <Link
          href="/kitchens"
          className="inline-flex items-center gap-1.5 mt-5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-colors"
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
        className="text-center py-14 px-6 bg-white rounded-3xl border border-slate-200 shadow-xs max-w-md mx-auto my-12"
      >
        <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#FF5500] flex items-center justify-center mx-auto mb-4">
          <ChefHat className="w-6 h-6" />
        </div>
        <h1 className="font-bold text-slate-900 text-base">{tk('errorHeading')}</h1>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          {tk('errorBody')}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={retryLoad}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-colors"
          >
            {tk('tryAgain')}
          </button>
          <Link
            href="/kitchens"
            className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition-colors"
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
          <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-xs max-w-md mx-auto my-8">
            <div className="w-12 h-12 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="font-bold text-slate-800 text-sm">{tk('loadingStorefront')}</p>
            <p className="text-xs text-slate-500 mt-1">{tk('fetchingMenu')}</p>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex items-center justify-center">
        <div className="text-center p-8 bg-white rounded-3xl border border-slate-200 shadow-sm max-w-sm">
          <div className="w-12 h-12 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="font-bold text-slate-800 text-sm">{tk('loadingStorefront')}</p>
          <p className="text-xs text-slate-500 mt-1">{tk('fetchingMenu')}</p>
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
      <div className="relative bg-[#0C1016] text-white">
        <div className="h-56 sm:h-64 w-full overflow-hidden relative">
          <CoverImage
            src={kitchen.coverPhoto}
            alt={kitchen.name}
            label={kitchen.name}
            size="lg"
            eager
            className="w-full h-full opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0C1016] via-[#0C1016]/60 to-transparent" />
        </div>

        {/* Kitchen Info Card overlapping banner */}
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 -mt-20 sm:-mt-24 relative z-10">
          <div className="bg-white rounded-2xl p-5 sm:p-7 shadow-lg border border-slate-200/80 text-slate-900 flex flex-col md:flex-row gap-5 items-start md:items-center justify-between">
            <div className="flex items-start gap-4">
              <div className="relative">
                <CoverImage
                  src={kitchen.chefAvatar}
                  alt={kitchen.chefName}
                  label={kitchen.chefName}
                  size="sm"
                  eager
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ring-3 ring-white shadow-md"
                />
                <div className="absolute -bottom-1.5 -end-1.5 bg-[#FF5500] text-white text-xs font-bold p-1 rounded-full shadow-xs">
                  <Check className="w-3 h-3 text-white" />
                </div>
              </div>

              <div>
                {/* Opening state — only what the API reports */}
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {kitchen.statusText && (
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                        isOpenNow
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isOpenNow ? 'bg-emerald-600 animate-pulse' : 'bg-rose-600'
                        }`}
                      />
                      <span>{kitchen.statusText}</span>
                    </span>
                  )}
                  {kitchen.hoursText && (
                    <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[11px] font-bold">
                      {kitchen.hoursText}
                    </span>
                  )}
                  {kitchen.preOrderOnly && kitchen.availability?.status !== 'preorder_only' && (
                    <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[11px] font-bold">
                      {tb('preOrdersOnly')}
                    </span>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-950">
                  {kitchen.name}
                </h1>
                <p className="text-xs font-bold text-[#FF5500] mt-0.5">
                  {tk('operatedBy', { name: kitchen.chefName })}
                </p>
                {kitchen.area && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-[#FF5500]" />
                    <span>{kitchen.area}</span>
                  </p>
                )}

                {kitchen.chefBio && (
                  <p className="text-xs text-slate-600 mt-2 max-w-xl line-clamp-2 leading-relaxed">
                    {kitchen.chefBio}
                  </p>
                )}
              </div>
            </div>

            {/* Quick Metrics */}
            <div className="flex flex-wrap md:flex-col gap-2.5 w-full md:w-auto border-t md:border-t-0 md:border-s border-slate-100 pt-3 md:pt-0 md:ps-6">
              <a
                href="#customer-reviews"
                className="flex items-center gap-1.5 bg-amber-50 hover:bg-amber-100/80 px-2.5 py-1 rounded-xl border border-amber-200/80 transition-colors cursor-pointer"
                title={kitchen.rating ? tk('viewReviews') : tk('noReviews')}
              >
                {kitchen.rating ? (
                  <>
                    <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                    <span className="text-amber-800 font-bold text-xs">{kitchen.rating}</span>
                    <span className="text-[11px] text-amber-700 font-medium">
                      {tk(kitchen.reviewCount === 1 ? 'reviewsParenOne' : 'reviewsParenMany', { count: kitchen.reviewCount })}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-amber-800 font-bold text-xs">{tk('new')}</span>
                    <span className="text-[11px] text-amber-700 font-medium">{tk('noReviews')}</span>
                  </>
                )}
              </a>
              <div className="flex items-center gap-2 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/80">
                <span className="text-xs font-medium text-slate-700 flex items-center gap-1">
                  <Bike className="w-3 h-3 text-slate-400" />
                  <span>{kitchen.deliveryFee}</span>
                </span>
              </div>
              <div className="text-[11px] font-semibold text-slate-600 bg-slate-50 px-2.5 py-1 rounded-xl border border-slate-200/60">
                {kitchen.minOrder != null ? tk('minOrderLabel', { amount: formatPrice(kitchen.minOrder) }) : tk('noMinimum')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Verification badge */}
      <div className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-5">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white border border-slate-200/80 text-xs font-semibold text-slate-700 shadow-2xs whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5 text-[#FF5500]" />
            <span>{kitchen.verifiedLabel}</span>
          </span>
        </div>
      </div>

      {/* Closed Kitchen / Pre-Order Banner (only when the API says the kitchen is closed) */}
      {kitchen.isClosed && (
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-5">
          <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-700 shrink-0">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold uppercase tracking-wider">
                    {tk('closedInstant')}
                  </span>
                  {kitchen.preOrderOnly && (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider">
                      {tk('acceptingPreOrders')}
                    </span>
                  )}
                </div>
                <h4 className="font-extrabold text-slate-900 text-sm">
                  {kitchen.preOrderOnly
                    ? tk('takingPreorders', { name: kitchen.name })
                    : (() => {
                        const closedKey = kitchenKey('isClosed', kitchen.availability?.status);
                        return tk(closedKey ?? 'isClosedNow', { name: kitchen.name });
                      })()}
                </h4>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed max-w-2xl">
                  {kitchen.preOrderOnly
                    ? `${tk('preorderBody')}${kitchen.opensAtText ? tk('preorderOpens', { when: kitchen.opensAtText }) : ''}`
                    : kitchen.opensAtText
                    ? tk('pausedWithOpen', { when: kitchen.opensAtText })
                    : tk('pausedNoOpen')}
                </p>
                {kitchen.availability?.isManualOverride && kitchen.availability.reason && (
                  <p className="text-xs font-medium text-amber-900 mt-1">
                    {tk('kitchenNote', { reason: kitchen.availability.reason })}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/products?openNow=true&view=kitchens"
                className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-colors shadow-2xs whitespace-nowrap"
              >
                {tk('browseOpenNow')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Store Notice banner if set by Chef */}
      {kitchen.storeNotice && (
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-4">
          <div className="bg-amber-50 border border-amber-300/80 rounded-2xl p-4 flex items-start gap-3 shadow-2xs">
            <div className="p-1.5 rounded-xl bg-amber-200/70 text-amber-800 shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-amber-950 uppercase tracking-wider">{tk('noticeFromChef')}</h4>
              <p className="text-xs font-medium text-amber-900 mt-0.5">{kitchen.storeNotice}</p>
            </div>
          </div>
        </div>
      )}

      {/* Menu Categories Bar */}
      {kitchen.dishes.length > 0 && (
        <div className="sticky top-16 z-30 bg-[#F8FAFC]/95 backdrop-blur-md border-b border-slate-200/80 py-3 mt-4">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-8 flex items-center gap-2.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveCategory('all')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeCategory === 'all'
                  ? 'bg-[#0C1016] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <UtensilsCrossed className="w-3.5 h-3.5" />
              <span>{tk('fullMenu', { count: kitchen.dishes.length })}</span>
            </button>
            <button
              onClick={() => setActiveCategory('fresh')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeCategory === 'fresh'
                  ? 'bg-[#FF5500] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>{tk('freshSpecials')}</span>
            </button>
            <button
              onClick={() => setActiveCategory('frozen')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeCategory === 'frozen'
                  ? 'bg-[#00B4D8] text-white shadow-xs'
                  : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Snowflake className="w-3.5 h-3.5" />
              <span>{tk('frozenPantry')}</span>
            </button>
          </div>
        </div>
      )}

      {/* Dishes Menu Grid */}
      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-8">
        {kitchen.dishes.length === 0 ? (
          <div className="text-center py-14 px-6 bg-white rounded-2xl border border-dashed border-slate-200">
            <UtensilsCrossed className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-700">{tk('noDishes')}</p>
            <p className="text-xs text-slate-400 mt-1">{tk('noDishesBody')}</p>
            <Link
              href="/kitchens"
              className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black transition-colors"
            >
              {tb('browseKitchens')}
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-950">
                  {activeCategory === 'all'
                    ? tk('currentMenu')
                    : activeCategory === 'fresh'
                    ? tk('freshMeals')
                    : tk('frozenPacks')}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {tk('preparedBy', { name: kitchen.chefName })}
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                {tk(filteredDishes.length === 1 ? 'dishOne' : 'dishMany', { count: filteredDishes.length })}
              </span>
            </div>

            {filteredDishes.length === 0 ? (
              <p className="text-center text-xs text-slate-500 py-10 bg-white rounded-2xl border border-slate-200/80">
                {activeCategory === 'frozen'
                  ? tk('noFrozen')
                  : tk('noFresh')}
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {filteredDishes.map((dish) => {
                  const count = addedItems[dish.id] || 0;
                  return (
                    <div
                      key={dish.id}
                      className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200/80 shadow-2xs hover:shadow-sm transition-all flex flex-col sm:flex-row gap-4 items-start"
                    >
                      <div className="w-full sm:w-36 h-36 rounded-xl overflow-hidden relative flex-shrink-0 bg-slate-100">
                        <CoverImage
                          src={dish.photo}
                          alt={dish.name}
                          label={dish.name}
                          size="md"
                          className="w-full h-full group-hover:scale-105 transition-transform"
                        />
                        {dish.originalPrice != null && (
                          <span className="absolute top-2 start-2 px-2 py-0.5 rounded-md bg-black/75 text-white text-[11px] font-bold tracking-wide backdrop-blur-xs">
                            {tk('specialDeal')}
                          </span>
                        )}
                        <span
                          className={`absolute bottom-2 start-2 px-2 py-0.5 rounded-md text-[11px] font-bold flex items-center gap-1 ${
                            dish.isFrozen
                              ? 'bg-cyan-600 text-white'
                              : 'bg-[#FF5500] text-white'
                          }`}
                        >
                          {dish.isFrozen ? <Snowflake className="w-3 h-3" /> : <Flame className="w-3 h-3" />}
                          <span>{dish.typeLabel}</span>
                        </span>
                      </div>

                      <div className="flex-1 flex flex-col justify-between h-full min-w-0">
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-bold text-slate-900 text-sm leading-snug">
                              {dish.name}
                            </h3>
                          </div>
                          {dish.nameUrdu && (
                            <p className="text-xs text-[#FF5500] font-medium mt-0.5 font-urdu">
                              {dish.nameUrdu}
                            </p>
                          )}
                          {dish.description && (
                            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                              {dish.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                          <div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-base font-bold text-slate-950">
                                {formatPrice(dish.price)}
                              </span>
                              {dish.originalPrice != null && (
                                <span className="text-xs text-slate-400 line-through">
                                  {formatPrice(dish.originalPrice)}
                                </span>
                              )}
                            </div>
                            {dish.prepTime && (
                              <span className="text-[11px] text-slate-400 font-medium block">
                                {dish.prepTime}
                              </span>
                            )}
                          </div>

                          {orderingBlocked ? (
                            <span className="px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs font-semibold border border-slate-200 cursor-not-allowed">
                              {tk('closed')}
                            </span>
                          ) : count === 0 ? (
                            <button
                              onClick={() => handleAddToCart(dish)}
                              className={`px-3.5 py-1.5 rounded-xl text-white text-xs font-bold shadow-2xs transition-all active:scale-95 ${
                                kitchen.preOrderOnly
                                  ? 'bg-amber-600 hover:bg-amber-700 flex items-center gap-1.5'
                                  : 'bg-[#FF5500] hover:bg-[#e04400]'
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
                            <div className="flex items-center gap-1.5 bg-slate-100 px-2 py-1 rounded-xl border border-slate-200">
                              <button
                                onClick={() => handleRemoveFromCart(dish)}
                                className="w-6 h-6 rounded-lg bg-white text-slate-900 font-bold hover:bg-slate-200 transition-colors flex items-center justify-center text-xs shadow-2xs"
                              >
                                -
                              </button>
                              <span className="font-bold text-xs text-slate-900 px-1">
                                {count}
                              </span>
                              <button
                                onClick={() => handleAddToCart(dish)}
                                className="w-6 h-6 rounded-lg bg-[#FF5500] text-white font-bold hover:bg-[#e04400] transition-colors flex items-center justify-center text-xs shadow-2xs"
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
      <section id="customer-reviews" className="max-w-[1360px] mx-auto px-4 sm:px-8 mt-14 mb-10 scroll-mt-24">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/90 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[11px] font-bold uppercase tracking-wider mb-1">
                <MessageSquare className="w-3 h-3 text-amber-600" />
                <span>{tk('verifiedFeedback')}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950">
                {tk('reviewsTitle')}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {tk('reviewsSub', { name: kitchen.chefName })}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-amber-50/70 border border-amber-200/60 rounded-2xl px-4 py-2.5 self-start sm:self-auto">
              <div className="text-3xl font-black text-amber-900">{kitchen.rating ?? tk('new')}</div>
              <div>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className={`w-3.5 h-3.5 ${
                        s <= Math.round(kitchen.ratingValue)
                          ? 'fill-amber-500 text-amber-500'
                          : 'text-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-amber-800 font-semibold mt-0.5 block">
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
                    className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#FF5500] to-amber-500 flex items-center justify-center text-white font-bold text-xs shadow-2xs">
                            {rev.author.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 block leading-tight">
                              {rev.author}
                            </span>
                            <span className="text-[11px] text-emerald-700 font-semibold inline-flex items-center gap-0.5">
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
                                  ? 'fill-amber-500 text-amber-500'
                                  : 'text-slate-200'
                              }`}
                            />
                          ))}
                        </div>
                      </div>

                      {rev.comment ? (
                        <p className="text-xs text-slate-700 leading-relaxed italic mt-2">
                          &ldquo;{rev.comment}&rdquo;
                        </p>
                      ) : (
                        <p className="text-xs text-slate-400 mt-2">{tk('noComment')}</p>
                      )}
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-200/60 text-[11px] text-slate-400">
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
              <div className="text-center py-10 text-slate-500 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <ChefHat className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">{tk('noReviewsKitchen')}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {tk('beFirstKitchen', { name: kitchen.name })}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Floating Kitchen Cart Pill (Foodpanda/DoorDash style) */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 inset-x-0 z-50 flex justify-center px-4">
          <div className="bg-[#0C1016] text-white p-3 rounded-2xl shadow-xl border border-white/10 flex items-center justify-between gap-5 max-w-lg w-full">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FF5500] flex items-center justify-center text-white font-bold text-xs">
                {cartCount}
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {kitchen.preOrderOnly ? tk('preOrderTotal') : tk('totalOrder')}
                </div>
                <div className="text-sm font-bold text-white">{formatPrice(cartTotal)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {orderingBlocked ? (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-400 text-xs font-bold border border-slate-700 cursor-not-allowed"
                >
                  {tk('checkoutDisabled')}
                </button>
              ) : (
                <Link
                  href="/cart"
                  className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-[#FF5500] hover:bg-[#ff6a1a] text-white text-xs font-bold transition-colors shadow-sm"
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
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#FF5500] transition-colors py-1.5 px-3 rounded-xl bg-white border border-slate-200 shadow-2xs hover:border-slate-300"
            >
              <ArrowLeft className="rtl:-scale-x-100 w-3.5 h-3.5" />
              <span>{tk('backToKitchensMenus')}</span>
            </Link>
            <Link
              href="/kitchens"
              className="text-xs font-semibold text-slate-500 hover:text-[#FF5500] transition-colors"
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
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-32">
      {renderPublicHeader()}

      {renderStorefrontBody(true)}
    </div>
  );
}
