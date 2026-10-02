'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingCart,
  Trash2,
  Store,
  Zap,
  Package,
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
  Clock,
  AlertCircle,
} from 'lucide-react';
import { cartService, CartResponse } from '@/lib/services/cart.service';
import { formatPrice, calculateGst, imageVariant } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore, CartItem as LocalCartItem } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { addressService } from '@/lib/services/address.service';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

function getPromotionLabel(p: CatalogPromotion): string {
  if (p.type === 'percentage' && p.discountValue > 0) return `${p.discountValue}% off`;
  if (p.type === 'fixed' && p.discountValue > 0) return `${formatPrice(p.discountValue)} off`;
  return p.name || 'Deal';
}

function getStackedDiscountedPrice(originalPrice: number, promos: CatalogPromotion[]): number {
  if (!promos?.length) return originalPrice;
  const sorted = [...promos].sort((a, b) =>
    a.type === 'percentage' && b.type === 'fixed' ? -1 : a.type === 'fixed' && b.type === 'percentage' ? 1 : 0
  );
  const result = sorted.reduce((price, p) => {
    if (p.type === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.type === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, originalPrice);
  return Math.round(result);
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
      deliveryFee: 0,
      discount: 0,
      total: subtotal,
      totalItems,
      totalSellers: 1,
    },
    activeSeller: firstSeller ? { id: firstSeller.id, businessName: firstSeller.businessName } : null,
  };
}

