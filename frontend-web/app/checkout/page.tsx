'use client';

import { useEffect, useState, useRef } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { getPromotionLabel, getStackedDiscountedPrice } from '@/lib/pricing';
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
import { formatPrice, orderTotals } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { DatePicker } from '@/components/ui/DatePicker';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { apiClient, apiErrorMessage, apiErrorCode, errorMessage, apiErrorStatus } from '@/lib/api-client';
import { paymentService } from '@/lib/services/payment.service';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { checkoutMessages, richText } from '@/lib/i18n/messages/checkout';
import { ExternalLink } from '@/components/ExternalLink';
import { useDeliveryEstimate } from '@/lib/hooks/use-delivery-estimate';
import { useShallow } from 'zustand/react/shallow';

type CopyField = 'iban' | 'jazzcash' | 'easypaisa';

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

export default function CheckoutPage() {
  const router = useRouter();
  const t = useT(checkoutMessages);
  const tc = useT(commonMessages);
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { showToast } = useToast();

  const [cart, setCart] = useState<CartResponse | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'safepay' | 'wallet' | 'bank' | 'jazzcash' | 'easypaisa'>('cod');
  const [onlineAvailable, setOnlineAvailable] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [transactionRef, setTransactionRef] = useState<string>('');
  // The kitchen owes Nuray and its cash orders are paused (CASH_UNAVAILABLE): cash comes off the list.
  const [cashUnavailable, setCashUnavailable] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState<string>('');
  const [deliverySlot, setDeliverySlot] = useState({ date: '', time: 'evening' as 'morning' | 'afternoon' | 'evening' });
  const [promoCode, setPromoCode] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; discountAmount: number } | null>(null);
  const [promoValidating, setPromoValidating] = useState(false);
  const [loading, setLoading] = useState(true);
  // Why the tray and addresses could not be read; shown instead of "Your Tray is Empty", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const checkoutKeyRef = useRef<{ key: string; signature: string } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<CopyField | null>(null);
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearingCart, setClearingCart] = useState(false);
  // Bumped whenever the tray changed on the server, so the delivery estimate is asked for again.
  const [trayVersion, setTrayVersion] = useState(0);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  // What delivery to the chosen address costs is the server's to say (the kitchen, the address and the order's amount
  // decide it); nothing is assumed while it is not known.
  const { estimate: deliveryEstimate, pending: estimatePending } = useDeliveryEstimate({
    enabled: !loading && !!cart?.items?.length,
    addressId: selectedAddress || null,
    version: trayVersion,
  });

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
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
          } catch (err) {
            console.warn('Syncing local cart item to server in checkout:', errorMessage(err, ''));
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
                  t('autoApplied', { code: res.data.data.code, amount: formatPrice(res.data.data.discountAmount) }),
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
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    loadData();
    // Online payment and the wallet are offered only when they can actually be used.
    paymentService
      .getMethods()
      .then((methods) => setOnlineAvailable(!!methods.find((m) => m.id === 'safepay')?.isAvailable))
      .catch(() => setOnlineAvailable(false));
    paymentService
      .getWallet()
      .then((w) => setWalletBalance(w.isLocked ? 0 : w.balance))
      .catch(() => setWalletBalance(null));
  }, [isAuthenticated]);

  const handleCopy = (text: string, field: CopyField) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(field);
      showToast(t('copiedToClipboard', { label: t(`copyLabel.${field}`) }), 'success');
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
      showToast(t('trayClearedCheckout'), 'info');
    } catch (err) {
      showToast(apiErrorMessage(err, t('failedClearTray')), 'error');
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
        setTrayVersion((v) => v + 1);
        useCartStore.getState().removeItem(itemId);
        const fresh = await cartService.getCart();
        setCart(fresh.data);
        showToast(t('itemRemoved'), 'info');
      } catch (err) {
        showToast(apiErrorMessage(err, t('failedRemoveItem')), 'error');
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
            totalItems: nextItems.reduce((acc, it) => acc + it.quantity, 0),
          },
        };
      });
      useCartStore.getState().updateItem(itemId, newQty);

      await cartService.updateCartItem(itemId, newQty);
      setTrayVersion((v) => v + 1);
    } catch (err) {
      showToast(apiErrorMessage(err, t('couldNotUpdatePortion')), 'error');
      const fresh = await cartService.getCart();
      if (fresh.data) setCart(fresh.data);
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleCreateOrder = async () => {
    if (!selectedAddress) {
      showToast(t('selectAddress'), 'warning');
      return;
    }

    // A pin is how the rider finds the door; older addresses saved without one must get it first.
    if (!addresses.find((a) => a.id === selectedAddress)?.coordinates) {
      showToast(t('addressNeedsPin'), 'warning');
      return;
    }

    if (!cart?.items?.length) {
      showToast(t('trayEmptyWarning'), 'warning');
      return;
    }

    // A code typed in the box but never applied (or refused when it was tried) is not sent: the server refuses a whole order
    // that names a code it does not accept. Ask the person to apply it or clear it, instead of placing the order without it.
    if (!appliedPromo && promoCode.trim()) {
      showToast(t('promoNotApplied'), 'warning');
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
        promotionCode: appliedPromo?.code || undefined,
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
        showToast(t('noOrderId'), 'error');
        return;
      }

      if (typeof window !== 'undefined') {
        sessionStorage.setItem('lastPlacedOrderId', orderId);
      }

      if (paymentMethod === 'safepay') {
        // Straight on to the payment page. If it can't be opened, the order page offers
        // "Pay now" (the order waits for payment until the payment window closes).
        try {
          window.location.href = await paymentService.startOrderPayment(orderId);
          return;
        } catch (payErr) {
          showToast(apiErrorMessage(payErr, t('payPageFailed')), 'error', 8000);
          router.push(`/orders/${orderId}?placed=1`);
          return;
        }
      }

      showToast(paymentMethod === 'wallet' ? t('placedWallet') : t('placedSuccess'), 'success');
      router.push(`/orders/${orderId}?placed=1`);
    } catch (error) {
      if (apiErrorStatus(error) === undefined) {
        // No answer (timeout / connection lost): the order may or may not exist. Keep the
        // key so pressing "Place order" again returns the same order, never a duplicate.
        showToast(t('connectionProblem'), 'error');
      } else {
        // The server refused it, so nothing was placed: a new attempt gets a new key.
        checkoutKeyRef.current = null;
        const code = apiErrorCode(error);
        if (code === 'GATEWAY_UNAVAILABLE') {
          // The gateway went away after the page loaded: take the option off, so the next press does not fail the same way.
          setOnlineAvailable(false);
          setPaymentMethod('cod');
        }
        if (code === 'CASH_UNAVAILABLE') {
          setCashUnavailable(true);
          setPaymentMethod(onlineAvailable ? 'safepay' : 'bank');
        }
        showToast(
          code === 'GATEWAY_UNAVAILABLE' ? t('onlineUnavailable') : code === 'CASH_UNAVAILABLE' ? t('cashUnavailable') : apiErrorMessage(error, t('placeFailed')),
          'error'
        );
      }
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout title={t('checkoutTitle')} subtitle={t('checkoutSubtitle')} sidebarItems={sidebarItems} userType="customer">
        <div className="max-w-5xl mx-auto py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-muted">{t('preparingSummary')}</p>
        </div>
      </DashboardLayout>
    );
  }

  if (loadError && !cart) {
    return (
      <DashboardLayout title={t('checkoutTitle')} subtitle={t('checkoutSubtitle')} sidebarItems={sidebarItems} userType="customer">
        <div className="max-w-xl mx-auto my-12">
          <LoadError error={loadError} onRetry={loadData} title={t('loadFailed')} />
        </div>
      </DashboardLayout>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <DashboardLayout title={t('checkoutTitle')} subtitle={t('checkoutSubtitle')} sidebarItems={sidebarItems} userType="customer">
        <div className="max-w-md mx-auto my-12 bg-surface rounded-[24px] p-8 border border-line text-center">
          <div className="w-16 h-16 bg-brand-soft rounded-2xl flex items-center justify-center mx-auto mb-4 text-brand-soft-ink">
            <ShoppingBag className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-ink tracking-tight mb-1.5">{t('trayEmptyTitle')}</h2>
          <p className="text-xs text-muted mb-6">{t('trayEmptyText')}</p>
          <Link href="/kitchens">
            <Button className="w-full bg-brand hover:bg-brand-500 text-on-brand font-bold py-2.5 rounded-xl">
              {t('browseKitchens')}
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Active seller details for direct payment display
  const activeSeller = cart.activeSeller || cart.items[0]?.seller;
  const sellerTitle = activeSeller?.businessName || t('verifiedKitchen');
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
  // Delivery is added to the total only once the server has said what it costs to the chosen address.
  const deliveryKnown = !!deliveryEstimate && deliveryEstimate.isDeliverable !== false;
  const notDeliverable = !!deliveryEstimate && deliveryEstimate.isDeliverable === false;
  const effectiveDeliveryFee = deliveryKnown && !deliveryEstimate.isFree ? deliveryEstimate.deliveryFee : 0;
  const promoDiscountAmount = appliedPromo?.discountAmount || 0;
  // Exactly what the server charges (priceOrder in order.service.ts): GST on the goods after
  // all discounts, the total in whole rupees, so this is the amount the rider collects.
  const { gst: gstAmount, total: totalPayable } = orderTotals(discountedSubtotal - promoDiscountAmount, effectiveDeliveryFee);

  return (
    <DashboardLayout title={t('checkoutTitle')} subtitle={t('reviewSubtitle')} sidebarItems={sidebarItems} userType="customer">
      <div className="max-w-6xl mx-auto pb-16">
        {/* Kitchen Origin Header Banner */}
        <div className="mb-6 p-4 rounded-[20px] bg-surface border border-line flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center text-brand-soft-ink">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-ink">{sellerTitle}</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-brand-soft text-brand-soft-ink">
                  {t('singleKitchenBatch')}
                </span>
              </div>
              <p className="text-xs text-muted">
                {t('oneKitchenText')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowClearModal(true)}
              className="text-sm font-bold text-muted hover:text-red-600 hover:bg-raised h-10 px-3 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t('clearTray')}</span>
            </button>
            <Link
              href="/cart"
              className="text-sm font-bold text-brand-ink hover:underline inline-flex items-center gap-1"
            >
              <span>{t('editTray', { count: cart.summary.totalItems })}</span>
              <ChevronRight className="rtl:-scale-x-100 w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Checkout Columns (7 of 12) */}
          <div className="lg:col-span-7 space-y-6">
            {/* 1. Delivery Address */}
            <div className="bg-surface rounded-[20px] p-4 sm:p-6 border border-line space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-ink tracking-tight">{t('addressHeading')}</h2>
                    <p className="text-xs text-muted">{t('addressHint')}</p>
                  </div>
                </div>
                <Link
                  href="/profile/addresses"
                  className="text-sm font-bold text-brand-ink hover:underline inline-flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{t('addAddress')}</span>
                </Link>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-6 px-4 bg-raised rounded-2xl border border-dashed border-line">
                  <MapPin className="w-8 h-8 text-line-strong mx-auto mb-2" />
                  <p className="text-xs font-semibold text-ink mb-1">{t('noAddress')}</p>
                  <p className="text-xs text-muted mb-3">{t('noAddressHint')}</p>
                  <Link href="/profile/addresses">
                    <Button size="sm" className="bg-brand hover:bg-brand-500 text-xs font-bold text-on-brand rounded-xl">
                      {t('addAddressPlus')}
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
                            ? 'border-brand bg-brand-soft/40'
                            : 'border-line hover:border-line-strong bg-surface'
                        }`}
                      >
                        <input
                          type="radio"
                          name="deliveryAddress"
                          value={address.id}
                          checked={isSelected}
                          onChange={(e) => setSelectedAddress(e.target.value)}
                          className="mt-1 accent-brand w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[15px] font-bold text-ink">{address.label || t('addressHome')}</span>
                            {address.isDefault && (
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-raised text-muted border border-line">
                                {t('addressDefault')}
                              </span>
                            )}
                            {!address.coordinates && (
                              <Link href="/profile/addresses" className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-accent-soft text-accent-soft-ink border border-accent/50" data-testid="address-no-pin">
                                {t('addressNoPin')}
                              </Link>
                            )}
                          </div>
                          <p className="text-xs text-muted leading-relaxed truncate">
                            {address.addressLine1}
                            {address.area ? `, ${address.area}` : ''}
                            {address.city ? `, ${address.city}` : ''}
                          </p>
                        </div>
                        {isSelected && (
                          <div className="w-5 h-5 rounded-full bg-brand text-on-brand flex items-center justify-center shrink-0 text-xs">
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
            <div className="bg-surface rounded-[20px] p-4 sm:p-6 border border-line space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center">
                  <Clock className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-ink tracking-tight">{t('slotHeading')}</h2>
                  <p className="text-xs text-muted">{t('slotHint')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-muted block mb-1.5">{t('deliveryDate')}</label>
                  <DatePicker
                    value={deliverySlot.date}
                    onChange={(date) => setDeliverySlot({ ...deliverySlot, date })}
                    min={new Date().toISOString().split('T')[0]}
                    placeholder={t('datePlaceholder')}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted block mb-1.5">{t('timeWindow')}</label>
                  <select
                    value={deliverySlot.time}
                    onChange={(e) =>
                      setDeliverySlot({
                        ...deliverySlot,
                        time: e.target.value as 'morning' | 'afternoon' | 'evening',
                      })
                    }
                    className="w-full h-11 px-3 text-sm font-medium text-ink border border-line-strong rounded-xl bg-surface outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                  >
                    <option value="morning">{t('slot.morning')}</option>
                    <option value="afternoon">{t('slot.afternoon')}</option>
                    <option value="evening">{t('slot.evening')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-muted block mb-1.5">
                  {t('riderInstructions')}
                </label>
                <input
                  type="text"
                  value={deliveryInstructions}
                  onChange={(e) => setDeliveryInstructions(e.target.value)}
                  placeholder={t('riderPlaceholder')}
                  className="w-full h-11 px-3 text-sm text-ink placeholder:text-muted border border-line-strong rounded-xl bg-surface outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                />
              </div>
            </div>

            {/* 3. Payment Method */}
            <div className="bg-surface rounded-[20px] p-4 sm:p-6 border border-line space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-ink tracking-tight">{t('paymentHeading')}</h2>
                  <p className="text-xs text-muted">{t('paymentHint')}</p>
                </div>
              </div>

              <div className="space-y-3">
                {cashUnavailable && (
                  <p role="status" className="p-3 rounded-xl bg-accent-soft border border-accent/50 text-xs font-semibold text-accent-soft-ink" data-testid="cash-unavailable">
                    {t('cashUnavailable')}
                  </p>
                )}
                {/* Method 1: Cash on Delivery */}
                {!cashUnavailable && (
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'cod'
                      ? 'border-brand bg-brand-soft/40'
                      : 'border-line hover:border-line-strong bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                      className="accent-brand w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-accent-soft text-accent-soft-ink flex items-center justify-center shrink-0">
                      <Banknote className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-ink">{t('codTitle')}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-accent-soft text-accent-soft-ink">
                          {t('recommended')}
                        </span>
                      </div>
                      <p className="text-xs text-muted">{t('codHint')}</p>
                    </div>
                  </div>
                  {paymentMethod === 'cod' && (
                    <div className="mt-3 ms-7 pt-2.5 border-t border-line text-xs text-muted flex items-center gap-2">
                      <ShieldCheck className="w-3.5 h-3.5 text-brand-soft-ink shrink-0" />
                      <span>{t('codNote')}</span>
                    </div>
                  )}
                </label>
                )}

                {/* Online: card / JazzCash / EasyPaisa through Safepay */}
                {onlineAvailable && (
                  <label
                    className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                      paymentMethod === 'safepay'
                        ? 'border-brand bg-brand-soft/40'
                        : 'border-line hover:border-line-strong bg-surface'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="safepay"
                        checked={paymentMethod === 'safepay'}
                        onChange={() => setPaymentMethod('safepay')}
                        className="accent-brand w-4 h-4 cursor-pointer"
                      />
                      <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[15px] font-bold text-ink">{t('onlineTitle')}</span>
                        <p className="text-xs text-muted">{t('onlineHint')}</p>
                      </div>
                    </div>
                    {paymentMethod === 'safepay' && (
                      <div className="mt-3 ms-7 pt-2.5 border-t border-line text-xs text-muted flex items-center gap-2">
                        <ShieldCheck className="w-3.5 h-3.5 text-brand-soft-ink shrink-0" />
                        <span>{t('onlineNote')}</span>
                      </div>
                    )}
                  </label>
                )}

                {/* Nuray Wallet */}
                {walletBalance !== null && (
                  <label
                    className={`block p-4 rounded-2xl border-2 transition-all ${
                      walletBalance < totalPayable
                        ? 'border-line bg-raised cursor-not-allowed opacity-70'
                        : paymentMethod === 'wallet'
                        ? 'border-brand bg-brand-soft/40 cursor-pointer'
                        : 'border-line hover:border-line-strong bg-surface cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="paymentMethod"
                        value="wallet"
                        disabled={walletBalance < totalPayable}
                        checked={paymentMethod === 'wallet'}
                        onChange={() => setPaymentMethod('wallet')}
                        className="accent-brand w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <div className="w-8 h-8 rounded-xl bg-raised text-ink flex items-center justify-center shrink-0">
                        <Banknote className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <span className="text-[15px] font-bold text-ink">{t('walletTitle')}</span>
                        <p className="text-xs text-muted">
                          {t('walletBalance', { amount: formatPrice(walletBalance) })}
                          {walletBalance < totalPayable && (
                            <>
                              {t('walletNotEnough')}
                              <Link href="/wallet" className="underline font-semibold">
                                {t('topUp')}
                              </Link>
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </label>
                )}

                {/* Method 2: Bank Transfer / Raast (IBFT) */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'bank'
                      ? 'border-brand bg-brand-soft/40'
                      : 'border-line hover:border-line-strong bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="bank"
                      checked={paymentMethod === 'bank'}
                      onChange={() => setPaymentMethod('bank')}
                      className="accent-brand w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[15px] font-bold text-ink">{t('bankTitle')}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {t('directToChef')}
                        </span>
                      </div>
                      <p className="text-xs text-muted">{t('bankHint')}</p>
                    </div>
                  </div>

                  {paymentMethod === 'bank' && (
                    <div className="mt-3.5 ms-7 pt-3.5 border-t border-line space-y-3">
                      {sellerAccountNumber ? (
                        <div className="bg-raised rounded-2xl p-4 space-y-2.5">
                          {sellerBankName && (
                            <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                              <span className="text-muted text-xs">{t('bankName')}</span>
                              <span className="font-bold text-ink">{sellerBankName}</span>
                            </div>
                          )}
                          <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                            <span className="text-muted text-xs">{t('accountTitle')}</span>
                            <span className="font-bold text-ink">{sellerAccountTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-muted text-xs block">{t('accountIban')}</span>
                              <span className="font-mono text-sm font-extrabold text-ink tracking-wide" data-ltr>
                                {sellerAccountNumber}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCopy(sellerAccountNumber, 'iban');
                              }}
                              className="h-9 px-3 text-xs font-bold bg-surface hover:bg-line text-ink rounded-lg flex items-center gap-1.5 transition-colors border border-line cursor-pointer"
                            >
                              {copiedField === 'iban' ? (
                                <>
                                  <Check className="w-3 h-3 text-brand-ink" />
                                  <span>{t('copied')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{t('copy')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-accent-soft rounded-xl border border-accent/50 text-accent-soft-ink text-xs">
                          {t('bankMissing')}
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-semibold text-ink block mb-1">
                          {t('txnRefLabel')}
                        </label>
                        <input
                          type="text"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder={t('txnRefPlaceholder')}
                          className="w-full px-3 py-1.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-brand bg-surface"
                        />
                        <p className="text-xs text-muted mt-1">
                          {t('uploadLater')}
                        </p>
                      </div>
                    </div>
                  )}
                </label>

                {/* Method 3: JazzCash Direct Transfer */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'jazzcash'
                      ? 'border-brand bg-brand-soft/40'
                      : 'border-line hover:border-line-strong bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="jazzcash"
                      checked={paymentMethod === 'jazzcash'}
                      onChange={() => setPaymentMethod('jazzcash')}
                      className="accent-brand w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-red-50 text-red-700 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-[15px] font-bold text-ink">{t('jazzTitle')}</span>
                      <p className="text-xs text-muted">{t('jazzHint')}</p>
                    </div>
                  </div>

                  {paymentMethod === 'jazzcash' && (
                    <div className="mt-3.5 ms-7 pt-3.5 border-t border-line space-y-3">
                      {sellerJazzCash ? (
                        <div className="bg-raised rounded-2xl p-4 space-y-2.5">
                          <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                            <span className="text-muted text-xs">{t('chefTitle')}</span>
                            <span className="font-bold text-ink">{sellerTitle}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                            <span className="text-muted text-xs">{t('accountTitle')}</span>
                            <span className="font-bold text-ink">{sellerJazzCashTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-muted text-xs block">{t('jazzNumber')}</span>
                              <span className="font-mono text-sm font-extrabold text-ink tracking-wide" data-ltr>
                                {sellerJazzCash}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCopy(sellerJazzCash, 'jazzcash');
                              }}
                              className="h-9 px-3 text-xs font-bold bg-surface hover:bg-line text-ink rounded-lg flex items-center gap-1.5 transition-colors border border-line cursor-pointer"
                            >
                              {copiedField === 'jazzcash' ? (
                                <>
                                  <Check className="w-3 h-3 text-brand-ink" />
                                  <span>{t('copied')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{t('copy')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-accent-soft rounded-xl border border-accent/50 text-accent-soft-ink text-xs">
                          {t('jazzMissing')}
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-semibold text-ink block mb-1">
                          {t('jazzTidLabel')}
                        </label>
                        <input
                          type="text"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder={t('jazzTidPlaceholder')}
                          dir="ltr"
                          className="w-full px-3 py-1.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-brand bg-surface"
                        />
                      </div>
                    </div>
                  )}
                </label>

                {/* Method 4: EasyPaisa Direct Transfer */}
                <label
                  className={`block p-4 rounded-2xl border-2 cursor-pointer transition-all ${
                    paymentMethod === 'easypaisa'
                      ? 'border-brand bg-brand-soft/40'
                      : 'border-line hover:border-line-strong bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="easypaisa"
                      checked={paymentMethod === 'easypaisa'}
                      onChange={() => setPaymentMethod('easypaisa')}
                      className="accent-brand w-4 h-4 cursor-pointer"
                    />
                    <div className="w-8 h-8 rounded-xl bg-brand-soft text-brand-soft-ink flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <span className="text-[15px] font-bold text-ink">{t('easyTitle')}</span>
                      <p className="text-xs text-muted">{t('easyHint')}</p>
                    </div>
                  </div>

                  {paymentMethod === 'easypaisa' && (
                    <div className="mt-3.5 ms-7 pt-3.5 border-t border-line space-y-3">
                      {sellerEasyPaisa ? (
                        <div className="bg-raised rounded-2xl p-4 space-y-2.5">
                          <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                            <span className="text-muted text-xs">{t('chefTitle')}</span>
                            <span className="font-bold text-ink">{sellerTitle}</span>
                          </div>
                          <div className="flex items-center justify-between text-xs border-b border-line pb-2">
                            <span className="text-muted text-xs">{t('accountTitle')}</span>
                            <span className="font-bold text-ink">{sellerEasyPaisaTitle}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <span className="text-muted text-xs block">{t('easyNumber')}</span>
                              <span className="font-mono text-sm font-extrabold text-ink tracking-wide" data-ltr>
                                {sellerEasyPaisa}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                handleCopy(sellerEasyPaisa, 'easypaisa');
                              }}
                              className="h-9 px-3 text-xs font-bold bg-surface hover:bg-line text-ink rounded-lg flex items-center gap-1.5 transition-colors border border-line cursor-pointer"
                            >
                              {copiedField === 'easypaisa' ? (
                                <>
                                  <Check className="w-3 h-3 text-brand-ink" />
                                  <span>{t('copied')}</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>{t('copy')}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 bg-accent-soft rounded-xl border border-accent/50 text-accent-soft-ink text-xs">
                          {t('easyMissing')}
                        </div>
                      )}

                      <div>
                        <label className="text-[11px] font-semibold text-ink block mb-1">
                          {t('easyTidLabel')}
                        </label>
                        <input
                          type="text"
                          value={transactionRef}
                          onChange={(e) => setTransactionRef(e.target.value)}
                          placeholder={t('easyTidPlaceholder')}
                          dir="ltr"
                          className="w-full px-3 py-1.5 text-xs border border-line-strong rounded-xl outline-none focus:ring-2 focus:ring-brand bg-surface"
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
            <div className="bg-surface rounded-[24px] p-5 sm:p-6 border border-line sticky top-[calc(5rem+var(--safe-top))] space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <h3 className="text-base font-extrabold text-ink tracking-tight">{t('orderSummary')}</h3>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-muted">
                    {t(cart.summary.totalItems === 1 ? 'portionsOne' : 'portionsMany', { count: cart.summary.totalItems })}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowClearModal(true)}
                    className="text-xs font-bold text-muted hover:text-red-600 hover:bg-raised h-9 px-2.5 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    title={t('removeAllDishes')}
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{t('clearTray')}</span>
                  </button>
                </div>
              </div>

              {/* Items List with Quantity Controls */}
              <div className="space-y-3 max-h-72 overflow-y-auto pe-1">
                {cart.items.map((item) => {
                  const base = item.variant?.price ?? item.product.price;
                  const promos = promotionsByProductId[item.product.id] || [];
                  const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(base, promos) : base;
                  const lineTotal = unitPrice * item.quantity;
                  const label = promos.length > 0 ? promos.map((p) => getPromotionLabel(p, t, formatPrice)).join(' + ') : null;

                  return (
                    <div key={item.id} className="p-3 rounded-2xl bg-raised space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-bold text-ink truncate">{item.product.name}</p>
                          {item.variant && (
                            <p className="text-xs text-muted truncate">{item.variant.name}</p>
                          )}
                          {label && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-soft-ink bg-brand-soft px-1.5 py-0.2 rounded mt-0.5">
                              <Tag className="w-2.5 h-2.5" />
                              {label}
                            </span>
                          )}
                        </div>
                        <div className="text-end shrink-0">
                          <span className="text-sm font-extrabold text-ink">{formatPrice(lineTotal)}</span>
                          {promos.length > 0 && base > unitPrice && (
                            <p className="text-xs text-muted line-through">
                              {formatPrice(base * item.quantity)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Quantity Stepper */}
                      <div className="flex items-center justify-between pt-1 border-t border-line">
                        <span className="text-xs text-muted font-medium">
                          {t('perPiece', { price: formatPrice(unitPrice) })}
                        </span>
                        <div className="flex items-center h-9 bg-surface rounded-xl border border-line">
                          <button
                            type="button"
                            disabled={updatingItemId === item.id}
                            onClick={() => handleUpdateItemQuantity(item.id, item.quantity - 1)}
                            className="w-9 h-9 rounded-s-xl hover:bg-raised text-ink flex items-center justify-center transition-colors disabled:opacity-50"
                            title={t('decreasePortion')}
                            aria-label={t('decreasePortion')}
                          >
                            <Minus className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                          <span className="min-w-6 text-center text-sm font-extrabold text-ink" aria-live="polite">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            disabled={updatingItemId === item.id}
                            onClick={() => handleUpdateItemQuantity(item.id, item.quantity + 1)}
                            className="w-9 h-9 rounded-e-xl hover:bg-raised text-brand-ink flex items-center justify-center transition-colors disabled:opacity-50"
                            title={t('increasePortion')}
                            aria-label={t('increasePortion')}
                          >
                            <Plus className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Promo Code Box */}
              <div className="pt-2 border-t border-line">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => {
                      setPromoCode(e.target.value.toUpperCase());
                      if (appliedPromo) setAppliedPromo(null);
                    }}
                    placeholder={t('voucherPlaceholder')}
                    dir="ltr"
                    disabled={!!appliedPromo}
                    aria-label={t('voucherPlaceholder')}
                    className="flex-1 min-w-0 h-11 px-3 text-sm font-semibold uppercase tracking-wider text-ink border border-line rounded-xl outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand bg-surface"
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
                        showToast(t('promoRemoved'), 'info');
                      }}
                      className="h-11 text-sm font-bold text-red-600 rounded-xl px-3"
                    >
                      {tc('remove')}
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
                            showToast(t('voucherAppliedToast', { amount: formatPrice(res.data.data.discountAmount) }), 'success');
                          }
                        } catch (err) {
                          showToast(apiErrorMessage(err, t('invalidVoucher')), 'error');
                        } finally {
                          setPromoValidating(false);
                        }
                      }}
                      className="h-11 bg-ink hover:bg-ink/90 text-page text-sm font-extrabold rounded-xl px-4"
                    >
                      {promoValidating ? t('checking') : t('apply')}
                    </Button>
                  )}
                </div>
                {appliedPromo && (
                  <p className="mt-1.5 text-[11px] font-semibold text-brand-soft-ink flex items-center gap-1">
                    <Check className="w-3 h-3 stroke-[3]" />
                    <span>
                      {richText(t('voucherAppliedLine'), { code: <strong data-ltr>{appliedPromo.code}</strong>, amount: formatPrice(appliedPromo.discountAmount) })}
                    </span>
                  </p>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="pt-2 border-t border-line space-y-2.5 text-sm">
                <div className="flex justify-between text-muted">
                  <span>{t('dishesSubtotal')}</span>
                  <span className="font-semibold text-ink">{formatPrice(discountedSubtotal)}</span>
                </div>

                {promotionSavings > 0 && (
                  <div className="flex justify-between text-brand-soft-ink font-medium">
                    <span>{t('menuDealsSavings')}</span>
                    <span>-{formatPrice(promotionSavings)}</span>
                  </div>
                )}

                {appliedPromo && (
                  <div className="flex justify-between text-brand-soft-ink font-medium">
                    <span>{t('voucherDiscount')}</span>
                    <span>-{formatPrice(appliedPromo.discountAmount)}</span>
                  </div>
                )}

                <div className={`flex justify-between text-muted transition-opacity ${estimatePending && deliveryEstimate ? 'opacity-60' : ''}`}>
                  <span>{t('estimatedDelivery')}</span>
                  <span>
                    {!selectedAddress ? (
                      <span className="font-medium text-muted">{t('deliveryChooseAddress')}</span>
                    ) : notDeliverable ? (
                      <span className="font-bold text-red-600">{t('deliveryNotAvailable')}</span>
                    ) : !deliveryEstimate ? (
                      <span className="font-medium text-muted">{estimatePending ? t('deliveryWorkingOut') : t('deliveryAtPlacing')}</span>
                    ) : deliveryEstimate.isFree ? (
                      <span className="font-bold text-brand-soft-ink">{t('freeCaps')}</span>
                    ) : (
                      <span className="font-semibold text-ink">{formatPrice(effectiveDeliveryFee)}</span>
                    )}
                  </span>
                </div>
                {notDeliverable && deliveryEstimate?.reason && (
                  <p className="text-[11px] text-red-600 -mt-1">{deliveryEstimate.reason}</p>
                )}

                <div className="flex justify-between text-muted text-sm">
                  <span>{t('salesTax5')}</span>
                  <span>{formatPrice(gstAmount)}</span>
                </div>

                <div className="pt-3 border-t border-line flex items-baseline justify-between">
                  <div>
                    <span className="text-base font-extrabold text-ink block">{deliveryKnown ? t('totalPayable') : t('totalBeforeDelivery')}</span>
                    <span className="text-xs text-muted">{deliveryKnown ? t('includesDeliveryTax') : t('deliveryAddedWhenPlaced')}</span>
                  </div>
                  <span className="text-2xl font-extrabold text-ink">{formatPrice(totalPayable)}</span>
                </div>
              </div>

              {/* Place Order CTA Button */}
              <Button
                type="button"
                disabled={processing || !selectedAddress || notDeliverable || (estimatePending && !deliveryEstimate)}
                onClick={handleCreateOrder}
                className="w-full h-14 bg-brand hover:bg-brand-500 text-on-brand font-extrabold text-base rounded-2xl transition-all active:scale-[0.99] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-brand border-t-transparent rounded-full animate-spin" />
                    <span>{t('placing')}</span>
                  </>
                ) : (
                  <>
                    <span>{deliveryKnown ? t('placeOrder', { amount: formatPrice(totalPayable) }) : t('placeOrderPlain')}</span>
                    <ArrowRight className="rtl:-scale-x-100 w-4 h-4" />
                  </>
                )}
              </Button>

              <p className="text-center text-xs leading-relaxed text-muted">
                {richText(t('agreeTerms'), {
                  terms: (
                    <ExternalLink href="/terms" className="font-semibold text-ink underline hover:text-brand-ink">
                      {t('terms')}
                    </ExternalLink>
                  ),
                  refund: (
                    <ExternalLink href="/refund-policy" className="font-semibold text-ink underline hover:text-brand-ink">
                      {t('refundPolicy')}
                    </ExternalLink>
                  ),
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={showClearModal}
        title={t('clearModalTitle')}
        message={t('clearModalMessageCheckout')}
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
