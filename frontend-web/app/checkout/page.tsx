'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  MapPin,
  Clock,
  Banknote,
  Building2,
  Smartphone,
  Check,
  Copy,
  ArrowRight,
  ShieldCheck,
  Tag,
  ShoppingBag,
  Plus,
  Minus,
  Store,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { cartService, CartResponse } from '@/lib/services/cart.service';
import { addressService, Address } from '@/lib/services/address.service';
import { orderService } from '@/lib/services/order.service';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { DatePicker } from '@/components/ui/DatePicker';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { apiClient } from '@/lib/api-client';

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

export default function CheckoutPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();

  const [cart, setCart] = useState<CartResponse | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'bank' | 'jazzcash' | 'easypaisa'>('cod');
  const [transactionRef, setTransactionRef] = useState<string>('');
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>('');
  const [deliverySlot, setDeliverySlot] = useState({ date: '', time: 'evening' as 'morning' | 'afternoon' | 'evening' });
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [loading, setLoading] = useState(true);
  const checkoutKeyRef = useRef<{ key: string; signature: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  const [deliveryEstimate, setDeliveryEstimate] = useState<{
    deliveryFee: number;
    isFree: boolean;
    reason: string | null;
  } | null>(null);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }
    loadData();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!selectedAddress || !cart?.items?.length) {
      setDeliveryEstimate(null);
      return;
    }
    cartService
      .getDeliveryFeeEstimate(selectedAddress)
      .then((res) => setDeliveryEstimate(res.data))
      .catch(() => setDeliveryEstimate(null));
  }, [selectedAddress, cart?.items?.length]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cartResponse, addressesResponse] = await Promise.all([
        cartService.getCart(),
        addressService.getAddresses(),
      ]);
      let cartData = cartResponse.data;
      const localStoreItems = useCartStore.getState().items || [];
      if ((!cartData?.items || cartData.items.length === 0) && localStoreItems.length > 0) {
        for (const item of localStoreItems) {
          try {
            await cartService.addToCart({
              productId: item.productId,
              quantity: item.quantity,
              stockType: item.stockType || 'direct',
            });
          } catch (err: any) {
            console.warn('Syncing local cart item to server in checkout:', err?.message);
          }
        }
        const fresh = await cartService.getCart();
        if (fresh.data?.items?.length) {
          cartData = fresh.data;
        }
      }
      setCart(cartData);
      setAddresses(addressesResponse.data || []);
      const defaultAddress = addressesResponse.data?.find((addr) => addr.isDefault) || addressesResponse.data?.[0];
      if (defaultAddress) {
        setSelectedAddress(defaultAddress.id);
      }
      if (cartData?.items?.length) {
        const productIds = cartData.items.map((i) => i.product.id).filter(Boolean);
        if (productIds.length) {
          try {
            const promRes = await apiClient.get<{ success: boolean; data: Record<string, CatalogPromotion[]> }>(
              `/promotions/catalog?productIds=${encodeURIComponent(productIds.join(','))}`
            );
            if (promRes.data?.success && promRes.data?.data) {
              setPromotionsByProductId(promRes.data.data);
            }
          } catch {
            setPromotionsByProductId({});
          }
        }

        // Auto-validate promo code pre-selected from dashboard or tray
        const storedPromo = useCartStore.getState().appliedPromoCode;
        if (storedPromo && !appliedPromo) {
          setPromoCode(storedPromo);
          const discountedSub = cartData.items.reduce((s, it) => {
            const base = it.variant?.price ?? it.product.price;
            return s + base * it.quantity;
          }, 0);
          apiClient
            .post<{ success: boolean; data: { code: string; discountAmount: number } }>(
              '/promotions/validate',
              { code: storedPromo.trim(), cartTotal: discountedSub }
            )
            .then((res) => {
              if (res.data?.success && res.data?.data) {
                setAppliedPromo({
                  code: res.data.data.code,
                  discountAmount: res.data.data.discountAmount,
                });
                showToast(
                  `Promo "${res.data.data.code}" auto-applied! You save ${formatPrice(res.data.data.discountAmount)}`,
                  'success'
                );
              }
            })
            .catch(() => {
              // Ignore if min order not met
            });
        }
      }
    } catch (error) {
      console.error('Failed to load checkout data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(label);
      showToast(`${label} copied to clipboard`, 'success');
      setTimeout(() => setCopiedField(null), 2500);
    }
  };

  const handleClearCart = async () => {
    setClearingCart(true);
    try {
      const token = apiClient.getAccessToken();
      if (token || isAuthenticated) {
        await cartService.clearCart();
      }
      useCartStore.getState().clearCart();
      useCartStore.getState().setAppliedPromoCode(null);
      setCart(null);
      showToast('Your tray has been cleared', 'info');
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Failed to clear tray', 'error');
    } finally {
      setClearingCart(false);
      setShowClearModal(false);
    }
  };

  const handleUpdateItemQuantity = async (itemId: string, newQty: number) => {
    if (updatingItemId) return;
    setUpdatingItemId(itemId);

    if (newQty <= 0) {
      try {
        await cartService.removeCartItem(itemId);
        useCartStore.getState().removeItem(itemId);
        const fresh = await cartService.getCart();
        setCart(fresh.data);
        showToast('Item removed from tray', 'info');
      } catch (err: any) {
        showToast(err?.response?.data?.error?.message || 'Failed to remove item', 'error');
      } finally {
        setUpdatingItemId(null);
      }
      return;
    }

    try {
      // Optimistically update
      setCart((prev) => {
        if (!prev) return null;
        const nextItems = prev.items.map((it) => {
          if (it.id === itemId || it.product.id === itemId) {
            const uPrice = it.variant?.price ?? it.product.price;
            return { ...it, quantity: newQty, subtotal: uPrice * newQty };
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
      useCartStore.getState().updateItem(itemId, newQty);

      await cartService.updateCartItem(itemId, newQty);
    } catch (err: any) {
      showToast(err?.response?.data?.error?.message || 'Could not update portion quantity', 'error');
      const fresh = await cartService.getCart();
      if (fresh.data) setCart(fresh.data);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedAddress) {
      showToast('Please select a delivery address', 'warning');
      return;
    }

    if (!cart?.items?.length) {
      showToast('Your tray is empty. Add food items before checkout.', 'warning');
      return;
    }

    setProcessing(true);
    try {
      const orderItems = cart.items.map((item) => ({
        productId: item.product.id,
        variantId: item.variant?.id,
        quantity: item.quantity,
        stockType: item.stockType || 'direct',
        hubId: item.hubId ?? undefined,
      }));

      const finalInstructions = [
        deliveryInstructions.trim(),
        transactionRef.trim() ? `Payment Reference/TID: ${transactionRef.trim()}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      const orderData = {
        items: orderItems,
        deliveryType: 'home_delivery' as const,
        deliveryAddressId: selectedAddress,
        deliverySlotDate: deliverySlot.date || undefined,
        deliverySlotTime: deliverySlot.time,
        paymentMethod: paymentMethod,
        promotionCode: appliedPromo?.code || promoCode?.trim() || undefined,
        deliveryInstructions: finalInstructions || undefined,
      };

      // One key per checkout attempt, reused if this same order is retried, so a
      // timeout followed by "Place order" again can never create two orders.
      const signature = JSON.stringify(orderData);
      if (!checkoutKeyRef.current || checkoutKeyRef.current.signature !== signature) {
        checkoutKeyRef.current = {
          key: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          signature,
        };
      }
      const response = await orderService.createOrder(orderData, checkoutKeyRef.current.key);
      checkoutKeyRef.current = null;

      // Clear cart. The order already exists at this point, so a failure here
      // must not surface as "failed to place order" (the customer would retry
      // and be charged twice) — the server cart is stale-but-harmless.
      try {
        await cartService.clearCart();
      } catch (clearErr) {
        console.warn('Order placed but the server cart could not be cleared:', clearErr);
      }
      useCartStore.getState().clearCart();
      useCartStore.getState().setAppliedPromoCode(null);

      const orderId = response.data?.order?.id;
      if (!orderId) {
        showToast('Order created but no order ID returned. Please check your orders.', 'error');
        return;
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('lastPlacedOrderId', orderId);
      }

      showToast('Order placed successfully!', 'success');
      router.push(`/orders/${orderId}?placed=1`);
    } catch (error: any) {
      if (!error.response) {
        // No answer (timeout / connection lost): the order may or may not exist. Keep the
        // key so pressing "Place order" again returns the same order, never a duplicate.
        showToast("We couldn't confirm your order (connection problem). Press Place order again; you won't be charged twice.", 'error');
      } else {
        // The server refused it, so nothing was placed: a new attempt gets a new key.
        checkoutKeyRef.current = null;
        showToast(error.response?.data?.error?.message || 'Failed to place order. Please try again.', 'error');
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Checkout" subtitle="Complete your order" sidebarItems={sidebarItems} userType="customer">
        <div className="max-w-5xl mx-auto py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Preparing your order summary…</p>
        </div>
      </DashboardLayout>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <DashboardLayout title="Checkout" subtitle="Complete your order" sidebarItems={sidebarItems} userType="customer">
        <div className="max-w-md mx-auto my-12 bg-white rounded-3xl p-8 border border-slate-200/90 shadow-xs text-center">
          <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#FF5500]">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-1.5">Your Tray is Empty</h2>
          <p className="text-xs text-slate-500 mb-6">Select freshly made homemade portions from verified kitchens to proceed.</p>
          <Link href="/kitchens">
            <Button className="w-full bg-[#FF5500] hover:bg-[#e04400] text-white font-bold py-2.5 rounded-xl">
              Browse Home Kitchens
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Active seller details for direct payment display
  const activeSeller = cart.activeSeller || cart.items[0]?.seller;
  const sellerTitle = activeSeller?.businessName || 'Verified Home Kitchen';
  const sellerBankName = activeSeller?.bankName;
  const sellerAccountTitle = activeSeller?.bankAccountName || activeSeller?.businessName;
  const sellerAccountNumber = activeSeller?.bankAccountNumber;
  const sellerJazzCash = activeSeller?.jazzcashNumber;
  const sellerJazzCashTitle = activeSeller?.jazzcashAccountTitle || activeSeller?.businessName;
  const sellerEasyPaisa = activeSeller?.easypaisaNumber;
  const sellerEasyPaisaTitle = activeSeller?.easypaisaAccountTitle || activeSeller?.businessName;

  // Subtotals with promotions
  const discountedSubtotal = cart.items.reduce((sum, item) => {
    const base = item.variant?.price ?? item.product.price;
    const promos = promotionsByProductId[item.product.id] || [];
    const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(base, promos) : base;
    return sum + unitPrice * item.quantity;
  }, 0);
  const promotionSavings = Math.max(0, cart.summary.subtotal - discountedSubtotal);
  const effectiveDeliveryFee = deliveryEstimate?.isFree ? 0 : (deliveryEstimate?.deliveryFee ?? 0);
  const gstAmount = Math.round(discountedSubtotal * 0.05);
  const promoDiscountAmount = appliedPromo?.discountAmount || 0;
  const totalPayable = Math.max(0, discountedSubtotal + effectiveDeliveryFee + gstAmount - promoDiscountAmount);

  return (
    <DashboardLayout title="Checkout" subtitle="Review portions & place order" sidebarItems={sidebarItems} userType="customer">
      <div className="max-w-6xl mx-auto pb-16">
        {/* Kitchen Origin Header Banner */}
        <div className="mb-6 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-[#FF5500]">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">{sellerTitle}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Single-Kitchen Batch
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Home-cooked by this kitchen. An order comes from one kitchen at a time.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Tray</span>
            </button>
            <Link
              href="/cart"
              className="text-xs font-bold text-[#FF5500] hover:text-[#e04400] inline-flex items-center gap-1"
            >
              <span>Edit Tray ({cart.summary.totalItems} portions)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Checkout Columns (7 of 12) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Delivery Address */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">1. Delivery Address</h2>
                    <p className="text-[11px] text-slate-500">Where should the rider deliver your meal?</p>
                  </div>
                </div>
                <Link
                  href="/profile/addresses"
                  className="text-xs font-semibold text-[#FF5500] hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Address</span>
                </Link>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-6 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-700 mb-1">No saved delivery address</p>
                  <p className="text-[11px] text-slate-400 mb-3">Add your home, office, or apartment address to proceed.</p>
                  <Link href="/profile/addresses">
                    <Button size="sm" className="bg-[#FF5500] hover:bg-[#e04400] text-xs font-bold text-white rounded-xl">
                      + Add Address
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {addresses.map((address) => {
                    const isSelected = selectedAddress === address.id;
                    return (
                      <label
                        key={address.id}
                        className={`flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-[#FF5500] bg-orange-50/20 shadow-2xs'
                            : 'border-slate-200/80 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <input
                          type="radio"
                          name="deliveryAddress"
                          value={address.id}
                          checked={isSelected}
                          onChange={(e) => setSelectedAddress(e.target.value)}
                          className="mt-1 accent-[#FF5500] w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-bold text-slate-900">{address.label || 'Home'}</span>
                            {address.isDefault && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed truncate">
                            {address.addressLine1}
                            {address.area ? `, ${address.area}` : ''}
                            {address.city ? `, ${address.city}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-[#FF5500] text-white flex items-center justify-center shrink-0 text-xs">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Schedule Delivery Slot */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">2. Delivery Time Slot</h2>
                  <p className="text-[11px] text-slate-500">Scheduled arrival window for fresh batch delivery</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Delivery Date</label>
                  <DatePicker
                    value={deliverySlot.date}
                    onChange={(date) => setDeliverySlot({ ...deliverySlot, date })}
                    min={new Date().toISOString().split('T')[0]}
                    placeholder="Today / Tomorrow"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">Time Window</label>
                  <select
                    value={deliverySlot.time}
                    onChange={(e) =>
                      setDeliverySlot({
                        ...deliverySlot,
                        time: e.target.value as 'morning' | 'afternoon' | 'evening',
                      })
                    }
                    className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#FF5500]"
                  >
                    <option value="morning">Morning (09:00 AM – 12:00 PM)</option>
                    <option value="afternoon">Afternoon (12:00 PM – 05:00 PM)</option>
                    <option value="evening">Evening (05:00 PM – 09:30 PM)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Rider Instructions (Optional)
                </label>
                <input
                  type="text"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder="e.g. Ring doorbell twice, leave with guard at House 14"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#FF5500]"
                />
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 tracking-tight">3. Payment Method</h2>
                  <p className="text-[11px] text-slate-500">Pay via Cash on Delivery or Direct Mobile/Bank Transfer</p>
                </div>
              </div>

              <div className="space-y-3">
                {/* Method 1: Cash on Delivery */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'cod'
                      ? 'border-[#FF5500] bg-orange-50/20 shadow-2xs'
                      : 'border-slate-200/80 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="accent-[#FF5500] w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">Cash on Delivery (COD)</span>
                        <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-amber-100 text-amber-800">
                          Recommended
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Pay exact cash to the rider at your doorstep</p>
                    </div>
                  </div>
                  {paymentMethod === 'cod' && (
                    <div className="mt-3 ml-7 pt-2.5 border-t border-slate-200/60 text-[11px] text-slate-600 flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Keep the exact amount ready, and check your order before you pay.</span>
                    </div>
                  )}
                </label>

                {/* Method 2: Bank Transfer / Raast (IBFT) */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'bank'
                      ? 'border-[#FF5500] bg-orange-50/20 shadow-2xs'
                      : 'border-slate-200/80 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="bank"
                      checked={paymentMethod === 'bank'}
                      onChange={() => setPaymentMethod('bank')}
                      className="accent-[#FF5500] w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">Bank Transfer / Raast (IBFT)</span>
                        <span className="px-2 py-0.2 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Direct to Chef
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500">Direct transfer to kitchen's bank account with zero fee</p>
                    </div>
                  </div>

                  {paymentMethod === 'bank' && (
                    <div className="mt-3.5 ml-7 pt-3.5 border-t border-slate-200/70 space-y-3">
                      {sellerAccountNumber ? (
                        <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2.5 shadow-sm">
                          {sellerBankName && (
                            <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                              <span className="text-slate-400 text-[11px]">Bank Name:</span>
                              <span className="font-bold text-slate-100">{sellerBankName}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                            <span className="text-slate-400 text-[11px]">Account Title:</span>
                            <span className="font-bold text-slate-100">{sellerAccountTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-slate-400 text-[10px] block">Account # / IBAN</span>
                              <span className="font-mono text-xs font-bold text-amber-400 tracking-wider">
                                {sellerAccountNumber}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCopy(sellerAccountNumber, 'IBAN / Account Number');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
                            >
                              {copiedField === 'IBAN / Account Number' ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                          This kitchen has not added direct bank account details yet. Please select Cash on Delivery or contact the chef.
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          Transaction ID / Ref # (Optional)
                        </label>
                        <input
                          type="text"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder="e.g. 12-digit IBFT Reference or Sender Name"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          You can also upload your receipt after clicking Place Order.
                        </p>
                      </div>
                    </div>
                  )}
                </label>

                {/* Method 3: JazzCash Direct Transfer */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'jazzcash'
                      ? 'border-[#FF5500] bg-orange-50/20 shadow-2xs'
                      : 'border-slate-200/80 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="jazzcash"
                      checked={paymentMethod === 'jazzcash'}
                      onChange={() => setPaymentMethod('jazzcash')}
                      className="accent-[#FF5500] w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-900">JazzCash Direct Transfer</span>
                      <p className="text-[11px] text-slate-500">Send money directly to chef's JazzCash mobile account</p>
                    </div>
                  </div>

                  {paymentMethod === 'jazzcash' && (
                    <div className="mt-3.5 ml-7 pt-3.5 border-t border-slate-200/70 space-y-3">
                      {sellerJazzCash ? (
                        <div className="bg-red-950 text-white rounded-2xl p-4 space-y-2 border border-red-900/60 shadow-sm">
                          <div className="flex items-center justify-between text-xs border-b border-red-900/80 pb-2">
                            <span className="text-red-300 text-[11px]">Chef Title:</span>
                            <span className="font-bold text-white">{sellerTitle}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-b border-red-900/80 pb-2">
                            <span className="text-red-300 text-[11px]">Account Title:</span>
                            <span className="font-bold text-white">{sellerJazzCashTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-red-300 text-[10px] block">JazzCash Mobile Number</span>
                              <span className="font-mono text-sm font-bold text-amber-300 tracking-wide">
                                {sellerJazzCash}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCopy(sellerJazzCash, 'JazzCash Number');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-red-900 hover:bg-red-800 text-white rounded-lg flex items-center gap-1.5 transition-colors border border-red-800 cursor-pointer"
                            >
                              {copiedField === 'JazzCash Number' ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                          This kitchen has not added a JazzCash number yet. Please select Cash on Delivery or Bank Transfer.
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          JazzCash TID / Sender Mobile (Optional)
                        </label>
                        <input
                          type="text"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder="e.g. TID 12345678"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                        />
                      </div>
                    </div>
                  )}
                </label>

                {/* Method 4: EasyPaisa Direct Transfer */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'easypaisa'
                      ? 'border-[#FF5500] bg-orange-50/20 shadow-2xs'
                      : 'border-slate-200/80 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="easypaisa"
                      checked={paymentMethod === 'easypaisa'}
                      onChange={() => setPaymentMethod('easypaisa')}
                      className="accent-[#FF5500] w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-bold text-slate-900">EasyPaisa Direct Transfer</span>
                      <p className="text-[11px] text-slate-500">Send money directly to chef's EasyPaisa mobile account</p>
                    </div>
                  </div>

                  {paymentMethod === 'easypaisa' && (
                    <div className="mt-3.5 ml-7 pt-3.5 border-t border-slate-200/70 space-y-3">
                      {sellerEasyPaisa ? (
                        <div className="bg-emerald-950 text-white rounded-2xl p-4 space-y-2 border border-emerald-900/60 shadow-sm">
                          <div className="flex items-center justify-between text-xs border-b border-emerald-900/80 pb-2">
                            <span className="text-emerald-300 text-[11px]">Chef Title:</span>
                            <span className="font-bold text-white">{sellerTitle}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-b border-emerald-900/80 pb-2">
                            <span className="text-emerald-300 text-[11px]">Account Title:</span>
                            <span className="font-bold text-white">{sellerEasyPaisaTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-emerald-300 text-[10px] block">EasyPaisa Mobile Number</span>
                              <span className="font-mono text-sm font-bold text-amber-300 tracking-wide">
                                {sellerEasyPaisa}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCopy(sellerEasyPaisa, 'EasyPaisa Number');
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg flex items-center gap-1.5 transition-colors border border-emerald-800 cursor-pointer"
                            >
                              {copiedField === 'EasyPaisa Number' ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-xs">
                          This kitchen has not added an EasyPaisa number yet. Please select Cash on Delivery or Bank Transfer.
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-semibold text-slate-700 block mb-1">
                          EasyPaisa TID / Sender Mobile (Optional)
                        </label>
                        <input
                          type="text"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder="e.g. TID 87654321"
                          className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-xl outline-none focus:ring-2 focus:ring-[#FF5500] bg-white"
                        />
                      </div>
                    </div>
                  )}
                </label>
              </div>
            </div>
          </div>

          {/* Right Column: Sticky Order Summary & Portions (5 of 12) */}
          <div className="lg:col-span-5">
            <div className="bg-white rounded-3xl p-5 sm:p-6 border border-slate-200/90 shadow-xs sticky top-20 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">Order Summary</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-slate-500">
                    {cart.summary.totalItems} {cart.summary.totalItems === 1 ? 'portion' : 'portions'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowClearModal(true)}
                    className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    title="Remove all dishes from tray"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear Tray</span>
                  </button>
                </div>
              </div>

              {/* Items List with Quantity Controls */}
              <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                {cart.items.map((item) => {
                  const base = item.variant?.price ?? item.product.price;
                  const promos = promotionsByProductId[item.product.id] || [];
                  const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(base, promos) : base;
                  const lineTotal = unitPrice * item.quantity;
                  const label = promos.length > 0 ? promos.map(getPromotionLabel).join(' + ') : null;

                  return (
                    <div key={item.id} className="p-3 rounded-2xl bg-slate-50/80 border border-slate-100 space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">{item.product.name}</p>
                          {item.variant && (
                            <p className="text-[10px] text-slate-500 truncate">{item.variant.name}</p>
                          )}
                          {label && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded mt-0.5">
                              <Tag className="w-2.5 h-2.5" />
                              {label}
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-slate-900">{formatPrice(lineTotal)}</span>
                          {promos.length > 0 && base > unitPrice && (
                            <p className="text-[10px] text-slate-400 line-through">
                              {formatPrice(base * item.quantity)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200/50">
                        <span className="text-[11px] text-slate-500 font-medium">
                          {formatPrice(unitPrice)} / piece
                        </span>
                        <div className="flex items-center gap-1.5 bg-white px-1.5 py-0.5 rounded-xl border border-slate-200 shadow-2xs">
                          <button
                            type="button"
                            disabled={updatingItemId === item.id}
                            onClick={() => handleUpdateItemQuantity(item.id, item.quantity - 1)}
                            className="w-5 h-5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold flex items-center justify-center text-xs transition-colors disabled:opacity-50"
                            title="Decrease portion"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center text-xs font-black text-slate-900">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={updatingItemId === item.id}
                            onClick={() => handleUpdateItemQuantity(item.id, item.quantity + 1)}
                            className="w-5 h-5 rounded-lg bg-[#FF5500] hover:bg-[#e04400] text-white font-bold flex items-center justify-center text-xs transition-colors disabled:opacity-50"
                            title="Increase portion"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Promo Code Box */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      if (appliedPromo) setAppliedPromo(null);
                    }}
                    placeholder="VOUCHER OR COUPON"
                    disabled={!!appliedPromo}
                    className="flex-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#FF5500] bg-slate-50"
                  />
                  {appliedPromo ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setAppliedPromo(null);
                        setPromoCode('');
                        useCartStore.getState().setAppliedPromoCode(null);
                        showToast('Promo code removed', 'info');
                      }}
                      className="text-xs font-bold text-red-600 rounded-xl px-3"
                    >
                      Remove
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      disabled={!promoCode.trim() || promoValidating}
                      onClick={async () => {
                        if (!promoCode.trim() || !cart) return;
                        setPromoValidating(true);
                        try {
                          const res = await apiClient.post<{
                            success: boolean;
                            data: { code: string; discountAmount: number };
                          }>('/promotions/validate', {
                            code: promoCode.trim(),
                            cartTotal: discountedSubtotal,
                          });
                          if (res.data?.success && res.data?.data) {
                            setAppliedPromo({
                              code: res.data.data.code,
                              discountAmount: res.data.data.discountAmount,
                            });
                            useCartStore.getState().setAppliedPromoCode(res.data.data.code);
                            showToast(`Voucher applied! -${formatPrice(res.data.data.discountAmount)}`, 'success');
                          }
                        } catch (err: any) {
                          showToast(err?.response?.data?.error?.message || 'Invalid or expired voucher', 'error');
                        } finally {
                          setPromoValidating(false);
                        }
                      }}
                      className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl px-4"
                    >
                      {promoValidating ? 'Checking…' : 'Apply'}
                    </Button>
                  )}
                </div>
                {appliedPromo && (
                  <p className="mt-1.5 text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>
                      Voucher <strong>{appliedPromo.code}</strong> applied (-{formatPrice(appliedPromo.discountAmount)})
                    </span>
                  </p>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Dishes Subtotal</span>
                  <span className="font-semibold text-slate-900">{formatPrice(discountedSubtotal)}</span>
                </div>

                {promotionSavings > 0 && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Menu Deals Savings</span>
                    <span>-{formatPrice(promotionSavings)}</span>
                  </div>
                )}

                {appliedPromo && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Voucher Discount</span>
                    <span>-{formatPrice(appliedPromo.discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between text-slate-600">
                  <span>Estimated Delivery</span>
                  <span>
                    {deliveryEstimate?.isFree || effectiveDeliveryFee === 0 ? (
                      <span className="font-bold text-emerald-600">FREE</span>
                    ) : (
                      <span className="font-semibold text-slate-900">{formatPrice(effectiveDeliveryFee)}</span>
                    )}
                  </span>
                </div>

                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Sales tax (5%)</span>
                  <span>{formatPrice(gstAmount)}</span>
                </div>

                <div className="pt-3 border-t border-slate-200/80 flex items-baseline justify-between">
                  <div>
                    <span className="text-sm font-black text-slate-900 block">Total Payable</span>
                    <span className="text-[10px] text-slate-400">Includes delivery and tax</span>
                  </div>
                  <span className="text-xl font-black text-[#FF5500]">{formatPrice(totalPayable)}</span>
                </div>
              </div>

              {/* Place Order CTA Button */}
              <Button
                type="button"
                disabled={processing || !selectedAddress}
                onClick={handleCreateOrder}
                className="w-full py-3.5 bg-[#FF5500] hover:bg-[#e04400] text-white font-black text-sm rounded-2xl shadow-md transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Placing Your Order…</span>
                  </>
                ) : (
                  <>
                    <span>Place Order · {formatPrice(totalPayable)}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-[11px] leading-relaxed text-slate-500">
                By placing this order you agree to the{' '}
                <Link href="/terms" target="_blank" className="font-semibold text-slate-700 underline hover:text-[#FF5500]">
                  Terms of Service
                </Link>{' '}
                and the{' '}
                <Link href="/refund-policy" target="_blank" className="font-semibold text-slate-700 underline hover:text-[#FF5500]">
                  Refund &amp; Cancellation Policy
                </Link>
                .
              </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title="Clear Your Dining Tray?"
        message="Are you sure you want to remove all dishes from your tray? This will empty your checkout summary."
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