export default function CartPage() {
  const router = useRouter();
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
  const [deliveryEstimate, setDeliveryEstimate] = useState<{
    deliveryFee: number;
    isFree: boolean;
    reason: string | null;
  } | null>(null);
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
          showToast(`Promo "${res.data.data.code}" applied! You save ${formatPrice(res.data.data.discountAmount)}`, 'success');
        }
      } else {
        setAppliedPromoCode(code);
        setCartPromoInput('');
        showToast(`Promo "${code}" applied to tray! It will be verified at checkout.`, 'success');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || 'Invalid or expired code';
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

  useEffect(() => {
    if (!cart?.items?.length) {
      setDeliveryEstimate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const addrRes = await addressService.getAddresses();
        const defaultAddr = addrRes.data?.find((a) => a.isDefault) || addrRes.data?.[0];
        if (cancelled || !defaultAddr) {
          if (!defaultAddr) setDeliveryEstimate(null);
          return;
        }
        const feeRes = await cartService.getDeliveryFeeEstimate(defaultAddr.id);
        if (!cancelled) setDeliveryEstimate(feeRes.data);
      } catch {
        if (!cancelled) setDeliveryEstimate(null);
      }
    })();
    return () => { cancelled = true; };
  }, [cart?.items?.length]);

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
            total: subtotal + (prev.summary.deliveryFee || 0) - (prev.summary.discount || 0),
            totalItems: nextItems.reduce((acc, it) => acc + it.quantity, 0),
          },
        };
      });
      useCartStore.getState().updateItem(itemId, quantity);

      const token = apiClient.getAccessToken();
      if (token || isAuthenticated) {
        await cartService.updateCartItem(itemId, quantity);
      }
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || 'Could not update quantity', 'error');
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
            total: subtotal + (prev.summary.deliveryFee || 0) - (prev.summary.discount || 0),
            totalItems: nextItems.reduce((acc, it) => acc + it.quantity, 0),
          },
        };
      });
      useCartStore.getState().removeItem(itemId);

      const token = apiClient.getAccessToken();
      if (token || isAuthenticated) {
        await cartService.removeCartItem(itemId);
      }
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || 'Failed to remove item', 'error');
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
      showToast('Tray cleared', 'info');
    } catch (error: any) {
      showToast(error?.response?.data?.error?.message || 'Failed to clear tray', 'error');
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
  const deliveryFee = deliveryEstimate ? deliveryEstimate.deliveryFee : (discountedSubtotal >= 800 ? 0 : 80);
  const isFreeDelivery = deliveryEstimate ? deliveryEstimate.isFree : discountedSubtotal >= 800;
  const gst = calculateGst(Math.max(0, discountedSubtotal - (cart?.summary.discount || 0)));
  const displayTotal = discountedSubtotal + (isFreeDelivery ? 0 : deliveryFee) - (cart?.summary.discount || 0) + gst;

  // Free delivery threshold progress (target Rs 800)
  const freeDeliveryThreshold = 800;
  const freeDeliveryProgress = Math.min(100, Math.round((discountedSubtotal / freeDeliveryThreshold) * 100));
  const freeDeliveryRemaining = Math.max(0, freeDeliveryThreshold - discountedSubtotal);

  if (loading) {
    return (
      <DashboardLayout
        title="My Tray"
        subtitle="Reviewing delicious home-prepared meals"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center p-8 bg-white rounded-3xl border border-slate-200/80 shadow-xs max-w-sm">
            <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-900">Loading your food tray...</p>
            <p className="text-xs text-slate-500 mt-1">Retrieving freshly selected dishes from kitchen</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ── EMPTY STATE ──
  if (!hasItems) {
    return (
      <DashboardLayout
        title="My Tray"
        subtitle="Your dining cart is currently empty"
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
              <span className="absolute -bottom-1.5 -right-1.5 px-2 py-0.5 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider shadow-xs">
                0 Items
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-slate-950 tracking-tight mb-2">
              Your Food Tray is Empty
            </h2>
            <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed mb-6">
              Explore authentic certified home cooks, generational family recipes &amp; -18°C sub-zero frozen provisions in your community.
            </p>

            {/* Quick Cuisine Shortcut Pills */}
            <div className="mb-8">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                Popular in your community
              </span>
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-lg mx-auto">
                <Link
                  href="/products?category=biryani"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors shadow-2xs"
                >
                  🍛 Dum Biryani
                </Link>
                <Link
                  href="/products?category=paratha"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors shadow-2xs"
                >
                  🫓 Hand-Rolled Parathas
                </Link>
                <Link
                  href="/products?productType=frozen"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-cyan-500 hover:text-cyan-600 transition-colors shadow-2xs"
                >
                  ❄️ Frozen Packs
                </Link>
                <Link
                  href="/products?category=bbq"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-[#FF5500] hover:text-[#FF5500] transition-colors shadow-2xs"
                >
                  🔥 Smoky Seekh Kebabs
                </Link>
                <Link
                  href="/products?category=desserts"
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-amber-500 hover:text-amber-600 transition-colors shadow-2xs"
                >
                  🍯 Matka Kheer
                </Link>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/products" className="w-full sm:w-auto">
                <span className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-2xl bg-gradient-to-r from-[#FF5500] to-[#FF3300] hover:from-[#e04400] hover:to-[#d02800] text-white text-sm font-bold shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer">
                  <Sparkles className="w-4 h-4 text-amber-200" />
                  <span>Discover Dishes &amp; Menus</span>
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
              <Link href="/kitchens" className="w-full sm:w-auto">
                <span className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 text-slate-700 text-sm font-bold shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer">
                  <ChefHat className="w-4 h-4 text-slate-400" />
                  <span>Browse Home Kitchens</span>
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
      title="My Dining Tray"
      subtitle={`${cart.items.reduce((s, i) => s + i.quantity, 0)} freshly prepared dish${cart.items.length > 1 ? 'es' : ''} in your tray`}
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
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white text-slate-700 border border-slate-200 shadow-2xs">
                      <MapPin className="w-3 h-3 text-[#FF5500]" />
                      <span>{(activeSeller as any).community.name}</span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Single-Kitchen Order</span>
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Freshly cooked in small domestic batches for optimum hygiene and authentic flavor.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <Link
                href={`/kitchens/${activeSeller.id}`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-slate-200 hover:border-orange-300 text-xs font-bold text-[#FF5500] shadow-2xs hover:shadow-xs transition-all"
              >
                <span>Add More Dishes</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Free Delivery Unlocker Progress Bar */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between gap-3 text-xs mb-2">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-[#FF5500]" />
              {isFreeDelivery ? (
                <span className="text-emerald-700 font-extrabold">🎉 You unlocked FREE Delivery!</span>
              ) : (
                <span>
                  Add <strong className="text-slate-950 font-black">{formatPrice(freeDeliveryRemaining)}</strong> more to unlock <span className="text-[#FF5500] font-bold">FREE Delivery</span>
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
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">Selected Dishes</h2>
                  <span className="text-[11px] text-slate-400">
                    {cart.items.length} item{cart.items.length > 1 ? 's' : ''} in tray
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowClearModal(true)}
                className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Tray</span>
              </button>
            </div>

            {/* Dish Item Cards */}
            <div className="space-y-3">
              {cart.items.map((item) => {
                const promos = promotionsByProductId[item.product.id] || [];
                const originalPrice = item.variant?.price ?? item.product.price;
                const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(originalPrice, promos) : originalPrice;
                const lineTotal = unitPrice * item.quantity;
                const promotionLabel = promos.length > 0 ? promos.map(getPromotionLabel).join(' + ') : null;
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
                          className={`absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold text-white shadow-xs flex items-center gap-1 ${
                            item.stockType === 'hub' ? 'bg-cyan-600' : 'bg-[#FF5500]'
                          }`}
                        >
                          {item.stockType === 'hub' ? (
                            <>
                              <Snowflake className="w-2.5 h-2.5" />
                              <span>Frozen</span>
                            </>
                          ) : (
                            <>
                              <Flame className="w-2.5 h-2.5" />
                              <span>Fresh</span>
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
                            title="Remove dish"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {promotionLabel && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold mt-1.5">
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
                              title="Decrease"
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
                              title="Increase"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-right">
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
          <div className="lg:col-span-1 sticky top-20">
            <div className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-5 sm:p-6 space-y-4">
              <h3 className="text-base font-extrabold text-slate-950 pb-3 border-b border-slate-100 flex items-center justify-between">
                <span>Order Summary</span>
                <span className="text-xs font-semibold text-slate-400">
                  {cart.items.length} item{cart.items.length > 1 ? 's' : ''}
                </span>
              </h3>

              {/* Cost Rows */}
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Dishes Subtotal</span>
                  <span className="font-bold text-slate-900">{formatPrice(discountedSubtotal)}</span>
                </div>

                {promotionSavings > 0 && (
                  <div className="flex justify-between text-emerald-600 font-semibold">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" />
                      <span>Promotions Savings</span>
                    </span>
                    <span>-{formatPrice(promotionSavings)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Snowflake className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Sub-Zero Insulated Pack</span>
                  </span>
                  <span className="text-emerald-700 font-bold uppercase text-[10px]">Free</span>
                </div>

                <div className="flex justify-between text-slate-600 font-medium">
                  <span className="flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Estimated Delivery</span>
                  </span>
                  <span className={`font-bold ${isFreeDelivery ? 'text-emerald-600' : 'text-slate-900'}`}>
                    {isFreeDelivery ? 'FREE' : formatPrice(deliveryFee)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-600 font-medium">
                  <span>Sindh/Punjab Sales Tax (5% GST)</span>
                  <span className="font-bold text-slate-900">{formatPrice(gst)}</span>
                </div>
              </div>

              {/* Promo Code Box */}
              <div className="pt-2">
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                    Voucher or Coupon Code
                  </span>
                  {appliedPromoCode ? (
                    <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-emerald-300">
                      <div className="flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                        <span className="text-xs font-bold text-slate-900 font-mono">{appliedPromoCode}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAppliedPromoCode(null);
                          showToast('Voucher removed', 'info');
                        }}
                        className="text-xs font-bold text-rose-500 hover:text-rose-700"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={cartPromoInput}
                        onChange={(e) => setCartPromoInput(e.target.value.toUpperCase())}
                        placeholder="e.g. NURAY50"
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-1 focus:ring-orange-500 focus:outline-none bg-white font-mono uppercase"
                      />
                      <Button
                        type="button"
                        size="sm"
                        disabled={!cartPromoInput.trim() || promoValidating}
                        onClick={handleApplyPromoInCart}
                        className="text-xs font-bold bg-slate-900 hover:bg-[#FF5500] text-white px-3 rounded-xl transition-colors"
                      >
                        {promoValidating ? '...' : 'Apply'}
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Total Row */}
              <div className="pt-3 border-t border-slate-100">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-bold text-slate-900">Total Payable</span>
                  <span className="text-2xl font-black text-slate-950">{formatPrice(displayTotal)}</span>
                </div>
                <span className="text-[10px] text-slate-400 block mt-0.5">
                  Includes all food prices, packaging &amp; local sales tax
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
                    <span>Proceed to Checkout</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </Link>
              ) : (
                <Link href="/login?redirect=/checkout" className="block pt-1">
                  <button
                    type="button"
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#FF5500] to-[#FF3300] hover:from-[#e04400] hover:to-[#d02800] text-white text-base font-black shadow-md hover:shadow-lg transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Sign In to Complete Order</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </button>
                </Link>
              )}

              <Link href="/products" className="block">
                <button
                  type="button"
                  className="w-full py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Continue Exploring Menus</span>
                </button>
              </Link>

              {/* Trust Badges */}
              <div className="pt-3 border-t border-slate-100 space-y-1.5 text-[11px] text-slate-500 font-medium">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>100% Halal &amp; Hygiene Verified Domestic Kitchen</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                  <span>Encrypted Bank &amp; Mobile Wallet Checkout</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title="Clear Your Dining Tray?"
        message="Are you sure you want to remove all dishes from your tray? This will empty your dining tray."
        confirmText="Yes, Clear Tray"
        cancelText="Keep Dishes"
        variant="danger"
        loading={clearingCart}
        onConfirm={handleClearCart}
        onCancel={() => setShowClearModal(false)}
      />
    </DashboardLayout>
  );
}
