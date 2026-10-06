'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { productService } from '@/lib/services/product.service';
import { cartService } from '@/lib/services/cart.service';
import { addressService } from '@/lib/services/address.service';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCartStore } from '@/lib/store/cart-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { apiClient } from '@/lib/api-client';
import ProductReviews from '@/components/products/ProductReviews';
import { favoriteService } from '@/lib/services/favorite.service';
import CartConflictModal, { CartConflictInfo } from '@/components/cart/CartConflictModal';
import { Heart } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { browseMessages, availabilityKey, type BrowseT } from '@/lib/i18n/messages/browse';

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function getPromotionLabel(p: CatalogPromotion, t: BrowseT): string {
  if (p.type === 'percentage' && p.discountValue > 0) return t('pctOff', { value: p.discountValue });
  if (p.type === 'fixed' && p.discountValue > 0) return t('amountOff', { amount: formatPrice(p.discountValue) });
  return p.name || t('deal');
}

function getStackedDiscountedPrice(originalPrice: number, promos: CatalogPromotion[]): number {
  if (!promos?.length) return originalPrice;
  const sorted = [...promos].sort((a, b) => (a.type === 'percentage' && b.type === 'fixed' ? -1 : a.type === 'fixed' && b.type === 'percentage' ? 1 : 0));
  const result = sorted.reduce((price, p) => {
    if (p.type === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.type === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, originalPrice);
  return Math.round(result);
}

interface ProductDetail {
  id: string;
  availableToday?: boolean;
  menuLabel?: string | null;
  name: string;
  nameUrdu?: string;
  description: string;
  price: number;
  originalPrice?: number;
  unit: string;
  ratingAverage: number;
  totalReviews: number;
  images: Array<{ url: string; isPrimary: boolean }>;
  seller: {
    id: string;
    businessName: string;
    rating: number;
    isVerified: boolean;
    mealCategories?: string[];
    businessType?: string;
    preOrderOnly?: boolean;
    isAcceptingOrders?: boolean;
    acceptingOrdersReason?: string | null;
    availability?: {
      status: string;
      isOpen: boolean;
      opensAt: string | null;
      closesAt: string | null;
      nextOpenAt: string | null;
      reason: string | null;
    };
  };
  delivery?: {
    deliverable: boolean;
    fee: number;
    distanceKm: number | null;
    reason: string | null;
  } | null;
  estimatedDeliveryMinMinutes?: number | null;
  estimatedDeliveryMaxMinutes?: number | null;
  minOrderAmountForDelivery?: number | null;
  stock: {
    direct: number;
    hub: number;
  };
  stockQuantity?: number;
  variants: Array<{
    id: string;
    name: string;
    price: number;
    originalPrice?: number | null;
    stockQuantity: number;
    isDefault: boolean;
  }>;
  ingredients?: string | null;
  allergens?: string | null;
  dietaryInfo?: string[];
  heatingInstructions?: string | null;
  heatingInstructionsUrdu?: string | null;
}

export default function ProductDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(browseMessages);
  const tc = useT(commonMessages);
  const { addItem } = useCartStore();
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [catalogPromotions, setCatalogPromotions] = useState<CatalogPromotion[]>([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [stockType, setStockType] = useState<'direct' | 'hub'>('hub');
  const [selectedHub, setSelectedHub] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [addToCartLoading, setAddToCartLoading] = useState(false);
  const [justAddedToCart, setJustAddedToCart] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [cartConflict, setCartConflict] = useState<CartConflictInfo | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  useEffect(() => {
    const productId = params?.id as string | undefined;
    if (!productId) return;

    // 1. Immediately fetch product details without blocking on coordinates
    loadProduct();

    // 2. In parallel, fetch saved coordinates for precise hyperlocal delivery estimates
    if (isAuthenticated) {
      addressService
        .getAddresses()
        .then((res) => {
          const addresses = res.data || [];
          const withCoords =
            addresses.find((a) => a.isDefault && a.coordinates) ||
            addresses.find((a) => a.coordinates);
          if (withCoords?.coordinates) {
            loadProduct(
              withCoords.coordinates.latitude,
              withCoords.coordinates.longitude
            );
          }
        })
        .catch(() => {});
    }
  }, [params?.id, isAuthenticated]);

  // The product is fetched twice on load: once immediately, and again with the saved
  // address's coordinates for a precise delivery estimate. Without care the second
  // fetch flashed the full-page spinner, reset the customer's chosen variant and stock
  // type, and — if the responses arrived out of order — let the less precise one win.
  const loadSeqRef = useRef(0);
  const loadedProductRef = useRef<string | null>(null);
  const appliedSeqRef = useRef(0);

  const loadProduct = async (customerLat?: number, customerLng?: number) => {
    const requestedId = params.id as string;
    const seq = ++loadSeqRef.current;
    const isRefresh = loadedProductRef.current === requestedId; // same product already on screen
    if (!isRefresh) setLoading(true);
    try {
      const response = await productService.getProduct(requestedId, customerLat, customerLng);
      // Apply unless something newer has already been applied. (Not "unless a newer one is
      // merely in flight": if that one then fails, nothing would ever be shown.)
      if (seq < appliedSeqRef.current) return;
      const data = response.data as any;
      if (!data) return;
      appliedSeqRef.current = seq;
      loadedProductRef.current = requestedId;
      // Ensure stock shape (API may return stockQuantity only or stock: { hub, direct })
      const stockHub = data.stock?.hub ?? data.stockQuantity ?? 0;
      const stockDirect = data.stock?.direct ?? data.stockQuantity ?? 0;
      // Ensure seller shape so rating/toFixed and businessName never throw
      const seller = data.seller
        ? {
            id: data.seller.id ?? '',
            businessName: data.seller.businessName ?? data.seller.business_name ?? t('seller'),
            rating: Number(data.seller.rating ?? data.seller.ratingAverage ?? 0),
            isVerified: Boolean(data.seller.isVerified ?? data.seller.is_verified),
            mealCategories: Array.isArray(data.seller.mealCategories) ? data.seller.mealCategories : [],
            businessType: data.seller.businessType,
            preOrderOnly: Boolean(data.seller.preOrderOnly),
            isAcceptingOrders: Boolean(data.seller.isAcceptingOrders),
            acceptingOrdersReason: data.seller.acceptingOrdersReason ?? null,
            availability: data.seller.availability,
          }
        : { id: '', businessName: t('seller'), rating: 0, isVerified: false, mealCategories: [], preOrderOnly: false, isAcceptingOrders: false, acceptingOrdersReason: null, availability: undefined };
      // Normalize images: API may return imageUrl, frontend uses url
      const images = Array.isArray(data.images)
        ? data.images.map((img: { url?: string; imageUrl?: string; isPrimary?: boolean }) => ({
            url: img.url ?? img.imageUrl ?? '',
            isPrimary: Boolean(img.isPrimary),
          }))
        : [];

      const variants = Array.isArray(data.variants) ? data.variants : [];

      setProduct({
        ...data,
        images,
        stock: { hub: Number(stockHub), direct: Number(stockDirect) },
        seller,
        variants,
      });
      // Initial choices only on the first load of this product; a refresh keeps what the
      // customer already picked.
      if (!isRefresh) {
        if (Number(stockHub) === 0 && Number(stockDirect) > 0) {
          setStockType('direct');
        } else if (data.stockType === 'direct') {
          setStockType('direct');
        }
      }
      const defaultVariant = variants.find((v: { isDefault?: boolean }) => v.isDefault) ?? variants[0];
      setSelectedVariantId((current) =>
        isRefresh && current && variants.some((v: { id: string }) => v.id === current)
          ? current
          : defaultVariant?.id ?? null
      );
      // Fetch catalog promotions for this product (same as listing – stacked 30% + 5% etc.)
      try {
        const promRes = await apiClient.get<{ success: boolean; data: Record<string, CatalogPromotion[]> }>(
          `/promotions/catalog?productIds=${encodeURIComponent(data.id)}`
        );
        if (promRes.data?.success && promRes.data?.data?.[data.id]?.length) {
          setCatalogPromotions(promRes.data.data[data.id]);
        } else {
          setCatalogPromotions([]);
        }
      } catch {
        setCatalogPromotions([]);
      }

      if (seller.id && isAuthenticated) {
        try {
          const isFav = await favoriteService.checkFavorite(seller.id);
          setIsFavorite(isFav);
        } catch {
          setIsFavorite(false);
        }
      }
    } catch (error) {
      console.error('Failed to load product:', error);
    } finally {
      if (seq === loadSeqRef.current || loadedProductRef.current === requestedId) setLoading(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!product?.seller?.id) return;
    try {
      const res = await favoriteService.toggleFavorite(product.seller.id);
      const isFav = res.isFavorite;
      setIsFavorite(isFav);
      showToast(
        isFav
          ? t('toastSavedFav', { name: product.seller.businessName })
          : t('toastRemovedFav', { name: product.seller.businessName }),
        'info'
      );
    } catch {
      showToast(t('toastFavFailed'), 'error');
    }
  };

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (!product) return;

    const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
    const availableStock = selectedVariant
      ? selectedVariant.stockQuantity
      : stockType === 'direct' ? product.stock.direct : product.stock.hub;

    if (availableStock < quantity) {
      showToast(t('toastInsufficientStock'), 'error');
      return;
    }

    const unitPrice = selectedVariant
      ? selectedVariant.price
      : catalogPromotions.length > 0
        ? getStackedDiscountedPrice(product.price, catalogPromotions)
        : product.price;

    setAddToCartLoading(true);
    setJustAddedToCart(false);
    try {
      await cartService.addToCart({
        productId: product.id,
        variantId: selectedVariant?.id,
        quantity,
        stockType,
        hubId: stockType === 'hub' && selectedHub ? selectedHub : undefined,
      });
      addItem({
        id: `${product.id}-${selectedVariant?.id ?? stockType}-${Date.now()}`,
        productId: product.id,
        productName: selectedVariant ? `${product.name} — ${selectedVariant.name}` : product.name,
        productImage: product.images[0]?.url,
        sellerId: product.seller.id,
        sellerName: product.seller.businessName,
        quantity,
        unitPrice,
        stockType,
        hubId: stockType === 'hub' ? selectedHub : undefined,
        subtotal: unitPrice * quantity,
      });
      setJustAddedToCart(true);
      showToast(t('toastAddedLong'), 'success');
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.response?.data?.error?.code === 'CART_SELLER_MISMATCH') {
        const details = err?.response?.data?.error?.details;
        setCartConflict({
          existingSellerName: details?.existingSeller?.name || t('previousKitchen'),
          newSellerName: details?.newSeller?.name || product.seller.businessName || t('newKitchen'),
          onConfirmClearAndAdd: async () => {
            try {
              await cartService.addToCart({
                productId: product.id,
                variantId: selectedVariant?.id,
                quantity,
                stockType,
                hubId: stockType === 'hub' && selectedHub ? selectedHub : undefined,
                clearAndAdd: true,
              });
              addItem({
                id: `${product.id}-${selectedVariant?.id ?? stockType}-${Date.now()}`,
                productId: product.id,
                productName: selectedVariant ? `${product.name} — ${selectedVariant.name}` : product.name,
                productImage: product.images[0]?.url,
                sellerId: product.seller.id,
                sellerName: product.seller.businessName,
                quantity,
                unitPrice,
                stockType,
                hubId: stockType === 'hub' ? selectedHub : undefined,
                subtotal: unitPrice * quantity,
              });
              setCartConflict(null);
              setJustAddedToCart(true);
              showToast(t('toastCartReplaced', { kitchen: product.seller.businessName }), 'success');
            } catch {
              showToast(t('toastReplaceCartFailed'), 'error');
            }
          },
          onCancel: () => setCartConflict(null),
        });
      } else {
        const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || t('toastAddToCartFailed');
        showToast(msg, 'error');
      }
    } finally {
      setAddToCartLoading(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (!product) return;
    setAddToCartLoading(true);
    try {
      await cartService.addToCart({
        productId: product.id,
        variantId: selectedVariantId || undefined,
        quantity,
        stockType: 'direct',
      });
      router.push('/checkout');
    } catch (err: any) {
      if (err?.response?.data?.error?.code === 'CART_SELLER_CONFLICT' || err?.response?.data?.code === 'CART_SELLER_CONFLICT') {
        const conflictDetails = err.response.data.error?.details || err.response.data.details;
        setCartConflict({
          existingSellerName: conflictDetails?.existingSellerName || t('anotherKitchen'),
          newSellerName: product.seller.businessName,
          onConfirmClearAndAdd: async () => {
            try {
              await cartService.addToCart({
                productId: product.id,
                variantId: selectedVariantId || undefined,
                quantity,
                stockType: 'direct',
                clearAndAdd: true,
              });
              setCartConflict(null);
              router.push('/checkout');
            } catch {
              showToast(t('toastSwitchKitchenFailed'), 'error');
            }
          },
          onCancel: () => setCartConflict(null),
        });
      } else {
        const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || t('toastInstantCheckoutFailed');
        showToast(msg, 'error');
      }
    } finally {
      setAddToCartLoading(false);
    }
  };

  if (loading) {
    if (isAuthenticated) {
      return (
        <DashboardLayout
          title={t('loadingTitle')}
          subtitle={t('pleaseWait')}
          sidebarItems={sidebarItems}
          userType="customer"
        >
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
              <p className="text-gray-600">{t('loadingProduct')}</p>
            </div>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream-50)" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loadingProduct')}</p>
        </div>
      </div>
    );
  }

  if (!product) {
    if (isAuthenticated) {
      return (
        <DashboardLayout
          title={t('notFoundTitle')}
          subtitle={t('notFoundSubtitle')}
          sidebarItems={sidebarItems}
          userType="customer"
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🔍</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">{t('notFoundTitle')}</h2>
            <p className="text-gray-500 mb-6">{t('notFoundBody')}</p>
            <Link href="/products">
              <Button className="bg-gray-700 hover:bg-gray-800">
                <span className="me-2">🛍️</span> {t('browseProducts')}
              </Button>
            </Link>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream-50)" }}>
        <div className="text-center">
          <p className="text-gray-600 mb-4">{t('notFoundShort')}</p>
          <Link href="/products">
            <Button className="bg-gray-700 hover:bg-gray-800">{t('backToProducts')}</Button>
          </Link>
        </div>
      </div>
    );
  }

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId) ?? null;
  const unitPrice = selectedVariant
    ? selectedVariant.price
    : catalogPromotions.length > 0
      ? getStackedDiscountedPrice(product.price, catalogPromotions)
      : product.price;
  const maxQty = selectedVariant
    ? selectedVariant.stockQuantity
    : stockType === 'direct' ? product.stock.direct : product.stock.hub;

  const productContent = (
    <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">
      {/* Product Images - left column */}
      <div className="lg:sticky lg:top-24 self-start">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="aspect-square max-h-[480px] bg-gray-50 flex items-center justify-center overflow-hidden">
            {product.images[selectedImage]?.url ? (
              <img
                src={product.images[selectedImage].url}
                alt={product.name}
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-gray-400 text-sm text-center px-4 py-8">
                {t('noImages')}
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <div className="p-4 pt-0 flex gap-2 overflow-x-auto">
              {product.images.slice(0, 6).map((image, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  className={`flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 transition-all ${
                    selectedImage === index
                      ? 'border-gray-700 ring-2 ring-gray-200'
                      : 'border-transparent hover:border-gray-300'
                  }`}
                >
                  <img
                    src={image.url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Product Info - right column */}
      <div className="space-y-6 lg:min-w-0">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/products" className="hover:text-gray-900 transition-colors">
            {t('breadcrumbProducts')}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-gray-900 truncate">{product.name}</span>
        </nav>

        {/* Title & meta */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight mb-1">
            {product.name}
          </h1>
          {product.nameUrdu && (
            <p className="text-lg text-gray-600 mb-4">{product.nameUrdu}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
              {product.totalReviews > 0
                ? `★ ${product.ratingAverage.toFixed(1)} · ${t('reviewsCount', { count: product.totalReviews })}`
                : t('new')}
            </span>
            {(product.stock.hub + product.stock.direct) > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                {t('inStock')}
              </span>
            )}
          </div>
        </div>

        {/* Price block - clear hierarchy */}
        <div className="rounded-2xl bg-gray-50 border border-gray-100 p-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl sm:text-4xl font-bold text-gray-900">
              {formatPrice(catalogPromotions.length > 0 ? unitPrice : Math.round(product.price))}
            </span>
            {(catalogPromotions.length > 0 || (product.originalPrice != null && product.originalPrice > product.price)) && (
              <span className="text-lg text-gray-500 line-through">
                {formatPrice(catalogPromotions.length > 0 ? product.price : Math.round(product.originalPrice ?? 0))}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {catalogPromotions.length > 0 && (
              <span className="text-sm font-medium text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                {catalogPromotions.length === 1
                  ? getPromotionLabel(catalogPromotions[0], t)
                  : catalogPromotions.map((p) => getPromotionLabel(p, t)).join(' + ')}
              </span>
            )}
            {catalogPromotions.length === 0 &&
              product.originalPrice != null &&
              Math.round(product.originalPrice) > Math.round(product.price) && (
                <span className="text-sm font-medium text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                  {t('pctOff', { value: Math.round((1 - product.price / product.originalPrice) * 100) })}
                </span>
              )}
            <span className="text-gray-500 text-sm">{t('perUnit', { unit: product.unit })}</span>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
              {t('description')}
            </h2>
            <p className="text-gray-700 leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* Allergens, dietary info, ingredients & heating instructions —
            purchasing-decision info a customer needs before buying food. */}
        {(product.allergens ||
          (product.dietaryInfo && product.dietaryInfo.length > 0) ||
          product.ingredients ||
          product.heatingInstructions) && (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            {product.allergens && (
              <div>
                <h3 className="text-xs font-semibold text-amber-900 uppercase tracking-wider mb-1">
                  {t('allergens')}
                </h3>
                <p className="text-sm text-amber-900">{product.allergens}</p>
              </div>
            )}
            {product.dietaryInfo && product.dietaryInfo.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.dietaryInfo.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {product.ingredients && (
              <div>
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  {t('ingredients')}
                </h3>
                <p className="text-sm text-gray-700">{product.ingredients}</p>
              </div>
            )}
            {product.heatingInstructions && (
              <div>
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  {t('heating')}
                </h3>
                <p className="text-sm text-gray-700">{product.heatingInstructions}</p>
                {product.heatingInstructionsUrdu && (
                  <p className="text-sm text-gray-600 mt-1">{product.heatingInstructionsUrdu}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Seller & Community Card */}
        <div className="py-4 border-y border-gray-100 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-100 text-[#FF5500] flex items-center justify-center font-black text-sm">
                👩‍🍳
              </div>
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">
                  {t('homeKitchen')}
                </p>
                <p className="font-bold text-gray-900 flex items-center gap-2">
                  <span>{product.seller?.businessName ?? t('seller')}</span>
                  {product.seller?.isVerified && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                      {t('verifiedChef')}
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleFavorite}
                className="p-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-colors shadow-2xs"
                title={t('saveKitchenFav')}
              >
                <Heart
                  className={`w-4 h-4 transition-colors ${
                    isFavorite ? 'fill-red-500 text-red-500' : 'text-slate-400 hover:text-red-500'
                  }`}
                />
              </button>
              <div className="text-end">
                <p className="text-[11px] text-gray-400 font-bold uppercase">{t('rating')}</p>
                <p className="font-black text-sm text-gray-900">{product.seller?.rating ? `★ ${product.seller.rating.toFixed(1)}` : t('new')}</p>
              </div>
            </div>
          </div>

          {/* Proximity / Community Badge */}
          {((product as any).isSameCommunity || (product as any).communityBadge || (product as any).community?.name) && (
            <div className="pt-2 flex items-center gap-2">
              {(product as any).isSameCommunity ? (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 text-xs font-black flex items-center gap-1.5">
                  <span>🏡</span> {t('inYourCommunity')}
                </span>
              ) : (product as any).communityBadge ? (
                <span className="px-2.5 py-1 rounded-lg bg-orange-100 text-[#FF5500] text-xs font-black flex items-center gap-1.5">
                  <span>📍</span> {(product as any).communityBadge}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5">
                  <span>📍</span> {(product as any).community?.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Availability */}
        {product.seller?.availability && (
          <div className={`flex items-center justify-between py-3 px-4 rounded-xl ${
            product.seller.availability.isOpen ? 'bg-green-50' : 'bg-gray-50'
          }`}>
            <div>
              <p className={`text-sm font-semibold ${product.seller.availability.isOpen ? 'text-green-700' : 'text-gray-600'}`}>
                {product.seller.availability.isOpen
                  ? t('openNowLower')
                  : product.seller.availability.status !== 'closed'
                  ? t('closedWithStatus', {
                      status: (() => {
                        const key = availabilityKey(product.seller.availability.status);
                        return key ? t(key) : product.seller.availability.status.replace('_', ' ');
                      })(),
                    })
                  : t('closed')}
              </p>
              {product.seller.availability.isOpen && product.seller.availability.closesAt && (
                <p className="text-xs text-gray-500">{t('closesAt', { time: formatClock(product.seller.availability.closesAt) })}</p>
              )}
              {!product.seller.availability.isOpen && product.seller.availability.opensAt && (
                <p className="text-xs text-gray-500">{t('opensAt', { time: formatClock(product.seller.availability.opensAt) })}</p>
              )}
              {!product.seller.availability.isOpen && product.seller.availability.reason && (
                <p className="text-xs text-gray-500">{product.seller.availability.reason}</p>
              )}
            </div>
            {product.seller.preOrderOnly && (
              <span className="text-xs font-medium bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                {t('preOrdersOnly')}
              </span>
            )}
          </div>
        )}
        {product.seller && (
          <p className={`text-sm font-medium -mt-2 ${product.seller.isAcceptingOrders ? 'text-green-700' : 'text-red-600'}`}>
            {product.seller.isAcceptingOrders
              ? product.seller.preOrderOnly ? t('acceptingPreOrders') : t('acceptingOrders')
              : product.seller.acceptingOrdersReason || t('notAccepting')}
          </p>
        )}
        {product.seller?.mealCategories && product.seller.mealCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 -mt-2">
            {product.seller.mealCategories.map((c) => (
              <span key={c} className="text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full capitalize">
                {c.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Delivery to you — real fee/distance/ETA once we know an address; an
            honest prompt instead of a guess when we don't. */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            {t('deliveryToYou')}
          </h3>
          {product.delivery ? (
            <>
              <p className="text-sm text-gray-800">
                {product.delivery.deliverable
                  ? `${product.delivery.fee === 0 ? t('freeDelivery') : t('deliveryFeeAmount', { amount: formatPrice(product.delivery.fee) })}${
                      product.estimatedDeliveryMinMinutes != null
                        ? ` · ${t('etaMin', { min: product.estimatedDeliveryMinMinutes, max: product.estimatedDeliveryMaxMinutes })}`
                        : ''
                    }${product.delivery.distanceKm != null ? ` · ${t('kmAway', { km: product.delivery.distanceKm })}` : ''}`
                  : product.delivery.reason || t('notDeliverable')}
              </p>
              {product.minOrderAmountForDelivery ? (
                <p className="text-xs text-gray-500 mt-0.5">{t('minOrder', { amount: formatPrice(product.minOrderAmountForDelivery) })}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-gray-500">
              {isAuthenticated ? (
                <>
                  {t('addAddressBefore')}
                  <Link href="/profile/addresses" className="underline hover:no-underline">{t('addAddressLink')}</Link>
                  {t('addAddressAfter')}
                </>
              ) : (
                t('signInAddAddress')
              )}
            </p>
          )}
        </div>

        {/* Purchase card - sticky on large screens */}
        <div className="lg:sticky lg:top-24 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          {product.variants.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">{t('options')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedVariantId(null)}
                  disabled={product.stockQuantity !== undefined && product.stockQuantity <= 0}
                  className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    selectedVariantId === null
                      ? 'border-gray-900 bg-gray-900 text-white'
                      : 'border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {product.name} ({product.unit}) · {formatPrice(product.price)}
                  {product.stockQuantity !== undefined && product.stockQuantity <= 0 && t('outOfStock')}
                </button>
                {product.variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVariantId(v.id)}
                    disabled={v.stockQuantity <= 0}
                    className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                      selectedVariantId === v.id
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {v.name} · {formatPrice(v.price)}
                    {v.stockQuantity <= 0 && t('outOfStock')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-lg font-semibold text-gray-900">{t('deliveryQty')}</h2>

          {/* Delivery type */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">{t('deliveryType')}</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStockType('hub')}
                className={`p-4 rounded-xl border-2 text-start transition-all ${
                  stockType === 'hub'
                    ? 'border-gray-700 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <p className="font-semibold text-gray-900">{t('hubDelivery')}</p>
                <p className="text-sm text-gray-500 mt-0.5">
                  {product.estimatedDeliveryMinMinutes != null
                    ? t('etaMin', { min: product.estimatedDeliveryMinMinutes, max: product.estimatedDeliveryMaxMinutes })
                    : t('addAddressEta')}
                </p>
                <p className="text-xs text-gray-600 mt-1">{t('available', { count: product.stock.hub })}</p>
              </button>
              <button
                type="button"
                onClick={() => setStockType('direct')}
                className={`p-4 rounded-xl border-2 text-start transition-all ${
                  stockType === 'direct'
                    ? 'border-gray-700 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <p className="font-semibold text-gray-900">{t('direct')}</p>
                <p className="text-sm text-gray-500 mt-0.5">{t('nextDay')}</p>
                <p className="text-xs text-gray-600 mt-1">{t('available', { count: product.stock.direct })}</p>
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">{t('quantity')}</p>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-xl border-2 border-gray-200 bg-gray-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-12 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-100 font-medium text-lg transition-colors"
                  aria-label={t('decreaseQty')}
                >
                  −
                </button>
                <span
                  className="w-12 h-12 flex items-center justify-center font-bold text-gray-900 text-lg border-x border-gray-200 bg-white"
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  disabled={quantity >= maxQty}
                  className="w-12 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-lg transition-colors"
                  aria-label={t('increaseQty')}
                >
                  +
                </button>
              </div>
              <span className="text-gray-500 text-sm">{product.unit}</span>
            </div>
          </div>

          {/* Special Instructions (Section 9) */}
          <div className="pt-2">
            <label htmlFor="specialInstructions" className="block text-xs font-bold text-gray-700 mb-1">
              {t('specialInstructions')}
            </label>
            <textarea
              id="specialInstructions"
              rows={2}
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder={t('specialPlaceholder')}
              className="w-full text-xs p-3 rounded-xl border border-gray-200 focus:border-[#FF5500] focus:ring-1 focus:ring-[#FF5500] outline-none transition-all resize-none bg-white"
            />
          </div>

          {/* Action Buttons: Add to Bag & Buy Now */}
          <div className="pt-2 space-y-2">
            {product.menuLabel && (
              <p className={`text-sm font-semibold rounded-xl px-3 py-2 ${product.availableToday === false ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`} data-testid="menu-note">
                {product.availableToday === false ? t('notOnMenuToday', { days: product.menuLabel }) : t('onMenuNote', { days: product.menuLabel })}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={handleAddToCart}
                variant="dark"
                className="w-full h-12 text-sm font-bold bg-[#0C1016] text-white hover:bg-black rounded-xl"
                disabled={maxQty < quantity || addToCartLoading || product.availableToday === false}
              >
                {addToCartLoading ? t('adding') : t('addToBag', { amount: formatPrice(unitPrice * quantity) })}
              </Button>
              <Button
                onClick={handleBuyNow}
                className="w-full h-12 text-sm font-bold bg-gradient-to-r from-[#FF5500] to-[#FF2A00] hover:brightness-110 text-white shadow-sm rounded-xl"
                disabled={maxQty < quantity || addToCartLoading || product.availableToday === false}
              >
                {t('buyNow')}
              </Button>
            </div>
            {justAddedToCart && (
              <p className="text-center text-sm text-gray-600">
                <Link href="/cart" className="font-medium text-gray-900 underline hover:no-underline">
                  {t('viewCart')}
                </Link>
                {t('itemSaved')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>

    <div className="mt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{t('reviews')}</h2>
      <ProductReviews productId={product.id} />
    </div>
    </>
  );

  // For authenticated users, wrap in DashboardLayout
  if (isAuthenticated) {
    return (
      <DashboardLayout
        title={product.name}
        subtitle={t('productDetails')}
        sidebarItems={sidebarItems}
        userType="customer"
      >
        {productContent}
        <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
      </DashboardLayout>
    );
  }

  // For public users, show a simple layout
  return (
    <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
      <nav
        className="sticky top-0 z-50 backdrop-blur-md"
        style={{ background: 'rgba(251,248,241,0.94)', borderBottom: '1px solid var(--ink-100)' }}
      >
        <div className="max-w-[1440px] mx-auto px-6 md:px-12">
          <div className="flex items-center justify-between h-[72px]">
            <Link href="/" className="flex items-center gap-3">
              <span className="brand-mark" style={{ width: 32, height: 32 }} aria-hidden>
                <span style={{ fontSize: 20, marginTop: 1 }}>N</span>
              </span>
              <span
                className="font-display italic"
                style={{ fontSize: 26, color: 'var(--ink-900)', fontWeight: 400 }}
              >
                nuray
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <Link href="/products" className="text-[13px] font-medium" style={{ color: 'var(--ink-800)' }}>
                {t('todaysPlates')}
              </Link>
              <Link href="/login" className="text-[13px] font-medium" style={{ color: 'var(--ink-800)' }}>
                {tc('signIn')}
              </Link>
              <Link href="/register">
                <Button>{t('joinNuray')}</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-10 md:py-14">
        {productContent}
      </div>
      <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
    </div>
  );
}

