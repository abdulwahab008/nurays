'use client';

import { useState, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { isAxiosError } from 'axios';
import { CoverImage } from '@/components/ui/CoverImage';
import { TrayBar, ViewTrayLink } from '@/components/cart/TrayBar';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { displayRating, formatDate, formatPrice } from '@/lib/utils';
import { getStackedDiscountedPrice, type CatalogPromotionLike } from '@/lib/pricing';
import { apiClient, ApiResponse, apiErrorStatus, apiErrorCode, apiErrorDetails, errorMessage, type CartConflictDetails } from '@/lib/api-client';
import type { PublicSeller, PublicSellerAvailability } from '@/lib/services/seller.service';
import { cartService } from '@/lib/services/cart.service';
import { useCartStore } from '@/lib/store/cart-store';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { Button } from '@/components/ui/button';
import { favoriteService } from '@/lib/services/favorite.service';
import { productService } from '@/lib/services/product.service';
import { addressService } from '@/lib/services/address.service';
import { useCommunityStore } from '@/lib/store/community-store';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useT } from '@/lib/i18n';
import { useHydrated } from '@/lib/hooks/use-hydrated';
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
  ArrowLeft,
  Check,
  Bell,
  Heart,
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
  /** How many the kitchen has left; null when the API did not say. */
  stock: number | null;
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
  deliveryFee: string | null;
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
  isVerified: boolean;
  storeNotice: string | null;
  reviews: KitchenReview[];
  dishes: KitchenDish[];
}

type LoadState = 'loading' | 'ready' | 'not_found' | 'error';

type CatalogPromotion = CatalogPromotionLike & { id: string };

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
  return { day, time: `\u2066${time}\u2069`, isToday };
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
  return `\u2066${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}\u2069`;
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

/** The kitchen's own delivery terms; null without any (the fee then depends on where the customer is). */
function describeDeliveryFee(s: PublicSeller, tk: KitchenT): string | null {
  const freeOver = positiveAmount(s.freeDeliveryThreshold);
  const fixedFee = s.deliveryFeeType === 'fixed' ? nonNegativeAmount(s.deliveryFeeFixed) : null;
  const freeOverNote = freeOver != null ? tk('freeOverNote', { amount: formatPrice(freeOver) }) : '';
  if (fixedFee === 0) return tk('freeDelivery');
  if (fixedFee != null) return `${tk('amountDelivery', { amount: formatPrice(fixedFee) })}${freeOverNote}`;
  if (s.deliveryFeeType === 'distance') return `${tk('feeByDistanceLong')}${freeOverNote}`;
  if (freeOver != null) return tk('freeDeliveryOver', { amount: formatPrice(freeOver) });
  return null;
}

/** What delivery to the customer costs and takes, as the dish cards are quoted; null when not known. */
interface DeliveryToYou {
  deliverable: boolean;
  fee: number;
  min: number | null;
  max: number | null;
  reason: string | null;
}

function describeDeliveryToYou(d: DeliveryToYou, tk: KitchenT): string {
  if (!d.deliverable) return d.reason || tk('notDeliverable');
  const fee = d.fee === 0 ? tk('freeDelivery') : tk('amountDelivery', { amount: formatPrice(d.fee) });
  return d.min != null && d.max != null ? tk('feeAndTime', { fee, min: d.min, max: d.max }) : fee;
}

