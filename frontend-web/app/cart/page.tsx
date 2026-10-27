'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingCart,
  Trash2,
  Store,
  Truck,
  Tag,
  ShoppingBag,
  Lock,
  Check,
  ImageOff,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  MapPin,
  X,
  ShieldCheck,
  Flame,
  Snowflake,
  ArrowRight,
} from 'lucide-react';
import { cartService, CartResponse } from '@/lib/services/cart.service';
import { formatPrice, imageVariant, orderTotals } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore, CartItem as LocalCartItem } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { apiClient, apiErrorMessage, errorMessage } from '@/lib/api-client';
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

        if (cartData?.items?.length) {
          setCart(cartData);
          setItems(
            cartData.items.map((i) => ({
              id: i.id,
              productId: i.product.id,
              productName: i.product.name,
              productImage: i.product.image,
              sellerId: i.seller.id,
              sellerName: i.seller.businessName,
              quantity: i.quantity,
              unitPrice: i.variant?.price ?? i.product.price,
              stockType: i.stockType,
              hubId: i.hubId,
              subtotal: i.subtotal,
            }))
          );
        } else if (localStoreItems.length > 0) {
          // One-time sync of guest items to authenticated cart
          for (const item of localStoreItems) {
            try {
              await cartService.addToCart({
                productId: item.productId,
                quantity: item.quantity,
                stockType: item.stockType || 'direct',
              });
            } catch (err) {
              console.warn('Syncing guest cart item to server:', errorMessage(err, ''));
            }
          }
          const fresh = await cartService.getCart();
          if (fresh.data?.items?.length) {
            setCart(fresh.data);
            setItems(
              fresh.data.items.map((i) => ({
                id: i.id,
                productId: i.product.id,
                productName: i.product.name,
                productImage: i.product.image,
                sellerId: i.seller.id,
                sellerName: i.seller.businessName,
                quantity: i.quantity,
                unitPrice: i.variant?.price ?? i.product.price,
                stockType: i.stockType,
                hubId: i.hubId,
                subtotal: i.subtotal,
              }))
            );
          } else {
            setCart(null);
          }
        } else {
          setCart(null);
        }

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
  const deliveryFee = deliveryKnown && !deliveryEstimate.isFree ? deliveryEstimate.deliveryFee : 0;
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
        subtitle={t('emptySubtitle')}
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="max-w-2xl mx-auto my-6">
          <div className="rounded-[24px] bg-surface border border-line p-8 sm:p-12 text-center">

            {/* Tray Icon */}
            <div className="relative inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-brand-soft mb-5">
              <ShoppingBag className="w-10 h-10 text-brand-soft-ink" />
              <span className="absolute -bottom-1.5 -end-1.5 px-2 py-0.5 rounded-full bg-accent text-on-accent text-[11px] font-extrabold">
                {t('zeroItems')}
              </span>
            </div>

            <h2 className="text-2xl sm:text-[28px] font-extrabold text-ink tracking-tight mb-2">
              {t('emptyTitle')}
            </h2>
            <p className="text-sm text-muted max-w-md mx-auto leading-relaxed mb-6">
              {t('emptyText')}
            </p>

            {/* Quick Cuisine Shortcut Pills */}
            <div className="mb-8">
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider block mb-2.5">
                {t('popularNearby')}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto">
                <Link
                  href="/products?category=biryani"
                  className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors shadow-2xs"
                >
                  🍛 {t('pill.biryani')}
                </Link>
                <Link
                  href="/products?category=paratha"
                  className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors shadow-2xs"
                >
                  🫓 {t('pill.paratha')}
                </Link>
                <Link
                  href="/products?productType=frozen"
                  className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs font-semibold text-ink hover:border-frozen-ink hover:text-frozen-ink transition-colors shadow-2xs"
                >
                  ❄️ {t('pill.frozen')}
                </Link>
                <Link
                  href="/products?category=bbq"
                  className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs font-semibold text-ink hover:border-brand hover:text-brand-ink transition-colors shadow-2xs"
                >
                  🔥 {t('pill.kebab')}
                </Link>
                <Link
                  href="/products?category=desserts"
                  className="px-3 py-1.5 rounded-xl bg-surface border border-line text-xs font-semibold text-ink hover:border-accent hover:text-accent-soft-ink transition-colors shadow-2xs"
                >
                  🍯 {t('pill.kheer')}
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

  return (
    <DashboardLayout
      title={t('cartTitleFull')}
      subtitle={t(cart.items.length > 1 ? 'cartSubtitleMany' : 'cartSubtitleOne', { count: cart.items.reduce((s, i) => s + i.quantity, 0) })}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="space-y-6 pb-12">
        {/* Single Kitchen Context Banner */}
        {activeSeller && (
          <div className="bg-surface rounded-[20px] border border-line p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
                <ChefHat className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-ink text-base">
                    {activeSeller.businessName}
                  </h3>
                  {activeSeller.community?.name && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-raised text-ink">
                      <MapPin className="w-3 h-3 text-brand-ink" />
                      <span>{activeSeller.community.name}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-brand-soft text-brand-soft-ink">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{t('singleKitchenOrder')}</span>
                  </span>
                </div>
                <p className="text-[13px] text-muted mt-1">
                  {t('singleKitchenText')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Link
                href={`/kitchens/${activeSeller.id}`}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl border border-line-strong hover:bg-raised text-sm font-bold text-brand-ink transition-colors"
              >
                <span>{t('addMoreDishes')}</span>
                <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
              </Link>
            </div>
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
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-ink leading-tight">{t('selectedDishes')}</h2>
                  <span className="text-xs text-muted">
                    {t(cart.items.length > 1 ? 'itemsInTrayMany' : 'itemsInTrayOne', { count: cart.items.length })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="text-sm font-bold text-muted hover:text-red-600 h-10 px-3 rounded-xl hover:bg-raised transition-colors flex items-center gap-1.5 cursor-pointer"
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
                          <div className="w-full h-full flex items-center justify-center text-muted">
                            <ImageOff className="w-8 h-8" />
                          </div>
                        )}
                        <span
                          className={`absolute bottom-1.5 start-1.5 px-2 py-0.5 rounded-full text-[11px] font-extrabold flex items-center gap-1 ${
                            item.stockType === 'hub' ? 'bg-frozen-soft text-frozen-ink' : 'bg-surface/95 text-ink'
                          }`}
                        >
                          {item.stockType === 'hub' ? (
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
                            <p className="text-xs text-muted mt-0.5 flex items-center gap-1.5">
                              <Store className="w-3 h-3 text-muted shrink-0" />
                              <span className="truncate">{item.seller.businessName}</span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-9 h-9 rounded-xl text-muted hover:text-red-600 hover:bg-raised flex items-center justify-center transition-colors shrink-0"
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
                          <div className="flex items-center h-10 rounded-xl border border-line">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-10 h-10 rounded-s-xl text-ink font-extrabold hover:bg-raised flex items-center justify-center text-lg transition-colors"
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
                              className="w-10 h-10 rounded-e-xl text-brand-ink font-extrabold hover:bg-raised flex items-center justify-center text-lg transition-colors"
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
                  {t(cart.items.length > 1 ? 'itemsMany' : 'itemsOne', { count: cart.items.length })}
                </span>
              </h3>

              {/* Cost Rows */}
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between text-muted font-medium">
                  <span>{t('dishesSubtotal')}</span>
                  <span className="font-bold text-ink">{formatPrice(discountedSubtotal)}</span>
                </div>

                {promotionSavings > 0 && (
                  <div className="flex justify-between text-brand-soft-ink font-semibold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{t('promotionsSavings')}</span>
                    </span>
                    <span>-{formatPrice(promotionSavings)}</span>
                  </div>
                )}

                <div className="flex justify-between text-muted font-medium">
                  <span className="flex items-center gap-1.5">
                    <Snowflake className="w-3.5 h-3.5 text-frozen-ink" />
                    <span>{t('insulatedPack')}</span>
                  </span>
                  <span className="text-brand-ink font-bold text-xs">{tc('free')}</span>
                </div>

                <div className={`flex justify-between text-muted font-medium transition-opacity ${estimatePending ? 'opacity-60' : ''}`}>
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-muted" />
                    <span>{t('estimatedDelivery')}</span>
                  </span>
                  {!deliveryEstimate ? (
                    <span className="font-semibold text-muted">{t('deliveryAtCheckout')}</span>
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

                <div className="flex justify-between text-muted font-medium">
                  <span>{t('salesTaxRegional')}</span>
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
                        className="flex-1 min-w-0 h-10 px-3 text-sm border border-line rounded-xl focus:ring-2 focus:ring-brand/30 focus:border-brand focus:outline-none bg-surface text-ink font-mono uppercase"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!cartPromoInput.trim() || promoValidating}
                        onClick={handleApplyPromoInCart}
                        className="h-10 text-sm font-extrabold bg-ink hover:bg-ink/90 text-page px-4 rounded-xl transition-colors"
                      >
                        {promoValidating ? '...' : t('apply')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Row */}
              <div className="pt-3 border-t border-line">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-ink">{deliveryKnown ? t('totalPayable') : t('totalBeforeDelivery')}</span>
                  <span className="text-2xl font-extrabold text-ink">{formatPrice(displayTotal)}</span>
                </div>
                <span className="text-xs text-muted block mt-0.5">
                  {deliveryKnown ? t('includesAll') : t('deliveryAddedAtCheckout')}
                </span>
              </div>

              {/* Checkout CTA Button */}
              {isAuthenticated ? (
                <Link href="/checkout" className="block pt-1">
                  <button
                    type="button"
                    className="w-full h-14 rounded-2xl bg-brand hover:bg-brand-500 text-on-brand text-base font-extrabold transition-colors active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    <span>{t('proceedCheckout')}</span>
                    <ArrowRight className="rtl:-scale-x-100 w-4 h-4 ms-1" />
                  </button>
                </Link>
              ) : (
                <Link href="/login?redirect=/checkout" className="block pt-1">
                  <button
                    type="button"
                    className="w-full h-14 rounded-2xl bg-brand hover:bg-brand-500 text-on-brand text-base font-extrabold transition-colors active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t('signInToComplete')}</span>
                    <ArrowRight className="rtl:-scale-x-100 w-4 h-4 ms-1" />
                  </button>
                </Link>
              )}

              <Link href="/products" className="block">
                <button
                  type="button"
                  className="w-full h-11 rounded-xl hover:bg-raised text-ink text-sm font-bold border border-line-strong transition-colors flex items-center justify-center gap-1.5"
                >
                  <ChevronLeft className="rtl:-scale-x-100 w-3.5 h-3.5" />
                  <span>{t('continueExploring')}</span>
                </button>
              </Link>

              {/* Trust Badges */}
              <div className="pt-3 border-t border-line space-y-1.5 text-xs text-muted">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-soft-ink shrink-0" />
                  <span>{t('trustHalal')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-muted shrink-0" />
                  <span>{t('trustEncrypted')}</span>
                </div>
              </div>
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
