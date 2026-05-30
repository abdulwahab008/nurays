'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingCart,
  Trash2,
  Store,
  Zap,
  Package,
  ClipboardList,
  Truck,
  Tag,
  ShoppingBag,
  Lock,
  Check,
  ImageOff,
  ChevronLeft,
  X,
} from 'lucide-react';
import { cartService, CartResponse } from '@/lib/services/cart.service';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { useCartStore } from '@/lib/store/cart-store';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/components/ui/toast';
import { addressService } from '@/lib/services/address.service';

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

export default function CartPage() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { setItems, clearCart: clearCartStore } = useCartStore();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingItem, setUpdatingItem] = useState<string | null>(null);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});
  const [deliveryEstimate, setDeliveryEstimate] = useState<{
    deliveryFee: number;
    isFree: boolean;
    reason: string | null;
  } | null>(null);

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
    { name: 'Help & Support', href: '/support', icon: '' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
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
      const response = await cartService.getCart();
      const cartData = response.data;
      setCart(cartData);
      // Sync navbar cart badge with server cart
      if (!cartData?.items?.length) {
        clearCartStore();
      } else {
        setItems(
          cartData.items.map((i) => ({
            id: i.id,
            productId: i.product.id,
            productName: i.product.name,
            productImage: i.product.image,
            sellerId: i.seller.id,
            sellerName: i.seller.businessName,
            quantity: i.quantity,
            unitPrice: i.product.price,
            stockType: i.stockType,
            hubId: i.hubId,
            subtotal: i.subtotal,
          }))
        );
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
    } catch (error) {
      console.error('Failed to load cart:', error);
    } finally {
      setLoading(false);
    }
  };

  const { showToast } = useToast();

  const handleUpdateQuantity = async (itemId: string, quantity: number) => {
    if (quantity <= 0) {
      await handleRemoveItem(itemId);
      return;
    }
    setUpdatingItem(itemId);
    try {
      await cartService.updateCartItem(itemId, quantity);
      loadCart();
    } catch (error: any) {
      const msg = error?.response?.data?.error?.message || error?.message || 'Failed to update quantity';
      showToast(msg, 'error');
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleRemoveItem = async (itemId: string) => {
    setUpdatingItem(itemId);
    try {
      await cartService.removeCartItem(itemId);
      loadCart();
    } catch (error) {
      console.error('Failed to remove cart item:', error);
    } finally {
      setUpdatingItem(null);
    }
  };

  const handleClearCart = async () => {
    if (confirm('Are you sure you want to clear your cart?')) {
      try {
        await cartService.clearCart();
        clearCartStore();
        loadCart();
      } catch (error) {
        console.error('Failed to clear cart:', error);
      }
    }
  };

  if (loading) {
    return (
      <DashboardLayout
        title="My Cart"
        subtitle="Review your items"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your cart...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <DashboardLayout
        title="My Cart"
        subtitle="Your shopping cart"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingCart className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h2>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Items you add from product pages appear here. Use the cart icon in the top bar or &quot;My Cart&quot; in the sidebar to return to this page.
          </p>
          <Link href="/products">
            <Button size="lg" className="bg-gray-800 hover:bg-gray-900">
              Browse Products
            </Button>
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  // Apply catalog promotions to summary (backend returns full-price subtotal)
  const discountedSubtotal = cart.items.reduce((sum, item) => {
    const promos = promotionsByProductId[item.product.id] || [];
    const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(item.product.price, promos) : item.product.price;
    return sum + unitPrice * item.quantity;
  }, 0);
  const promotionSavings = Math.max(0, cart.summary.subtotal - discountedSubtotal);
  const deliveryFee = deliveryEstimate ? deliveryEstimate.deliveryFee : 0;
  const displayTotal = discountedSubtotal + deliveryFee - cart.summary.discount;

  return (
    <DashboardLayout
      title="My Cart"
      subtitle={`${cart.items.length} item${cart.items.length > 1 ? 's' : ''} in your cart`}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cart Items */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Cart Items</h2>
                <p className="text-sm text-gray-500">{cart.items.length} product{cart.items.length > 1 ? 's' : ''}</p>
              </div>
            </div>
            <button
              onClick={handleClearCart}
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Clear All
            </button>
          </div>

          {/* Items */}
          {cart.items.map((item) => {
            const promos = promotionsByProductId[item.product.id] || [];
            const originalPrice = item.product.price;
            const unitPrice = promos.length > 0 ? getStackedDiscountedPrice(originalPrice, promos) : originalPrice;
            const lineTotal = unitPrice * item.quantity;
            const promotionLabel = promos.length > 0 ? promos.map(getPromotionLabel).join(' + ') : null;
            return (
            <div key={item.id} className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-5 transition-all ${updatingItem === item.id ? 'opacity-60' : ''}`}>
              <div className="flex gap-4">
                {/* Product Image */}
                <Link href={`/products/${item.product.id}`} className="w-28 h-28 bg-gray-100 rounded-xl overflow-hidden flex-shrink-0 block">
                  {item.product.image ? (
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <ImageOff className="w-10 h-10" />
                    </div>
                  )}
                </Link>
                
                {/* Product Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <Link href={`/products/${item.product.id}`}>
                        <h3 className="font-semibold text-gray-900 text-lg hover:underline">{item.product.name}</h3>
                      </Link>
                      <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                        <Store className="w-3.5 h-3.5 text-gray-400" /> {item.seller.businessName}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      disabled={updatingItem === item.id}
                      aria-label="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  
                  {/* Promotion label */}
                  {promotionLabel && (
                    <p className="text-xs font-medium text-gray-600 mb-1.5">{promotionLabel}</p>
                  )}
                  
                  {/* Stock Type Badge */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1 ${
                      item.stockType === 'hub' 
                        ? 'bg-gray-100 text-gray-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {item.stockType === 'hub' ? <Zap className="w-3 h-3" /> : <Package className="w-3 h-3" />}
                      {item.stockType === 'hub' ? 'Hub Stock (2-4 hrs)' : 'Seller Stock (24 hrs)'}
                    </span>
                  </div>
                  
                  {/* Price & Quantity */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
                      <button
                        onClick={() => handleUpdateQuantity(item.id, item.quantity - 1)}
                        className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors font-medium text-lg disabled:opacity-50"
                        disabled={updatingItem === item.id}
                      >
                        −
                      </button>
                      <span className="w-12 text-center font-semibold text-gray-900">{item.quantity}</span>
                      <button
                        onClick={() => handleUpdateQuantity(item.id, item.quantity + 1)}
                        className="w-9 h-9 rounded-lg bg-white shadow-sm flex items-center justify-center hover:bg-gray-50 transition-colors font-medium text-lg disabled:opacity-50"
                        disabled={updatingItem === item.id}
                      >
                        +
                      </button>
                    </div>
                    <div className="text-right">
                      {promos.length > 0 && originalPrice > unitPrice && (
                        <p className="text-sm text-gray-500">
                          <span className="line-through">{formatPrice(originalPrice)}</span>
                          {' → '}
                          {formatPrice(unitPrice)} × {item.quantity}
                        </p>
                      )}
                      {(!promos.length || originalPrice === unitPrice) && (
                        <p className="text-sm text-gray-500">
                          {formatPrice(unitPrice)} × {item.quantity}
                        </p>
                      )}
                      <p className="font-bold text-xl text-gray-900">
                        {formatPrice(lineTotal)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
          })}
        </div>

        {/* Order Summary - Sticky */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sticky top-24">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-gray-600" /> Order Summary
            </h2>
            
            {/* Items Count */}
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Package className="w-4 h-4 text-gray-500" />
                <span>{cart.items.length} item{cart.items.length > 1 ? 's' : ''} in cart</span>
              </div>
            </div>
            
            {/* Price Breakdown: original → promotions → subtotal → delivery → total */}
            <div className="space-y-3 mb-4">
              <div className="flex justify-between text-gray-600">
                <span>Items total (before promotions)</span>
                <span className="font-medium">{formatPrice(cart.summary.subtotal)}</span>
              </div>
              {promotionSavings > 0 && (
                <div className="flex justify-between text-green-600">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-4 h-4" /> Promotions applied
                  </span>
                  <span className="font-medium">-{formatPrice(promotionSavings)}</span>
                </div>
              )}
              <div className="flex justify-between text-gray-700 font-medium">
                <span>Subtotal</span>
                <span>{formatPrice(discountedSubtotal)}</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span className="flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-gray-500" /> Delivery Fee
                </span>
                <span className="font-medium">
                  {deliveryEstimate
                    ? deliveryEstimate.isFree
                      ? 'Free'
                      : formatPrice(deliveryEstimate.deliveryFee)
                    : cart.items.length > 0
                      ? 'Calculated at checkout'
                      : 'Free'}
                </span>
              </div>
              {deliveryEstimate && !deliveryEstimate.isFree && (
                <p className="text-xs text-gray-500 -mt-1">Based on your default address</p>
              )}
              {cart.summary.discount > 0 && (
                <div className="flex justify-between text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-gray-500" /> Discount
                  </span>
                  <span className="font-medium">-{formatPrice(cart.summary.discount)}</span>
                </div>
              )}
            </div>
            
            {/* Total */}
            <div className="border-t border-gray-200 pt-4 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-lg font-semibold text-gray-900">Total</span>
                <span className="text-2xl font-bold text-gray-900">{formatPrice(displayTotal)}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Including all taxes</p>
            </div>
            
            {/* Checkout Button */}
            <Link href="/checkout" className="block">
              <Button className="w-full bg-gray-800 hover:bg-gray-900 py-6 text-lg font-semibold" size="lg">
                <ShoppingBag className="w-5 h-5 mr-2" /> Proceed to Checkout
              </Button>
            </Link>
            
            <Link href="/products" className="block mt-3">
              <Button variant="outline" className="w-full">
                <ChevronLeft className="w-4 h-4 mr-2" /> Continue Shopping
              </Button>
            </Link>
            
            {/* Trust Badges */}
            <div className="mt-6 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5" /> Secure
                </span>
                <span className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5" /> Fast Delivery
                </span>
                <span className="flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Quality
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