function toKitchenProfile(
  s: PublicSeller,
  promotions: Record<string, CatalogPromotion[]>,
  tb: BrowseT,
  tk: KitchenT,
): KitchenProfile {
  const availability = s.availability ?? null;
  // The stored aggregate is not trusted on its own: with no published review there is no rating to show.
  const reviewCount = s.reviews?.length ? Number(s.totalReviews) || s.reviews.length : 0;
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
    isVerified,
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
      const listPrice = Number(p.price);
      const deals = promotions[p.id];
      const price = getStackedDiscountedPrice(listPrice, deals);
      const originalPrice = deals?.length ? listPrice : p.originalPrice != null ? Number(p.originalPrice) : null;
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
        stock: p.stockQuantity ?? null,
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
  const router = useRouter();
  const { showToast } = useToast();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const tb = useT(browseMessages);
  const tk = useT(kitchenMessages);
  const hydrated = useHydrated();
  // The API's seller; the page's text is built from it in the current language.
  const [seller, setSeller] = useState<PublicSeller | null>(initial ?? null);
  const [promotions, setPromotions] = useState<Record<string, CatalogPromotion[]>>({});
  const kitchen = useMemo(
    () => (seller ? toKitchenProfile(seller, promotions, tb, tk) : null),
    [seller, promotions, tb, tk],
  );
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
  const [isFavorite, setIsFavorite] = useState(false);
  const [deliveryToYou, setDeliveryToYou] = useState<DeliveryToYou | null>(null);
  const communityId = useCommunityStore((st) => st.selectedCommunity?.id ?? null);
  const openAreaPicker = useCommunityStore((st) => st.openSelectorModal);

  const idParam = params?.id;
  const kitchenId = (Array.isArray(idParam) ? idParam[0] : idParam) ?? '';
  const sellerId = seller?.id ?? null;

  // What this kitchen already has in the tray (kept in the browser), so the counts and the tray bar survive a revisit.
  useEffect(() => {
    if (!sellerId) return;
    const mine = useCartStore.getState().items.filter((i) => i.sellerId === sellerId);
    setAddedItems(Object.fromEntries(mine.map((i) => [i.productId, i.quantity])));
    setCartCount(mine.reduce((n, i) => n + i.quantity, 0));
    setCartTotal(mine.reduce((n, i) => n + i.subtotal, 0));
  }, [sellerId]);

  useEffect(() => {
    if (!sellerId || !isAuthenticated) return;
    let cancelled = false;
    favoriteService.checkFavorite(sellerId).then((fav) => {
      if (!cancelled) setIsFavorite(fav);
    });
    return () => {
      cancelled = true;
    };
  }, [sellerId, isAuthenticated]);

  // The kitchen's running deals, priced the same way as on the dish page.
  const productIdsKey = (seller?.products ?? []).map((p) => p.id).join(',');
  useEffect(() => {
    if (!productIdsKey) return;
    let cancelled = false;
    apiClient
      .get<ApiResponse<Record<string, CatalogPromotion[]>>>(`/promotions/catalog?productIds=${encodeURIComponent(productIdsKey)}`)
      .then((res) => {
        if (!cancelled) setPromotions(res.data?.data ?? {});
      })
      .catch(() => {
        if (!cancelled) setPromotions({});
      });
    return () => {
      cancelled = true;
    };
  }, [productIdsKey]);

  // The fee and time to the customer's address (signed in) or chosen area, worked out by the server exactly as on the
  // dish cards: one of the kitchen's dishes, listed with where the customer is, carries the kitchen's quote.
  useEffect(() => {
    if (!sellerId) return;
    let cancelled = false;
    (async () => {
      let coords: { latitude: number; longitude: number } | undefined;
      if (isAuthenticated) {
        try {
          const saved = (await addressService.getAddresses()).data ?? [];
          coords = (saved.find((a) => a.isDefault && a.coordinates) ?? saved.find((a) => a.coordinates))?.coordinates;
        } catch {
          // The area alone still gives a quote.
        }
      }
      if (!coords && !communityId) {
        if (!cancelled) setDeliveryToYou(null);
        return;
      }
      try {
        const res = await productService.getProducts({
          sellerId,
          limit: 1,
          communityId: communityId ?? undefined,
          customerLat: coords?.latitude,
          customerLng: coords?.longitude,
        });
        const d = res.data?.products?.[0]?.delivery;
        if (cancelled) return;
        setDeliveryToYou(
          d ? { deliverable: d.deliverable, fee: d.fee, min: d.estimatedMinMinutes, max: d.estimatedMaxMinutes, reason: d.reason } : null,
        );
      } catch {
        if (!cancelled) setDeliveryToYou(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sellerId, communityId, isAuthenticated]);

  const toggleFavorite = async () => {
    if (!isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    if (!kitchen) return;
    const was = isFavorite;
    setIsFavorite(!was);
    try {
      if (was) await favoriteService.removeFavorite(kitchen.id);
      else await favoriteService.addFavorite(kitchen.id);
      showToast(tk(was ? 'toastRemovedFav' : 'toastSavedFav', { name: kitchen.name }), 'info');
    } catch {
      setIsFavorite(was);
      showToast(tk('toastFavFailed'), 'error');
    }
  };

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
    if (dish.stock != null && (addedItems[dish.id] || 0) >= dish.stock) {
      showToast(tb('toastInsufficientStock'), 'error');
      return;
    }

    // One kitchen per order: a tray holding another kitchen's dishes is asked about first, not mixed or refused by the server.
    const other = useCartStore.getState().items.find((i) => i.sellerId !== kitchen?.id);
    if (other) {
      setConflictModal({ isOpen: true, existingKitchenName: other.sellerName || tk('anotherHomeKitchen'), dish });
      return;
    }

    const stockType = dish.isFrozen ? 'hub' : 'direct';
    if (isAuthenticated) {
      try {
        await cartService.addToCart({ productId: dish.id, quantity: 1, stockType });
      } catch (err) {
        if (apiErrorCode(err) === 'INSUFFICIENT_STOCK') {
          showToast(tb('toastInsufficientStock'), 'error');
          setReloadKey((k) => k + 1);
        } else if (apiErrorStatus(err) === 409 || apiErrorCode(err) === 'CART_SELLER_MISMATCH') {
          const details = apiErrorDetails(err) as CartConflictDetails | undefined;
          setConflictModal({
            isOpen: true,
            existingKitchenName: details?.existingSeller?.name || tk('anotherHomeKitchen'),
            dish,
          });
        } else {
          showToast(errorMessage(err, tb('toastAddToCartFailed')), 'error');
        }
        return;
      }
    }

    setAddedItems((prev) => ({
      ...prev,
      [dish.id]: (prev[dish.id] || 0) + 1,
    }));
    setCartCount((c) => c + 1);
    setCartTotal((t) => t + dish.price);
    useCartStore.getState().addItem({
      id: newCartLineId(dish.id),
      productId: dish.id,
      productName: dish.name,
      productImage: dish.photo ?? undefined,
      sellerId: kitchen?.id || 'unknown',
      sellerName: kitchen?.name || tb('homeKitchen'),
      quantity: 1,
      unitPrice: dish.price,
      stockType,
      subtotal: dish.price,
    });

    if (kitchen?.preOrderOnly) {
      showToast(tk('toastPreorderOnly', { name: kitchen.name }), 'info');
    }
    showToast(tk('toastAddedTray', { name: dish.name }), 'success');
  };

  const handleConfirmSwitchKitchen = async () => {
    const dish = conflictModal.dish;
    if (!dish) return;
    setSwitchingKitchen(true);
    try {
      if (isAuthenticated) {
        await cartService.addToCart({
          productId: dish.id,
          quantity: 1,
          stockType: dish.isFrozen ? 'hub' : 'direct',
          clearAndAdd: true,
        });
      }
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

  // Not-found / error pages, under the same header as the storefront.
  const renderStatePage = (body: ReactNode) => (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />
      <div className="px-4">{body}</div>
    </div>
  );

  const pageState: LoadState = kitchenId ? loadState : 'not_found';

  if (pageState === 'not_found') {
    return renderStatePage(
      <div className="text-center py-14 px-6 bg-surface rounded-3xl border border-line shadow-xs max-w-md mx-auto my-12">
        <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-4">
          <ChefHat className="w-6 h-6" />
        </div>
        <h1 className="font-bold text-ink text-base">{tk('notFound')}</h1>
        <p className="text-xs text-muted mt-1.5 leading-relaxed">
          {tk('notFoundBody')}
        </p>
        <Link
          href="/kitchens"
          className="inline-flex items-center gap-1.5 mt-5 h-11 px-4 rounded-xl border border-line text-ink text-sm font-semibold hover:bg-raised transition-colors"
        >
          <ArrowLeft className="rtl:-scale-x-100 w-3.5 h-3.5" />
          <span>{tk('browseAllKitchens')}</span>
        </Link>
      </div>
    );
  }

  if (pageState === 'error') {
    return renderStatePage(
      <div
        role="alert"
        className="text-center py-14 px-6 bg-surface rounded-3xl border border-line shadow-xs max-w-md mx-auto my-12"
      >
        <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center mx-auto mb-4">
          <ChefHat className="w-6 h-6" />
        </div>
        <h1 className="font-bold text-ink text-base">{tk('errorHeading')}</h1>
        <p className="text-xs text-muted mt-1.5 leading-relaxed">
          {tk('errorBody')}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button onClick={retryLoad} className="h-11 rounded-xl">
            {tk('tryAgain')}
          </Button>
          <Link
            href="/kitchens"
            className="inline-flex items-center h-11 px-4 rounded-xl border border-line text-ink text-sm font-semibold hover:bg-raised transition-colors"
          >
            {tk('allKitchens')}
          </Link>
        </div>
      </div>
    );
  }

  if (!kitchen) {
    return renderStatePage(
      <div role="status" className="flex items-center justify-center gap-2 py-24 text-sm text-muted">
        <span className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" aria-hidden />
        {tk('loadingStorefront')}
      </div>,
    );
  }

  const frozenCount = kitchen.dishes.filter((d) => d.isFrozen).length;
  const freshCount = kitchen.dishes.length - frozenCount;
  // A tab only for a kind the menu has, and no tabs at all when the menu is one kind.
  const categories = [
    { id: 'all', label: tk('tabAll', { count: kitchen.dishes.length }), Icon: UtensilsCrossed },
    { id: 'fresh', label: tk('tabFresh', { count: freshCount }), Icon: Flame },
    { id: 'frozen', label: tk('tabFrozen', { count: frozenCount }), Icon: Snowflake },
  ];
  const showTabs = freshCount > 0 && frozenCount > 0;
  const category = showTabs ? activeCategory : 'all';
  const filteredDishes = category === 'all'
    ? kitchen.dishes
    : category === 'frozen'
    ? kitchen.dishes.filter((d) => d.isFrozen)
    : kitchen.dishes.filter((d) => !d.isFrozen);
  const deliveryLine = deliveryToYou ? describeDeliveryToYou(deliveryToYou, tk) : kitchen.deliveryFee;

  const isOpenNow = kitchen.availability?.isOpen === true;
  const orderingBlocked = kitchen.isClosed && !kitchen.preOrderOnly;

  const renderStorefrontBody = () => (
    <>

      {/* The kitchen's cover photo; without one, a short band so the menu is not pushed off the screen */}
      <div className="relative">
        {kitchen.coverPhoto ? (
          <div className="h-44 sm:h-72 w-full overflow-hidden relative bg-raised">
            <CoverImage src={kitchen.coverPhoto} alt={kitchen.name} label={kitchen.name} size="lg" eager className="w-full h-full" />
          </div>
        ) : (
          <div className="h-[120px] w-full bg-brand-soft" aria-hidden />
        )}

        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 -mt-12 sm:-mt-20 relative z-10">
          <div className="relative bg-surface rounded-[24px] p-4 sm:p-7 shadow-[var(--shadow-card)] border border-line text-ink">
            <button
              type="button"
              onClick={toggleFavorite}
              aria-label={isFavorite ? tk('removeFav') : tk('saveFav')}
              aria-pressed={isFavorite}
              className="absolute top-3 end-3 w-11 h-11 rounded-full border border-line bg-surface hover:bg-raised flex items-center justify-center"
            >
              <Heart className={`w-5 h-5 ${isFavorite ? 'fill-red-500 text-red-500' : 'text-muted'}`} aria-hidden />
            </button>

            <div className="flex items-start gap-3 sm:gap-4 pe-12">
              <CoverImage
                src={kitchen.chefAvatar}
                alt={kitchen.chefName}
                label={kitchen.chefName}
                size="sm"
                eager
                className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl shrink-0"
              />
              <div className="min-w-0">
                <h1 className="text-[22px] sm:text-[32px] leading-tight font-extrabold tracking-tight text-ink flex items-center gap-1.5">
                  <span>{kitchen.name}</span>
                  {kitchen.isVerified && (
                    <ShieldCheck className="w-5 h-5 shrink-0 text-brand-ink" aria-label={kitchen.verifiedLabel} />
                  )}
                </h1>
                <p className="text-sm text-muted mt-0.5 flex flex-wrap items-center gap-x-1.5">
                  <span>{tk('operatedBy', { name: kitchen.chefName })}</span>
                  {kitchen.area && (
                    <>
                      <span aria-hidden>·</span>
                      <MapPin className="w-3.5 h-3.5" aria-hidden />
                      <span>{kitchen.area}</span>
                    </>
                  )}
                </p>
                <a href="#customer-reviews" className="mt-1 inline-flex min-h-8 items-center gap-1 text-sm text-ink">
                  {kitchen.rating ? (
                    <>
                      <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
                      <span className="font-bold">{kitchen.rating}</span>
                      <span className="text-muted">
                        {tk(kitchen.reviewCount === 1 ? 'reviewsParenOne' : 'reviewsParenMany', { count: kitchen.reviewCount })}
                      </span>
                    </>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink text-xs font-medium">
                      {tk('new')} · {tk('noReviews')}
                    </span>
                  )}
                </a>
              </div>
            </div>

            {kitchen.chefBio && <p className="text-sm text-muted mt-3 max-w-2xl line-clamp-2 leading-relaxed">{kitchen.chefBio}</p>}

            {/* What a customer needs before ordering: open or not, delivery fee and time, minimum */}
            <ul className="mt-4 pt-4 border-t border-line space-y-2 text-sm">
              {(kitchen.statusText || kitchen.hoursText) && (
                <li className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted shrink-0" aria-hidden />
                  <span className={`font-semibold ${isOpenNow ? 'text-brand-ink' : 'text-ink'}`}>
                    {kitchen.statusText}
                  </span>
                  {kitchen.hoursText && <span className="text-muted">· {kitchen.hoursText}</span>}
                  {kitchen.preOrderOnly && kitchen.availability?.status !== 'preorder_only' && (
                    <span className="text-muted">· {tb('preOrdersOnly')}</span>
                  )}
                </li>
              )}
              <li className="flex items-center gap-2">
                <Bike className="w-4 h-4 text-muted shrink-0" aria-hidden />
                {deliveryLine ? (
                  <span className="font-semibold text-ink">{deliveryLine}</span>
                ) : communityId ? (
                  <span className="text-muted">{tk('feeAtCheckout')}</span>
                ) : (
                  <button type="button" onClick={openAreaPicker} className="min-h-8 font-semibold text-brand-ink underline-offset-2 hover:underline">
                    {tk('chooseAreaForFee')}
                  </button>
                )}
              </li>
              <li className="flex items-center gap-2 text-muted">
                <span className="w-4 shrink-0" aria-hidden />
                <span>{kitchen.minOrder != null ? tk('minOrderLabel', { amount: formatPrice(kitchen.minOrder) }) : tk('noMinimum')}</span>
              </li>
            </ul>
          </div>
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

      {/* Menu kinds, only when the menu has both */}
      {showTabs && (
        <div className="sticky top-(--header-offset) z-30 bg-page/95 backdrop-blur-md border-b border-line py-3 mt-6">
          <div role="tablist" className="max-w-[1280px] mx-auto px-4 sm:px-8 flex items-center gap-2 overflow-x-auto no-scrollbar">
            {categories.map(({ id, label, Icon }) => {
              const selected = category === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveCategory(id)}
                  className={`flex-shrink-0 inline-flex items-center gap-1.5 h-11 px-4 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${
                    selected ? 'bg-brand-soft text-brand-soft-ink border-brand' : 'bg-surface text-ink border-line hover:bg-raised'
                  }`}
                >
                  <Icon className="w-4 h-4" aria-hidden />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Dishes Menu Grid */}
      <main className={`max-w-[1280px] mx-auto px-4 sm:px-8 ${showTabs ? 'mt-6' : 'mt-8'}`}>
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
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight text-ink">
                {category === 'all'
                  ? tk('currentMenu')
                  : category === 'fresh'
                  ? tk('freshMeals')
                  : tk('frozenPacks')}
              </h2>
              <span className="text-sm font-semibold text-muted flex-shrink-0">
                {tk(filteredDishes.length === 1 ? 'dishOne' : 'dishMany', { count: filteredDishes.length })}
              </span>
            </div>

            {filteredDishes.length === 0 ? (
              <p className="text-center text-sm text-muted py-10 bg-surface rounded-[20px] border border-dashed border-line-strong">
                {category === 'frozen'
                  ? tk('noFrozen')
                  : tk('noFresh')}
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                {filteredDishes.map((dish) => {
                  const count = addedItems[dish.id] || 0;
                  const soldOut = dish.stock != null && dish.stock <= 0;
                  const atStock = dish.stock != null && count >= dish.stock;
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
                            <span className="inline-flex items-center h-11 px-3 rounded-xl bg-raised text-muted text-sm font-semibold cursor-not-allowed">
                              {tk('closed')}
                            </span>
                          ) : soldOut && count === 0 ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex items-center h-11 px-3 rounded-xl bg-raised text-muted text-sm font-semibold cursor-not-allowed"
                            >
                              {tb('soldOut')}
                            </button>
                          ) : count === 0 ? (
                            <button
                              type="button"
                              onClick={() => handleAddToCart(dish)}
                              aria-label={tb('addNameToTray', { name: dish.name })}
                              className={`inline-flex items-center gap-1.5 h-11 px-4 rounded-xl text-sm font-bold transition-all active:scale-95 ${
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
                            <div className="flex items-center gap-1 bg-raised p-0.5 rounded-xl">
                              <button
                                onClick={() => handleRemoveFromCart(dish)}
                                aria-label={tk('removeOne', { name: dish.name })}
                                className="w-10 h-10 rounded-[10px] bg-surface text-ink font-extrabold hover:bg-line transition-colors flex items-center justify-center text-base shadow-xs"
                              >
                                -
                              </button>
                              <span className="font-extrabold text-sm text-ink min-w-6 text-center" aria-live="polite">
                                {count}
                              </span>
                              <button
                                onClick={() => handleAddToCart(dish)}
                                disabled={atStock}
                                aria-label={tk('addOne', { name: dish.name })}
                                className="w-10 h-10 rounded-[10px] bg-brand text-on-brand font-extrabold hover:bg-brand-500 transition-colors flex items-center justify-center text-base disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* What customers said, flat on the page: the header carries the score, each review is one card. */}
      <section id="customer-reviews" className="max-w-[1280px] mx-auto px-4 sm:px-8 mt-12 mb-10 scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-4">
            <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight text-ink">{tk('reviewsTitle')}</h2>
            <p className="flex items-center gap-1.5 text-sm text-muted">
              <Star className="w-4 h-4 fill-accent text-accent" aria-hidden />
              <span className="font-bold text-ink">{kitchen.rating ?? tk('new')}</span>
              <span>
                ·{' '}
                {kitchen.reviewCount > 0
                  ? tk(kitchen.reviewCount === 1 ? 'verifiedReviewsOne' : 'verifiedReviewsMany', { count: kitchen.reviewCount })
                  : tk('noReviews')}
              </span>
            </p>
          </div>

          <div>
            {kitchen.reviews.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {kitchen.reviews.map((rev) => (
                  <article key={rev.id} className="p-4 rounded-2xl bg-surface border border-line">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-9 h-9 shrink-0 rounded-full bg-brand-soft flex items-center justify-center text-brand-soft-ink font-extrabold text-sm">
                          {rev.author.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-ink truncate">{rev.author}</p>
                          <p className="text-xs text-muted">
                            {tk('verifiedCustomer')} · {hydrated ? formatDate(rev.createdAt) : null}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0" aria-label={`${rev.rating} / 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} className={`w-3.5 h-3.5 ${n <= rev.rating ? 'fill-accent text-accent' : 'text-line-strong'}`} aria-hidden />
                        ))}
                      </div>
                    </div>
                    {rev.comment && <p className="text-sm text-ink leading-relaxed mt-3">&ldquo;{rev.comment}&rdquo;</p>}
                  </article>
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
      </section>

      {cartCount > 0 && (
        <TrayBar
          count={cartCount}
          total={cartTotal}
          label={kitchen.preOrderOnly ? tk('preOrderTotal') : tk('totalOrder')}
          action={
            orderingBlocked ? (
              <button
                type="button"
                disabled
                className="h-11 px-4 rounded-xl bg-white/10 text-[#A3BCB7] text-sm font-bold cursor-not-allowed"
              >
                {tk('checkoutDisabled')}
              </button>
            ) : (
              <ViewTrayLink label={kitchen.preOrderOnly ? tk('schedulePreOrder') : tk('reviewCheckout')} />
            )
          }
        />
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

  return (
    <div className="min-h-screen bg-page text-ink pb-32">
      <SiteHeader />
      {renderStorefrontBody()}
    </div>
  );
}
