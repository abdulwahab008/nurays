'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Trash2,
  Truck,
  Tag,
  ShoppingBag,
  Check,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  MapPin,
  X,
  Flame,
  Snowflake,
  ArrowRight,
} from 'lucide-react';
import { cartService, CartResponse, type CartItem } from '@/lib/services/cart.service';
import { productService } from '@/lib/services/product.service';
import { useCommunityStore } from '@/lib/store/community-store';
import { loginUrlFor } from '@/lib/auth-redirect';
import { CoverImage } from '@/components/ui/CoverImage';
import { kitchenMessages } from '@/lib/i18n/messages/kitchen';
import { formatPrice, imageVariant, orderTotals } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore, trayFromServer, CartItem as LocalCartItem } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DEFAULT_ADDRESS, useDeliveryEstimate } from '@/lib/hooks/use-delivery-estimate';
import { useT } from '@/lib/i18n';
import { getPromotionLabel, getStackedDiscountedPrice } from '@/lib/pricing';
import { commonMessages } from '@/lib/i18n/messages/common';
import { checkoutMessages, richText } from '@/lib/i18n/messages/checkout';
import { useShallow } from 'zustand/react/shallow';

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

function localItemsToCartResponse(localItems: LocalCartItem[]): CartResponse {
  const subtotal = localItems.reduce((acc, i) => acc + (i.subtotal || i.unitPrice * i.quantity), 0);
  const totalItems = localItems.reduce((acc, i) => acc + i.quantity, 0);
  const firstSeller = localItems[0]
    ? { id: localItems[0].sellerId, businessName: localItems[0].sellerName || 'Home Kitchen' }
    : undefined;
  return {
    items: localItems.map((i) => ({
      id: i.id,
      product: {
        id: i.productId,
        name: i.productName,
        price: i.unitPrice,
        image: i.productImage,
      },
      seller: {
        id: i.sellerId,
        businessName: i.sellerName || 'Home Kitchen',
      },
      quantity: i.quantity,
      stockType: i.stockType || 'direct',
      hubId: i.hubId,
      subtotal: i.subtotal || i.unitPrice * i.quantity,
    })),
    summary: {
      subtotal,
      totalItems,
      totalSellers: 1,
    },
    activeSeller: firstSeller ? { id: firstSeller.id, businessName: firstSeller.businessName } : null,
  };
}

