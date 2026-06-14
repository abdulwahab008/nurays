'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Safepay JS popup API type
declare global {
  interface Window {
    safepay?: {
      Checkout: {
        render: (config: {
          env: string;
          payment: () => Promise<string>;
          onPaymentComplete: (data: any) => void;
          onClose?: () => void;
        }, container: string) => void;
      };
    };
  }
}
import Link from 'next/link';
import { cartService, CartResponse } from '@/lib/services/cart.service';
import { addressService, Address } from '@/lib/services/address.service';
import { orderService, CreateOrderRequest } from '@/lib/services/order.service';
import { formatPrice, GST_RATE } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { apiClient } from '@/lib/api-client';
import { Check } from 'lucide-react';

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

  /** Load Safepay checkout JS once */
  const safepayScriptRef = useRef<Promise<void> | null>(null);
  const loadSafepayScript = (): Promise<void> => {
    if (safepayScriptRef.current) return safepayScriptRef.current;
    safepayScriptRef.current = new Promise((resolve, reject) => {
      if (window.safepay) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://storage.googleapis.com/safepayobjects/api/safepay-checkout.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load Safepay script'));
      document.head.appendChild(s);
    });
    return safepayScriptRef.current;
  };
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cod');
  const [deliverySlot, setDeliverySlot] = useState({ date: '', time: 'evening' });
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [deliveryEstimate, setDeliveryEstimate] = useState<{
    deliveryFee: number;
    isFree: boolean;
    reason: string | null;
  } | null>(null);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});
  const [availableMethods, setAvailableMethods] = useState<string[]>(['cod', 'wallet']);
  const [tip, setTip] = useState(0);
  const TIP_PRESETS = [30, 50, 100];

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
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
      const cartData = cartResponse.data;
      setCart(cartData);
      setAddresses(addressesResponse.data);
      try {
        const methodsRes = await apiClient.get<{ success: boolean; data: Array<{ id: string; isAvailable: boolean }> }>(
          '/payments/methods'
        );
        const ids = (methodsRes.data?.data ?? []).filter((m) => m.isAvailable).map((m) => m.id);
        if (ids.length) setAvailableMethods(ids);
      } catch {
        // Keep the safe default (COD + wallet) if the methods endpoint fails.
      }
      const defaultAddress = addressesResponse.data.find((addr) => addr.isDefault);
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
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedAddress) {
      showToast('Please select a delivery address', 'warning');
      return;
    }

    setProcessing(true);
    try {
      // Convert cart items to order items (backend expects camelCase)
      const orderItems = cart!.items.map((item) => ({
        productId: item.product.id,
        quantity: item.quantity,
        stockType: item.stockType || 'direct',
        hubId: item.hubId ?? undefined,
      }));

      const orderData = {
        items: orderItems,
        deliveryType: 'home_delivery' as const,
        deliveryAddressId: selectedAddress,
        deliverySlotDate: deliverySlot.date || undefined,
        deliverySlotTime: deliverySlot.time as 'morning' | 'afternoon' | 'evening',
        // jazzcash / easypaisa / card all go through Safepay aggregator on the backend
        paymentMethod: paymentMethod as 'jazzcash' | 'easypaisa' | 'card' | 'cod' | 'wallet',
        promotionCode: appliedPromo?.code || promoCode?.trim() || undefined,
        tipAmount: tip > 0 ? tip : undefined,
      };

      const response = await orderService.createOrder(orderData);

      // Clear cart (API + local store so navbar badge updates)
      await cartService.clearCart();
      useCartStore.getState().clearCart();

      const orderId = response.data?.order?.id;
      if (!orderId) {
        showToast('Order created but no order ID returned. Please check your orders.', 'error');
        return;
      }

      // COD — skip payment gateway, go straight to order
      if (paymentMethod === 'cod') {
        router.push(`/orders/${orderId}?placed=1`);
        return;
      }

      // For all other methods, open Safepay popup
      // Backend creates a tracker token; we then render the Safepay popup on the frontend
      const payRes = await apiClient.post<{ success: boolean; data: { token?: string; paymentId?: string } }>(
        '/payments/process',
        { orderId, paymentMethod }
      );
      const token = payRes.data?.data?.token || payRes.data?.data?.paymentId;

      if (!token) {
        // No token — fallback to order page
        router.push(`/orders/${orderId}?placed=1`);
        return;
      }

      // Load Safepay JS if not already loaded, then open popup
      await loadSafepayScript();

      if (!window.safepay?.Checkout) {
        showToast('Payment provider unavailable. Please try again.', 'error');
        return;
      }

      const SANDBOX = process.env.NEXT_PUBLIC_SAFEPAY_SANDBOX !== 'false';
      let paymentSucceeded = false;
      window.safepay.Checkout.render(
        {
          env: SANDBOX ? 'sandbox' : 'production',
          payment: () => Promise.resolve(token),
          onPaymentComplete: (_data: unknown) => {
            paymentSucceeded = true;
            router.push(`/orders/${orderId}?placed=1&paid=1`);
          },
          onClose: () => {
            // Popup closed. If the user actually paid, onPaymentComplete will
            // have fired already and navigated. Otherwise, route to the order
            // page WITHOUT the `paid=1` marker — payment may still be pending
            // (webhook) or may have been abandoned.
            if (paymentSucceeded) return;
            router.push(`/orders/${orderId}`);
            showToast(
              'Payment was not completed. You can retry from your order page.',
              'info',
            );
          },
        },
        'body'
      );
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to create order', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title="Checkout"
        subtitle="Complete your order"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading checkout...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <DashboardLayout
        title="Checkout"
        subtitle="Complete your order"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Your cart is empty</h2>
          <p className="text-gray-500 mb-6">Add some items to your cart before checkout</p>
          <Link href="/products">
            <Button className="bg-green-600 hover:bg-green-700">
              Browse Products
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Checkout"
      subtitle="Complete your order"
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Checkout Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Delivery Address */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </span>
                Delivery Address
              </h2>
              {addresses.length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-xl">
                  <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                  <p className="text-gray-600 mb-4">No addresses found</p>
                  <Link href="/profile/addresses">
                    <Button variant="outline">
                      + Add Address
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((address) => (
                    <label
                      key={address.id}
                      className={`flex items-start p-4 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedAddress === address.id
                          ? 'border-green-500 bg-green-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        value={address.id}
                        checked={selectedAddress === address.id}
                        onChange={(e) => setSelectedAddress(e.target.value)}
                        className="mt-1 mr-3 text-green-600 focus:ring-green-500"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">{address.label || 'Home'}</p>
                          {address.isDefault && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Default</span>
                          )}
                        </div>
                        <p className="text-gray-600 text-sm">
                          {address.addressLine1}, {address.area}, {address.city}
                        </p>
                      </div>
                      {selectedAddress === address.id && (
                        <Check className="w-4 h-4 text-green-600" />
                      )}
                    </label>
                  ))}
                  <Link href="/profile/addresses">
                    <Button variant="outline" className="w-full mt-2">
                      + Add New Address
                    </Button>
                  </Link>
                </div>
              )}
            </div>

            {/* Delivery Slot */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </span>
                Delivery Slot
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                  <input
                    type="date"
                    value={deliverySlot.date}
                    onChange={(e) => setDeliverySlot({ ...deliverySlot, date: e.target.value })}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Time</label>
                  <select
                    value={deliverySlot.time}
                    onChange={(e) => setDeliverySlot({ ...deliverySlot, time: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    <option value="morning">Morning (9 AM - 12 PM)</option>
                    <option value="afternoon">Afternoon (12 PM - 5 PM)</option>
                    <option value="evening">Evening (5 PM - 9 PM)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center text-purple-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </span>
                Payment Method
              </h2>
              <div className="space-y-3">
                {[
                  { value: 'cod', label: 'Cash on Delivery', icon: null, desc: 'Pay when you receive' },
                  { value: 'jazzcash', label: 'JazzCash', icon: null, desc: 'Mobile wallet' },
                  { value: 'easypaisa', label: 'EasyPaisa', icon: null, desc: 'Mobile wallet' },
                  { value: 'card', label: 'Credit/Debit Card', icon: null, desc: 'Visa, Mastercard' },
                  { value: 'wallet', label: 'Nuray Wallet', icon: null, desc: 'Use your balance' },
                ].filter((method) => availableMethods.includes(method.value)).map((method) => (
                  <label
                    key={method.value}
                    className={`flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all ${
                      paymentMethod === method.value
                        ? 'border-green-500 bg-green-50 shadow-sm'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={method.value}
                      checked={paymentMethod === method.value}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="mr-3 text-green-600 focus:ring-green-500"
                    />

                    <div className="flex-1">
                      <span className="font-medium text-gray-900">{method.label}</span>
                      <p className="text-sm text-gray-500">{method.desc}</p>
                    </div>
                    {paymentMethod === method.value && (
                      <Check className="w-4 h-4 text-green-600" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {/* Tip for the kitchen */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Add a tip for the kitchen</h2>
              <p className="text-sm text-gray-500 mb-4">100% of your tip goes to the home chef.</p>
              <div className="flex flex-wrap gap-2">
                {TIP_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTip((t) => (t === amt ? 0 : amt))}
                    className={`px-4 h-11 rounded-full font-semibold border transition-colors ${
                      tip === amt
                        ? 'bg-forest-500 text-cream-50 border-forest-500'
                        : 'bg-card text-ink-700 border-ink-200 hover:border-forest-300'
                    }`}
                  >
                    {formatPrice(amt)}
                  </button>
                ))}
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-sm text-ink-500">Custom</span>
                  <input
                    type="number"
                    min={0}
                    value={tip && !TIP_PRESETS.includes(tip) ? tip : ''}
                    onChange={(e) => setTip(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="Rs"
                    className="w-24 h-11 px-3 rounded-xl border border-ink-200 bg-card text-ink-900 focus:border-forest-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Promotion Code */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                </span>
                Promotion Code
              </h2>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    if (appliedPromo) setAppliedPromo(null);
                  }}
                  placeholder="Enter promo code"
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  disabled={!!appliedPromo}
                />
                {appliedPromo ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="px-6"
                    onClick={() => { setAppliedPromo(null); setPromoCode(''); }}
                  >
                    Remove
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="px-6"
                    disabled={!promoCode.trim() || promoValidating}
                    onClick={async () => {
                      if (!promoCode.trim() || !cart) return;
                      setPromoValidating(true);
                      try {
                        const discountedSub = cart.items.reduce((s, it) => {
                          const promos = promotionsByProductId[it.product.id] || [];
                          const unit = promos.length ? getStackedDiscountedPrice(it.product.price, promos) : it.product.price;
                          return s + unit * it.quantity;
                        }, 0);
                        const res = await apiClient.post<{ success: boolean; data: { code: string; discountAmount: number } }>(
                          '/promotions/validate',
                          { code: promoCode.trim(), cartTotal: discountedSub }
                        );
                        if (res.data?.success && res.data?.data) {
                          setAppliedPromo({ code: res.data.data.code, discountAmount: res.data.data.discountAmount });
                          showToast(`Promo applied! You save ${formatPrice(res.data.data.discountAmount)}`, 'success');
                        }
                      } catch (err: any) {
                        const msg = err?.response?.data?.error?.message || err?.message || 'Invalid or expired code';
                        showToast(msg, 'error');
                      } finally {
                        setPromoValidating(false);
                      }
                    }}
                  >
                    {promoValidating ? 'Checking...' : 'Apply'}
                  </Button>
                )}
              </div>
              {appliedPromo && (
                <p className="mt-2 text-sm text-green-600">Code <strong>{appliedPromo.code}</strong> applied. Discount: {formatPrice(appliedPromo.discountAmount)}</p>
              )}
            </div>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-4">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
Order Summary
              </h2>
              
              {/* Items Preview with catalog deal prices */}
              {(() => {
                const discountedSubtotal = cart.items.reduce((sum, item) => {
                  const promos = promotionsByProductId[item.product.id] || [];
                  const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(item.product.price, promos) : item.product.price;
                  return sum + unitPrice * item.quantity;
                }, 0);
                const promotionSavings = Math.max(0, cart.summary.subtotal - discountedSubtotal);
                return (
                  <>
                    <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                      {cart.items.slice(0, 5).map((item) => {
                        const promos = promotionsByProductId[item.product.id] || [];
                        const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(item.product.price, promos) : item.product.price;
                        const lineTotal = unitPrice * item.quantity;
                        const label = promos.length > 0 ? promos.map(getPromotionLabel).join(' + ') : null;
                        return (
                          <div key={item.id} className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-400">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{item.product.name}</p>
                              <p className="text-xs text-gray-500">x{item.quantity}</p>
                              {label && <p className="text-xs text-green-600 font-medium">{label}</p>}
                            </div>
                            <div className="text-right flex-shrink-0">
                              {promos.length > 0 && item.product.price > unitPrice && (
                                <p className="text-xs text-gray-400 line-through">{formatPrice(item.subtotal)}</p>
                              )}
                              <p className="text-sm font-medium">{formatPrice(lineTotal)}</p>
                            </div>
                          </div>
                        );
                      })}
                      {cart.items.length > 5 && (
                        <p className="text-sm text-gray-500 text-center">+{cart.items.length - 5} more items</p>
                      )}
                    </div>

                    <div className="border-t border-gray-100 pt-4 space-y-3">
                      <div className="flex justify-between text-gray-600">
                        <span>Items total (before promotions)</span>
                        <span>{formatPrice(cart.summary.subtotal)}</span>
                      </div>
                      {promotionSavings > 0 && (
                        <div className="flex justify-between text-green-600">
                          <span>Deals / promotions applied</span>
                          <span>-{formatPrice(promotionSavings)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-gray-700 font-medium">
                        <span>Subtotal</span>
                        <span>{formatPrice(discountedSubtotal)}</span>
                      </div>
                      <div className="flex justify-between text-gray-600">
                  <span>Delivery Fee</span>
                  <span>
                    {deliveryEstimate ? (
                      deliveryEstimate.isFree ? (
                        <span className="text-green-600">
                          Free
                          {deliveryEstimate.reason && (
                            <span className="block text-xs text-gray-500 font-normal">{deliveryEstimate.reason}</span>
                          )}
                        </span>
                      ) : (
                        formatPrice(deliveryEstimate.deliveryFee)
                      )
                    ) : (
                      <span className="text-gray-400">Select address</span>
                    )}
                  </span>
                </div>
                <p className="text-xs text-gray-500 -mt-1">
                  {deliveryEstimate
                    ? deliveryEstimate.isFree
                      ? 'Free for your area'
                      : 'Based on your delivery address (seller distance/areas)'
                    : 'Select an address to see delivery fee'}
                </p>
                {(appliedPromo?.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Promotion ({appliedPromo!.code})</span>
                    <span>-{formatPrice(appliedPromo!.discountAmount)}</span>
                  </div>
                )}
                {!appliedPromo && cart.summary.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount</span>
                    <span>-{formatPrice(cart.summary.discount)}</span>
                  </div>
                )}
                {(() => {
                  const promoDiscount = appliedPromo?.discountAmount ?? cart.summary.discount;
                  const deliveryFee = deliveryEstimate ? deliveryEstimate.deliveryFee : cart.summary.deliveryFee;
                  const taxAmount = Math.max(0, (discountedSubtotal - promoDiscount)) * GST_RATE;
                  const total = discountedSubtotal + deliveryFee - promoDiscount + taxAmount + tip;
                  return (
                    <>
                      <div className="flex justify-between text-gray-600">
                        <span>GST (5%)</span>
                        <span>{formatPrice(taxAmount)}</span>
                      </div>
                      {tip > 0 && (
                        <div className="flex justify-between text-gray-600">
                          <span>Tip for the kitchen</span>
                          <span>{formatPrice(tip)}</span>
                        </div>
                      )}
                      <div className="border-t border-gray-100 pt-3">
                        <div className="flex justify-between font-bold text-lg">
                          <span>Total</span>
                          <span className="text-green-600">{formatPrice(total)}</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
                  </>
                );
              })()}

              <Button
                onClick={handleCreateOrder}
                className="w-full mt-6 bg-green-600 hover:bg-green-700"
                size="lg"
                disabled={processing || !selectedAddress}
              >
                {processing ? 'Processing...' : 'Place Order'}
              </Button>

              <p className="text-xs text-gray-400 text-center mt-4">
                By placing this order, you agree to our Terms & Conditions
              </p>
            </div>
          </div>
        </div>
    </DashboardLayout>
  );
}

