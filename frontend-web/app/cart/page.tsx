'use client';

import { useEffect, useState, useMemo } from 'react';
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
  Sparkles,
  ShieldCheck,
  Flame,
  Snowflake,
  ArrowRight,
} from 'lucide-react';
import { cartService, CartResponse } from '@/lib/services/cart.service';
import { formatPrice, imageVariant, orderTotals } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore, CartItem as LocalCartItem } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { DEFAULT_ADDRESS, useDeliveryEstimate } from '@/lib/hooks/use-delivery-estimate';
import { useT } from '@/lib/i18n';
import { getPromotionLabel, getStackedDiscountedPrice } from '@/lib/pricing';
import { commonMessages } from '@/lib/i18n/messages/common';
import { checkoutMessages, richText } from '@/lib/i18n/messages/checkout';

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
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const storeItems = useCartStore((s) => s.items);
  const { setItems, clearCart: clearCartStore, appliedPromoCode, setAppliedPromoCode } = useCartStore();
  const [cart, setCart] = useState<CartResponse | null>(() => {
    // Optimistically initialize cart if items already exist in local store
    if (typeof window !== 'undefined') {
      const existing = useCartStore.getState().items || [];
      if (existing.length > 0) return localItemsToCartResponse(existing);
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
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
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || t('invalidCode');
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

  useEffect(() => {
    loadCart();
  }, [isAuthenticated]);

  const loadCart = async () => {
    setLoading(true);
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
            } catch (err: any) {
              console.warn('Syncing guest cart item to server:', err?.message);
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
      }
    } finally {
      setLoading(false);
    }
  };

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
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || t('couldNotUpdateQty'), 'error');
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
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || t('failedRemoveItem'), 'error');
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
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || t('failedClearTray'), 'error');
    } finally {
      setClearingCart(false);
      setShowClearModal(false);
    }
  };

  // Calculations
  const hasItems = cart && cart.items && cart.items.length > 0;

  const discountedSubtotal = useMemo(() => {
    if (!hasItems) return 0;
    return cart.items.reduce((sum, item) => {
      const basePrice = item.variant?.price ?? item.product.price;
      const promos = promotionsByProductId[item.product.id] || [];
      const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(basePrice, promos) : basePrice;
      return sum + unitPrice * item.quantity;
    }, 0);
  }, [cart, promotionsByProductId, hasItems]);

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
          <div className="text-center p-8 bg-white rounded-3xl border border-slate-200/80 shadow-xs max-w-sm">
            <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900">{t('loadingTray')}</p>
            <p className="text-xs text-slate-500 mt-1">{t('loadingTrayHint')}</p>
          </div>
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
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-white to-slate-50/80 border border-slate-200/90 shadow-sm p-8 sm:p-12 text-center">
            {/* Background glowing halo */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 bg-gradient-to-tr from-orange-400/10 to-amber-300/15 rounded-full blur-3xl pointer-events-none" />

            {/* Tray Icon */}
            <div className="relative inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-tr from-amber-100 to-orange-100 border border-orange-200/80 shadow-inner mb-5">
              <ShoppingBag className="w-12 h-12 text-[#FF5500]" />
              <span className="absolute -bottom-1.5 -end-1.5 px-2 py-0.5 rounded-full bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider shadow-xs">
                {t('zeroItems')}
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight mb-2">
              {t('emptyTitle')}
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
              {t('emptyText')}
            </p>

            {/* Quick Cuisine Shortcut Pills */}
            <div className="mb-8">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                {t('popularNearby')}
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto">
                <Link
                  href="/products?category=biryani"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors shadow-2xs"
                >
                  🍛 {t('pill.biryani')}
                </Link>
                <Link
                  href="/products?category=paratha"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors shadow-2xs"
                >
                  🫓 {t('pill.paratha')}
                </Link>
                <Link
                  href="/products?productType=frozen"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-cyan-500 hover:text-cyan-600 transition-colors shadow-2xs"
                >
                  ❄️ {t('pill.frozen')}
                </Link>
                <Link
                  href="/products?category=bbq"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors shadow-2xs"
                >
                  🔥 {t('pill.kebab')}
                </Link>
                <Link
                  href="/products?category=desserts"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-colors shadow-2xs"
                >
                  🍯 {t('pill.kheer')}
                </Link>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/products" className="w-full sm:w-auto">
                <span className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF5500] to-[#FF3300] hover:from-[#e04400] hover:to-[#d02800] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer">
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>{t('discoverDishes')}</span>
                  <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
                </span>
              </Link>
              <Link href="/kitchens" className="w-full sm:w-auto">
                <span className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-bold shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer">
                  <ChefHat className="w-4 h-4 text-slate-400" />
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
          <div className="bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent rounded-3xl border border-orange-200 p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#FF5500] to-amber-500 text-white flex items-center justify-center font-bold text-lg shadow-xs shrink-0">
                <ChefHat className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-extrabold text-slate-950 text-base">
                    {activeSeller.businessName}
                  </h3>
                  {(activeSeller as any).community?.name && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                      <MapPin className="w-3 h-3 text-[#FF5500]" />
                      <span>{(activeSeller as any).community.name}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    <ShieldCheck className="w-3 h-3" />
                    <span>{t('singleKitchenOrder')}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {t('singleKitchenText')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Link
                href={`/kitchens/${activeSeller.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-orange-300 text-xs font-bold text-[#FF5500] shadow-2xs hover:shadow-xs transition-all"
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
            className={`bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs transition-opacity ${estimatePending ? 'opacity-60' : ''}`}
            aria-busy={estimatePending}
          >
            <div className="flex items-center justify-between gap-3 text-xs mb-2">
              <span className="font-bold text-slate-800 flex items-center gap-1.5">
                <Truck className="w-4 h-4 text-[#FF5500]" />
                {isFreeDelivery ? (
                  <span className="text-emerald-700 font-extrabold">{t('unlockedFree')}</span>
                ) : (
                  <span>
                    {richText(t('addMoreForFree'), {
                      amount: <strong className="text-slate-950 font-black">{formatPrice(freeDeliveryRemaining)}</strong>,
                      free: <span className="text-[#FF5500] font-bold">{t('freeDelivery')}</span>,
                    })}
                  </span>
                )}
              </span>
              <span className="font-extrabold text-slate-500">{freeDeliveryProgress}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isFreeDelivery
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                    : 'bg-gradient-to-r from-amber-400 to-[#FF5500]'
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
            <div className="bg-white rounded-2xl border border-slate-200/80 p-4 flex items-center justify-between shadow-2xs">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#FF5500] flex items-center justify-center">
                  <ShoppingCart className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">{t('selectedDishes')}</h2>
                  <span className="text-[11px] text-slate-400">
                    {t(cart.items.length > 1 ? 'itemsInTrayMany' : 'itemsInTrayOne', { count: cart.items.length })}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
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
                    className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all"
                  >
                    <div className="flex gap-4 items-start">
                      {/* Dish Thumbnail */}
                      <Link
                        href={`/products/${item.product.id}`}
                        className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-slate-100 overflow-hidden shrink-0 relative block group"
                      >
                        {item.product.image ? (
                          <img
                            src={imageVariant(item.product.image, 'sm')}
                            loading="lazy"
                            decoding="async"
                            alt={item.product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <ImageOff className="w-8 h-8" />
                          </div>
                        )}
                        <span
                          className={`absolute bottom-1.5 start-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold text-white shadow-xs flex items-center gap-1 ${
                            item.stockType === 'hub' ? 'bg-cyan-600' : 'bg-[#FF5500]'
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
                              <h3 className="text-sm sm:text-base font-bold text-slate-900 hover:text-[#FF5500] transition-colors leading-snug">
                                {item.product.name}
                              </h3>
                            </Link>
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                              <Store className="w-3 h-3 text-slate-400 shrink-0" />
                              <span className="truncate">{item.seller.businessName}</span>
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="w-7 h-7 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors shrink-0"
                            title={t('removeDish')}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {promotionLabel && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[11px] font-bold mt-1.5">
                            <Tag className="w-2.5 h-2.5" />
                            <span>{promotionLabel}</span>
                          </span>
                        )}

                        {/* Quantity and Price Row */}
                        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-1 bg-slate-100 px-1 py-0.5 rounded-xl border border-slate-200">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                              className="w-7 h-7 rounded-lg bg-white text-slate-800 font-bold hover:bg-slate-200 flex items-center justify-center text-xs shadow-2xs transition-colors"
                              title={t('decrease')}
                            >
                              −
                            </button>
                            <span className="w-8 text-center text-xs font-black text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                              className="w-7 h-7 rounded-lg bg-[#FF5500] text-white font-bold hover:bg-[#e04400] flex items-center justify-center text-xs shadow-2xs transition-colors"
                              title={t('increase')}
                            >
                              +
                            </button>
                          </div>

                          <div className="text-end">
                            <span className="text-base font-black text-slate-950 block">
                              {formatPrice(lineTotal)}
                            </span>
                            {originalPrice > unitPrice && (
                              <span className="text-[11px] text-slate-400 line-through">
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
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
              <h3 className="text-base font-extrabold text-slate-950 pb-3 border-b border-slate-100 flex items-center justify-between">
                <span>{t('orderSummary')}</span>
                <span className="text-xs font-semibold text-slate-400">
                  {t(cart.items.length > 1 ? 'itemsMany' : 'itemsOne', { count: cart.items.length })}
                </span>
              </h3>

              {/* Cost Rows */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>{t('dishesSubtotal')}</span>
                  <span className="font-bold text-slate-900">{formatPrice(discountedSubtotal)}</span>
                </div>

                {promotionSavings > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>{t('promotionsSavings')}</span>
                    </span>
                    <span>-{formatPrice(promotionSavings)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
                    <span>{t('insulatedPack')}</span>
                  </span>
                  <span className="text-emerald-700 font-bold uppercase text-[11px]">{tc('free')}</span>
                </div>

                <div className={`flex justify-between text-slate-600 font-medium transition-opacity ${estimatePending ? 'opacity-60' : ''}`}>
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t('estimatedDelivery')}</span>
                  </span>
                  {!deliveryEstimate ? (
                    <span className="font-semibold text-slate-500">{t('deliveryAtCheckout')}</span>
                  ) : !deliveryKnown ? (
                    <span className="font-bold text-rose-600">{t('deliveryNotAvailable')}</span>
                  ) : (
                    <span className={`font-bold ${isFreeDelivery ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {isFreeDelivery ? t('freeCaps') : formatPrice(deliveryFee)}
                    </span>
                  )}
                </div>
                {deliveryEstimate && !deliveryKnown && deliveryEstimate.reason && (
                  <p className="text-[11px] text-rose-600 -mt-1">{deliveryEstimate.reason}</p>
                )}

                <div className="flex justify-between text-slate-600 font-medium">
                  <span>{t('salesTaxRegional')}</span>
                  <span className="font-bold text-slate-900">{formatPrice(gst)}</span>
                </div>
              </div>

              {/* Promo Code Box */}
              <div className="pt-2">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                    {t('voucherCode')}
                  </span>
                  {appliedPromoCode ? (
                    <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-emerald-300">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                        <span className="text-xs font-bold text-slate-900 font-mono" data-ltr>{appliedPromoCode}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedPromoCode(null);
                          showToast(t('voucherRemoved'), 'info');
                        }}
                        className="text-xs font-bold text-rose-500 hover:text-rose-700"
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
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-1 focus:ring-orange-500 focus:outline-none bg-white font-mono uppercase"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!cartPromoInput.trim() || promoValidating}
                        onClick={handleApplyPromoInCart}
                        className="text-xs font-bold bg-slate-900 hover:bg-[#FF5500] text-white px-3 rounded-xl transition-colors"
                      >
                        {promoValidating ? '...' : t('apply')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Row */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-slate-900">{deliveryKnown ? t('totalPayable') : t('totalBeforeDelivery')}</span>
                  <span className="text-2xl font-black text-slate-950">{formatPrice(displayTotal)}</span>
                </div>
                <span className="text-[11px] text-slate-400 block mt-0.5">
                  {deliveryKnown ? t('includesAll') : t('deliveryAddedAtCheckout')}
                </span>
              </div>

              {/* Checkout CTA Button */}
              {isAuthenticated ? (
                <Link href="/checkout" className="block pt-1">
                  <button
                    type="button"
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF5500] to-[#FF3300] hover:from-[#e04400] hover:to-[#d02800] text-white text-base font-black shadow-md hover:shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <ShoppingBag className="w-5 h-5 text-white" />
                    <span>{t('proceedCheckout')}</span>
                    <ArrowRight className="rtl:-scale-x-100 w-4 h-4 ms-1" />
                  </button>
                </Link>
              ) : (
                <Link href="/login?redirect=/checkout" className="block pt-1">
                  <button
                    type="button"
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF5500] to-[#FF3300] hover:from-[#e04400] hover:to-[#d02800] text-white text-base font-black shadow-md hover:shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>{t('signInToComplete')}</span>
                    <ArrowRight className="rtl:-scale-x-100 w-4 h-4 ms-1" />
                  </button>
                </Link>
              )}

              <Link href="/products" className="block">
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ChevronLeft className="rtl:-scale-x-100 w-3.5 h-3.5" />
                  <span>{t('continueExploring')}</span>
                </button>
              </Link>

              {/* Trust Badges */}
              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500 font-medium">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{t('trustHalal')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
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