export default function CartPage() {
  const router = useRouter();
  const t = useT(checkoutMessages);
  const tc = useT(commonMessages);
  const tk = useT(kitchenMessages);
  const selectedCommunity = useCommunityStore((st) => st.selectedCommunity);
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { showToast } = useToast();
  const storeItems = useCartStore((s) => s.items);
  const { setItems, clearCart: clearCartStore, appliedPromoCode, setAppliedPromoCode } = useCartStore(useShallow((s) => ({ setItems: s.setItems, clearCart: s.clearCart, appliedPromoCode: s.appliedPromoCode, setAppliedPromoCode: s.setAppliedPromoCode })));
  const [cart, setCart] = useState<CartResponse | null>(() => {
    // Optimistically initialize cart if items already exist in local store
    if (typeof window !== 'undefined') {
      const existing = useCartStore.getState().items || [];
      if (existing.length > 0) return localItemsToCartResponse(existing);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  // Why the tray could not be read; shown instead of "Your tray is empty", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [cartPromoInput, setCartPromoInput] = useState('');
  const [promoValidating, setPromoValidating] = useState(false);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});
  // Bumped whenever the tray changed on the server, so the delivery estimate is asked for again.
  const [trayVersion, setTrayVersion] = useState(0);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  const handleApplyPromoInCart = async () => {
    const code = cartPromoInput.trim().toUpperCase();
    if (!code) return;
    setPromoValidating(true);
    try {
      if (isAuthenticated) {
        const sub = discountedSubtotal;
        const res = await apiClient.post<{ success: boolean; data: { code: string; discountAmount: number } }>(
          '/promotions/validate',
          { code, cartTotal: sub }
        );
        if (res.data?.success && res.data?.data) {
          setAppliedPromoCode(res.data.data.code);
          setCartPromoInput('');
          showToast(t('promoAppliedSave', { code: res.data.data.code, amount: formatPrice(res.data.data.discountAmount) }), 'success');
        }
      } else {
        setAppliedPromoCode(code);
        setCartPromoInput('');
        showToast(t('promoAppliedTray', { code }), 'success');
      }
    } catch (err) {
      const msg = apiErrorMessage(err, t('invalidCode'));
      showToast(msg, 'error');
    } finally {
      setPromoValidating(false);
    }
  };

  // Sync cart display whenever local storeItems hydrate or change and server cart is not active
  useEffect(() => {
    if (storeItems.length > 0) {
      if (!cart || !cart.items || cart.items.length === 0) {
        setCart(localItemsToCartResponse(storeItems));
      }
    }
  }, [storeItems]);

  const loadCart = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token = apiClient.getAccessToken();
      const localStoreItems = useCartStore.getState().items || [];

      if (token || isAuthenticated) {
        const response = await cartService.getCart();
        const cartData = response.data;

        // Signed in, the server's tray is the truth: dishes added while signed out were merged in at sign-in.
        setCart(cartData?.items?.length ? cartData : null);
        setItems(trayFromServer(cartData?.items ?? []));

        if (cartData?.items?.length) {
          const productIds = cartData.items.map((i) => i.product.id).filter(Boolean);
          if (productIds.length) {
            try {
              const promRes = await apiClient.get<{ success: boolean; data: Record<string, CatalogPromotion[]> }>(
                `/promotions/catalog?productIds=${encodeURIComponent(productIds.join(','))}`
              );
              if (promRes.data?.success && promRes.data?.data) setPromotionsByProductId(promRes.data.data);
            } catch {
              setPromotionsByProductId({});
            }
          }
        }
      } else {
        // Guest mode (unauthenticated)
        if (localStoreItems.length > 0) {
          setCart(localItemsToCartResponse(localStoreItems));
        } else {
          setCart(null);
        }
      }
    } catch (error) {
      console.error('Failed to load cart:', error);
      const localStoreItems = useCartStore.getState().items || [];
      if (localStoreItems.length > 0) {
        setCart(localItemsToCartResponse(localStoreItems));
      } else {
        setLoadError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCart();
  }, [isAuthenticated]);

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      await handleRemoveItem(itemId);
      return;
    }
    setUpdatingItem(itemId);
    // Snapshot first: the change below is optimistic, and if the server refuses it
    // the screen and the saved tray must go back to what they were.
    const snapshot = { cart, storeItems: useCartStore.getState().items };
    try {
      // Optimistically update local cart and store
      setCart((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.map((it) => {
          if (it.id === itemId || it.product.id === itemId) {
            const uPrice = it.variant?.price ?? it.product.price;
            return { ...it, quantity, subtotal: uPrice * quantity };
          }
          return it;
        });
        const subtotal = nextItems.reduce((acc, it) => acc + it.subtotal, 0);
        return {
          ...prev,
          items: nextItems,
          summary: {
            ...prev.summary,
            subtotal,
            totalItems: nextItems.reduce((acc, it) => acc + it.quantity, 0),
          },
        };
      });
      useCartStore.getState().updateItem(itemId, quantity);

      const token = apiClient.getAccessToken();
      if (token || isAuthenticated) {
        await cartService.updateCartItem(itemId, quantity);
        setTrayVersion((v) => v + 1);
      }
    } catch (error) {
      showToast(apiErrorMessage(error, t('couldNotUpdateQty')), 'error');
      await restoreCart(snapshot);
    } finally {
      setUpdatingItem(null);
    }
  };

  // Undo an optimistic change the server rejected: put back exactly what was on screen
  // and in the saved tray, then quietly reconcile with the server's real cart. (A failed
  // removal used to leave the item gone from the screen while the server still held —
  // and checkout still charged for — it.)
  const restoreCart = async (snapshot: { cart: typeof cart; storeItems: ReturnType<typeof useCartStore.getState>['items'] }) => {
    setCart(snapshot.cart);
    useCartStore.getState().setItems(snapshot.storeItems);
    try {
      const fresh = await cartService.getCart();
      if (fresh.data) setCart(fresh.data);
    } catch {
      // keep the restored snapshot
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setUpdatingItem(itemId);
    const snapshot = { cart, storeItems: useCartStore.getState().items };
    try {
      // Optimistically remove from state and store
      setCart((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.filter((it) => it.id !== itemId && it.product.id !== itemId);
        if (nextItems.length === 0) return null;
        const subtotal = nextItems.reduce((acc, it) => acc + it.subtotal, 0);
        return {
          ...prev,
          items: nextItems,
          summary: {
            ...prev.summary,
            subtotal,
            totalItems: nextItems.reduce((acc, it) => acc + it.quantity, 0),
          },
        };
      });
      useCartStore.getState().removeItem(itemId);

      const token = apiClient.getAccessToken();
      if (token || isAuthenticated) {
        await cartService.removeCartItem(itemId);
        setTrayVersion((v) => v + 1);
      }
    } catch (error) {
      showToast(apiErrorMessage(error, t('failedRemoveItem')), 'error');
      await restoreCart(snapshot);
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleClearCart = async () => {
    setClearingCart(true);
    try {
      const token = apiClient.getAccessToken();
      if (token || isAuthenticated) {
        await cartService.clearCart();
      }
      clearCartStore();
      setCart(null);
      showToast(t('trayCleared'), 'info');
    } catch (error) {
      showToast(apiErrorMessage(error, t('failedClearTray')), 'error');
    } finally {
      setClearingCart(false);
      setShowClearModal(false);
    }
  };

  // Calculations
  const hasItems = cart && cart.items && cart.items.length > 0;

  // A sum over the few lines of one cart: cheap enough to work out on every render.
  const discountedSubtotal = (cart?.items ?? []).reduce((sum, item) => {
    const basePrice = item.variant?.price ?? item.product.price;
    const promos = promotionsByProductId[item.product.id] || [];
    const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(basePrice, promos) : basePrice;
    return sum + unitPrice * item.quantity;
  }, 0);

  const promotionSavings = hasItems ? Math.max(0, cart.summary.subtotal - discountedSubtotal) : 0;

  // What delivery costs is the server's to say (it depends on the kitchen, the address and the order's amount), so nothing
  // is assumed here: with no sign-in, no saved address or no answer the page says it is worked out at checkout.
  const { estimate: deliveryEstimate, pending: estimatePending } = useDeliveryEstimate({
    enabled: isAuthenticated && !loading && !!hasItems,
    addressId: DEFAULT_ADDRESS,
    version: trayVersion,
  });
  const deliveryKnown = !!deliveryEstimate && deliveryEstimate.isDeliverable !== false;
  const isFreeDelivery = deliveryKnown && deliveryEstimate.isFree;

  // Without a saved address (a guest, or a customer who has not added one) the kitchen's quote for the chosen area stands
  // in, as on the kitchen and dish pages; the same listing says which dishes are frozen (for the insulated pack).
  const traySellerId = hasItems ? cart.activeSeller?.id || cart.items[0]?.seller.id || null : null;
  const areaId = selectedCommunity?.id ?? null;
  const [kitchenInfo, setKitchenInfo] = useState<{
    key: string;
    frozen: Set<string>;
    quote: { deliverable: boolean; fee: number; reason: string | null } | null;
  } | null>(null);
  useEffect(() => {
    if (!traySellerId) return;
    let cancelled = false;
    const key = `${traySellerId}:${areaId}`;
    productService
      .getProducts({ sellerId: traySellerId, limit: 50, communityId: areaId ?? undefined })
      .then((res) => {
        if (cancelled) return;
        const list = res.data?.products ?? [];
        const d = areaId ? list[0]?.delivery : null;
        setKitchenInfo({
          key,
          frozen: new Set(list.filter((p) => p.productType === 'frozen').map((p) => p.id)),
          quote: d ? { deliverable: d.deliverable, fee: d.fee, reason: d.reason } : null,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [traySellerId, areaId]);
  const info = kitchenInfo?.key === `${traySellerId}:${areaId}` ? kitchenInfo : null;
  // Hub stock is the frozen range; a kitchen's own frozen dishes are known from its listing.
  const isFrozenItem = (i: CartItem) => i.stockType === 'hub' || !!info?.frozen.has(i.product.id);
  const areaQuote = !deliveryEstimate && !estimatePending ? info?.quote ?? null : null;
  const areaQuoteKnown = !!areaQuote && areaQuote.deliverable;

  const deliveryFee = deliveryKnown
    ? (deliveryEstimate.isFree ? 0 : deliveryEstimate.deliveryFee)
    : areaQuoteKnown
      ? areaQuote.fee
      : 0;
  const { gst, total: displayTotal } = orderTotals(discountedSubtotal, deliveryFee);

  // Progress towards free delivery, only for a kitchen that has an order amount which waives its fee, and measured the
  // way the server measures it.
  const offeredThreshold = deliveryKnown ? deliveryEstimate.freeDeliveryThreshold : null;
  const freeDeliveryThreshold = offeredThreshold != null && offeredThreshold > 0 ? offeredThreshold : null;
  const countedForDelivery = deliveryEstimate?.deliverySubtotal ?? discountedSubtotal;
  const freeDeliveryProgress = freeDeliveryThreshold ? Math.min(100, Math.floor((countedForDelivery / freeDeliveryThreshold) * 100)) : 0;
  const freeDeliveryRemaining = freeDeliveryThreshold ? Math.max(0, freeDeliveryThreshold - countedForDelivery) : 0;

  if (loading) {
    return (
      <DashboardLayout
        title={t('cartTitle')}
        subtitle={t('cartLoadingSubtitle')}
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center p-8 bg-surface rounded-3xl border border-line shadow-xs max-w-sm">
            <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-ink">{t('loadingTray')}</p>
            <p className="text-xs text-muted mt-1">{t('loadingTrayHint')}</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (loadError && !hasItems) {
    return (
      // No subtitle: "Your dining cart is currently empty" would say what the page could not find out.
      <DashboardLayout title={t('cartTitle')} sidebarItems={sidebarItems} userType="customer">
        <div className="max-w-xl mx-auto my-12">
          <LoadError error={loadError} onRetry={loadCart} title={t('loadFailed')} />
        </div>
      </DashboardLayout>
    );
  }

  // ── EMPTY STATE ──
  if (!hasItems) {
    return (
      <DashboardLayout
        title={t('cartTitle')}
        subtitle=""
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="max-w-2xl mx-auto my-6">
          <div className="rounded-[24px] bg-surface border border-line p-8 sm:p-12 text-center">

            {/* Tray Icon */}
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-soft mb-5">
              <ShoppingBag className="w-8 h-8 text-brand-soft-ink" aria-hidden />
            </div>

            <h2 className="text-2xl sm:text-[28px] font-extrabold text-ink tracking-tight mb-2">
              {t('emptyTitle')}
            </h2>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed mb-6">
              {t('emptyText')}
            </p>

            {/* Quick Cuisine Shortcut Pills */}
            <div className="mb-8">
              <span className="text-sm font-semibold text-muted block mb-2.5">
                {t('popularNearby')}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto">
                <Link
                  href="/products?category=biryani"
                  className="inline-flex items-center h-11 px-4 rounded-full bg-surface border border-line text-sm font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors"
                >
                  {t('pill.biryani')}
                </Link>
                <Link
                  href="/products?category=paratha"
                  className="inline-flex items-center h-11 px-4 rounded-full bg-surface border border-line text-sm font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors"
                >
                  {t('pill.paratha')}
                </Link>
                <Link
                  href="/products?productType=frozen"
                  className="inline-flex items-center h-11 px-4 rounded-full bg-surface border border-line text-sm font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors"
                >
                  {t('pill.frozen')}
                </Link>
                <Link
                  href="/products?category=bbq"
                  className="inline-flex items-center h-11 px-4 rounded-full bg-surface border border-line text-sm font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors"
                >
                  {t('pill.kebab')}
                </Link>
                <Link
                  href="/products?category=desserts"
                  className="inline-flex items-center h-11 px-4 rounded-full bg-surface border border-line text-sm font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors"
                >
                  {t('pill.kheer')}
                </Link>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/products" className="w-full sm:w-auto">
                <span className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl bg-brand hover:bg-brand-500 text-on-brand text-[15px] font-extrabold transition-colors active:scale-95 cursor-pointer">
                  <span>{t('discoverDishes')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
                </span>
              </Link>
              <Link href="/kitchens" className="w-full sm:w-auto">
                <span className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-12 px-6 rounded-xl border border-line-strong text-ink text-[15px] font-bold hover:bg-raised transition-colors cursor-pointer">
                  <ChefHat className="w-4 h-4 text-muted" />
                  <span>{t('browseKitchens')}</span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── CART WITH ITEMS ──
  const activeSeller = cart.activeSeller || cart.items[0]?.seller;
  // Portions, not lines: two plates of one dish are two items, everywhere on this page.
  const trayCount = cart.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <DashboardLayout
      title={t('cartTitleFull')}
      subtitle={
        activeSeller
          ? t(trayCount === 1 ? 'cartSubtitleOne' : 'cartSubtitleMany', { count: trayCount, kitchen: activeSeller.businessName })
          : t(trayCount === 1 ? 'itemsInTrayOne' : 'itemsInTrayMany', { count: trayCount })
      }
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="space-y-6 pb-12">
        {/* Single Kitchen Context Banner */}
        {activeSeller && (
          <div className="bg-surface rounded-[20px] border border-line px-4 py-3 sm:px-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
                <ChefHat className="w-5 h-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-ink text-base break-words">{activeSeller.businessName}</h3>
                {activeSeller.community?.name && (
                  <p className="flex items-center gap-1 text-xs text-muted truncate">
                    <MapPin className="w-3 h-3 shrink-0" aria-hidden />
                    <span>{activeSeller.community.name}</span>
                  </p>
                )}
              </div>
            </div>
            <Link
              href={`/kitchens/${activeSeller.id}`}
              className="shrink-0 inline-flex items-center gap-1 min-h-11 text-sm font-bold text-brand-ink hover:underline whitespace-nowrap"
            >
              <span>{t('addMoreDishes')}</span>
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" aria-hidden />
            </Link>
          </div>
        )}

        {/* Free Delivery Unlocker Progress Bar: only for a kitchen that has an order amount which waives its delivery fee */}
        {freeDeliveryThreshold != null && (
          <div
            className={`bg-surface rounded-[20px] p-4 border border-line transition-opacity ${estimatePending ? 'opacity-60' : ''}`}
            aria-busy={estimatePending}
          >
            <div className="flex items-center justify-between gap-3 text-xs mb-2">
              <span className="font-bold text-ink flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-brand-ink" />
                {isFreeDelivery ? (
                  <span className="text-brand-soft-ink font-extrabold">{t('unlockedFree')}</span>
                ) : (
                  <span>
                    {richText(t('addMoreForFree'), {
                      amount: <strong className="text-ink font-black">{formatPrice(freeDeliveryRemaining)}</strong>,
                      free: <span className="text-brand-ink font-bold">{t('freeDelivery')}</span>,
                    })}
                  </span>
                )}
              </span>
              <span className="font-extrabold text-muted">{freeDeliveryProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-raised overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFreeDelivery ? 'bg-brand' : 'bg-accent'
                }`}
                style={{ width: `${freeDeliveryProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Main Grid: Left Cart Items, Right Order Summary */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* ── LEFT: DISH ITEMS ── */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-extrabold text-ink">{t('selectedDishes')}</h2>

              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="text-sm font-bold text-muted hover:text-red-600 h-11 px-3 rounded-xl hover:bg-raised transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t('clearTray')}</span>
              </button>
            </div>

            {/* Dish Item Cards */}
            <div className="space-y-3">
              {cart.items.map((item) => {
                const promos = promotionsByProductId[item.product.id] || [];
                const originalPrice = item.variant?.price ?? item.product.price;
                const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(originalPrice, promos) : originalPrice;
                const lineTotal = unitPrice * item.quantity;
                const promotionLabel = promos.length > 0 ? promos.map((p) => getPromotionLabel(p, t, formatPrice)).join(' + ') : null;
                const isItemUpdating = updatingItem === item.id;

                return (
                  <div
                    key={item.id}
                    className="bg-surface rounded-[20px] border border-line p-3.5 sm:p-4"
                  >
                    <div className="flex gap-4 items-start">
                      {/* Dish Thumbnail */}
                      <Link
                        href={`/products/${item.product.id}`}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-raised overflow-hidden shrink-0 relative block group"
                      >
                        {item.product.image ? (
                          <img
                            src={imageVariant(item.product.image, 'sm')}
                            loading="lazy"
                            decoding="async"
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <CoverImage alt={item.product.name} label={item.product.name} size="sm" className="w-full h-full" />
                        )}
                        <span
                          className={`absolute bottom-1.5 start-1.5 px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 ${
                            isFrozenItem(item) ? 'bg-frozen-soft text-frozen-ink' : 'bg-surface/95 text-ink'
                          }`}
                        >
                          {isFrozenItem(item) ? (
                            <>
                              <Snowflake className="w-2.5 h-2.5" />
                              <span>{t('frozen')}</span>
                            </>
                          ) : (
                            <>
                              <Flame className="w-2.5 h-2.5" />
                              <span>{t('fresh')}</span>
                            </>
                          )}
                        </span>
                      </Link>

                      {/* Dish Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <Link href={`/products/${item.product.id}`}>
                              <h3 className="text-[15px] sm:text-base font-extrabold text-ink hover:underline leading-snug">
                                {item.product.name}
                              </h3>
                            </Link>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-11 h-11 rounded-xl text-muted hover:text-red-600 hover:bg-raised flex items-center justify-center transition-colors shrink-0"
                            title={t('removeDish')}
                            aria-label={t('removeDish')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {promotionLabel && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent text-on-accent text-[11px] font-extrabold mt-1.5">
                            <Tag className="w-2.5 h-2.5" />
                            <span>{promotionLabel}</span>
                          </span>
                        )}

                        {/* Quantity and Price Row */}
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="flex items-center h-11 rounded-xl border border-line">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-11 h-11 rounded-s-xl text-ink font-extrabold hover:bg-raised flex items-center justify-center text-lg transition-colors"
                              title={t('decrease')}
                              aria-label={t('decrease')}
                            >
                              −
                            </button>
                            <span className="min-w-6 text-center text-sm font-extrabold text-ink" aria-live="polite">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                              className="w-11 h-11 rounded-e-xl text-brand-ink font-extrabold hover:bg-raised flex items-center justify-center text-lg transition-colors"
                              title={t('increase')}
                              aria-label={t('increase')}
                            >
                              +
                            </button>
                          </div>

                          <div className="text-end">
                            <span className="text-base font-extrabold text-ink block">
                              {formatPrice(lineTotal)}
                            </span>
                            {originalPrice > unitPrice && (
                              <span className="text-[11px] text-muted line-through">
                                {formatPrice(originalPrice * item.quantity)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── RIGHT: ORDER SUMMARY ── */}
          <div className="lg:col-span-1 sticky top-[calc(5rem+var(--safe-top))]">
            <div className="bg-surface rounded-[24px] border border-line p-5 sm:p-6 space-y-4">
              <h3 className="text-base font-extrabold text-ink pb-3 border-b border-line flex items-center justify-between">
                <span>{t('orderSummary')}</span>
                <span className="text-xs font-semibold text-muted">
                  {t(trayCount === 1 ? 'itemsOne' : 'itemsMany', { count: trayCount })}
                </span>
              </h3>

              {/* Cost Rows */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-muted font-medium">
                  <span>{t('dishesSubtotal')}</span>
                  <bdi dir="ltr" className="font-bold text-ink">{formatPrice(discountedSubtotal + promotionSavings)}</bdi>
                </div>

                {promotionSavings > 0 && (
                  <div className="flex justify-between text-brand-soft-ink font-semibold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{t('promotionsSavings')}</span>
                    </span>
                    <bdi dir="ltr">-{formatPrice(promotionSavings)}</bdi>
                  </div>
                )}

                <div className={`flex justify-between text-muted font-medium transition-opacity ${estimatePending ? 'opacity-60' : ''}`}>
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-muted" />
                    <span>{areaQuote && selectedCommunity ? tk('trayDeliveryToArea', { area: selectedCommunity.name }) : t('estimatedDelivery')}</span>
                  </span>
                  {!deliveryEstimate && areaQuote ? (
                    areaQuoteKnown ? (
                      <span className="font-bold text-ink">
                        {areaQuote.fee === 0 ? t('freeCaps') : tk('trayAbout', { amount: formatPrice(areaQuote.fee) })}
                      </span>
                    ) : (
                      <span className="font-bold text-red-600">{t('deliveryNotAvailable')}</span>
                    )
                  ) : !deliveryEstimate ? (
                    selectedCommunity ? (
                      <span className="font-semibold text-muted">{t('deliveryAtCheckout')}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => useCommunityStore.getState().openSelectorModal()}
                        className="font-semibold text-brand-ink hover:underline"
                      >
                        {tk('chooseArea')}
                      </button>
                    )
                  ) : !deliveryKnown ? (
                    <span className="font-bold text-red-600">{t('deliveryNotAvailable')}</span>
                  ) : (
                    <span className={`font-bold ${isFreeDelivery ? 'text-brand-ink' : 'text-ink'}`}>
                      {isFreeDelivery ? t('freeCaps') : formatPrice(deliveryFee)}
                    </span>
                  )}
                </div>
                {deliveryEstimate && !deliveryKnown && deliveryEstimate.reason && (
                  <p className="text-xs text-red-600 -mt-1">{deliveryEstimate.reason}</p>
                )}
                {areaQuote && !areaQuoteKnown && areaQuote.reason && <p className="text-xs text-red-600 -mt-1">{areaQuote.reason}</p>}

                <div className="flex justify-between text-muted font-medium">
                  <span>{t('salesTax5')}</span>
                  <span className="font-bold text-ink">{formatPrice(gst)}</span>
                </div>
              </div>

              {/* Promo Code Box */}
              <div className="pt-2">
                <div className="p-3 rounded-2xl bg-raised">
                  <span className="text-xs font-bold text-muted block mb-1.5">
                    {t('voucherCode')}
                  </span>
                  {appliedPromoCode ? (
                    <div className="flex items-center justify-between bg-surface px-3 py-2 rounded-xl border border-brand/40">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-brand-soft-ink stroke-[3]" />
                        <span className="text-xs font-bold text-ink font-mono" data-ltr>{appliedPromoCode}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedPromoCode(null);
                          showToast(t('voucherRemoved'), 'info');
                        }}
                        className="text-xs font-bold text-red-600 hover:underline"
                      >
                        {tc('remove')}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={cartPromoInput}
                        onChange={(e) => setCartPromoInput(e.target.value.toUpperCase())}
                        placeholder={t('promoPlaceholder')}
                        dir="ltr"
                        aria-label={t('voucherCode')}
                        className="flex-1 min-w-0 h-11 px-3 text-sm border border-line rounded-xl focus:ring-2 focus:ring-brand/30 focus:border-brand focus:outline-none bg-surface text-ink font-mono uppercase placeholder:font-sans placeholder:normal-case"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!cartPromoInput.trim() || promoValidating}
                        onClick={handleApplyPromoInCart}
                        className="h-11 text-sm font-bold px-4 rounded-xl"
                      >
                        {promoValidating ? t('checking') : t('apply')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Row */}
              <div className="pt-3 border-t border-line">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-ink">
                    {deliveryKnown ? t('totalPayable') : areaQuoteKnown ? tk('trayEstimatedTotal') : t('totalBeforeDelivery')}
                  </span>
                  <span className="text-2xl font-extrabold text-ink">{formatPrice(displayTotal)}</span>
                </div>
                <span className="text-xs text-muted block mt-0.5">
                  {deliveryKnown ? t('includesAll') : areaQuoteKnown ? tk('trayAreaNote') : t('deliveryAddedAtCheckout')}
                </span>
              </div>

              {/* Checkout CTA Button */}
              {isAuthenticated ? (
                <Link
                  href="/checkout"
                  className="w-full h-14 rounded-2xl bg-brand hover:bg-brand-500 text-on-brand text-base font-extrabold transition-colors active:scale-98 flex items-center justify-center gap-2"
                >
                  <ShoppingBag className="w-5 h-5" aria-hidden />
                  <span>{t('proceedCheckout')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4 ms-1" aria-hidden />
                </Link>
              ) : (
                <Link
                  href={loginUrlFor('/checkout')}
                  className="w-full h-14 rounded-2xl bg-brand hover:bg-brand-500 text-on-brand text-base font-extrabold transition-colors active:scale-98 flex items-center justify-center gap-2"
                >
                  <span>{t('signInToComplete')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4 ms-1" aria-hidden />
                </Link>
              )}

              <Link
                href="/products"
                className="w-full h-11 rounded-xl hover:bg-raised text-ink text-sm font-bold border border-line-strong transition-colors flex items-center justify-center gap-1.5"
              >
                <ChevronLeft className="rtl:-scale-x-100 w-3.5 h-3.5" aria-hidden />
                <span>{t('continueExploring')}</span>
              </Link>

            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title={t('clearModalTitle')}
        message={t('clearModalMessageCart')}
        confirmText={t('clearModalConfirm')}
        cancelText={t('clearModalCancel')}
        variant="danger"
        loading={clearingCart}
        onConfirm={handleClearCart}
        onCancel={() => setShowClearModal(false)}
      />
    </DashboardLayout>
  );
}
