'use client';

import { useEffect, useRef, useState } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { getPromotionLabel, getStackedDiscountedPrice } from '@/lib/pricing';
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
import { SiteHeader } from '@/components/layout/SiteHeader';
import { CoverImage } from '@/components/ui/CoverImage';
import { apiClient, apiErrorCode, apiErrorStatus, apiErrorDetails, errorMessage, type CartConflictDetails } from '@/lib/api-client';
import { LoadError } from '@/components/ui/LoadError';
import ProductReviews from '@/components/products/ProductReviews';
import { favoriteService } from '@/lib/services/favorite.service';
import CartConflictModal, { CartConflictInfo } from '@/components/cart/CartConflictModal';
import { Heart } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { browseMessages, availabilityKey, type BrowseT } from '@/lib/i18n/messages/browse';
import { useShallow } from 'zustand/react/shallow';

interface CatalogPromotion {
  id: string;
  name: string;
  type: string;
  discountValue: number;
}

function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * GET /products/:id as it may arrive: stock as one number or per channel, images with `imageUrl`, and seller fields
 * that older rows spell in snake_case. The page reads it into a ProductDetail.
 */
export type RawProduct = Omit<ProductDetail, 'images' | 'stock' | 'seller' | 'variants'> & {
  stock?: { hub?: number; direct?: number };
  stockQuantity?: number;
  stockType?: string;
  images?: Array<{ url?: string; imageUrl?: string; isPrimary?: boolean }>;
  variants?: ProductDetail['variants'];
  seller?: Partial<Omit<ProductDetail['seller'], 'rating'>> & {
    business_name?: string;
    is_verified?: boolean;
    rating?: number | string;
    ratingAverage?: number | string;
  };
};

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
  /**
   * How close the kitchen is to the viewer's community. Only the dish list carries these; the dish's own answer does not,
   * so the badge below shows only if a response ever fills them in.
   */
  community?: { name: string } | null;
  communityBadge?: string;
  isSameCommunity?: boolean;
}

/** A dish as the page shows it, from the API's answer (also the server's copy the page starts from). */
function normalizeProduct(data: RawProduct, sellerFallback: string): ProductDetail {
  // Ensure stock shape (API may return stockQuantity only or stock: { hub, direct })
  const stockHub = data.stock?.hub ?? data.stockQuantity ?? 0;
  const stockDirect = data.stock?.direct ?? data.stockQuantity ?? 0;
  // Ensure seller shape so rating/toFixed and businessName never throw
  const seller = data.seller
    ? {
        id: data.seller.id ?? '',
        businessName: data.seller.businessName ?? data.seller.business_name ?? sellerFallback,
        rating: Number(data.seller.rating ?? data.seller.ratingAverage ?? 0),
        isVerified: Boolean(data.seller.isVerified ?? data.seller.is_verified),
        mealCategories: Array.isArray(data.seller.mealCategories) ? data.seller.mealCategories : [],
        businessType: data.seller.businessType,
        preOrderOnly: Boolean(data.seller.preOrderOnly),
        isAcceptingOrders: Boolean(data.seller.isAcceptingOrders),
        acceptingOrdersReason: data.seller.acceptingOrdersReason ?? null,
        availability: data.seller.availability,
      }
    : { id: '', businessName: sellerFallback, rating: 0, isVerified: false, mealCategories: [], preOrderOnly: false, isAcceptingOrders: false, acceptingOrdersReason: null, availability: undefined };
  // Normalize images: API may return imageUrl, frontend uses url
  const images = Array.isArray(data.images)
    ? data.images.map((img: { url?: string; imageUrl?: string; isPrimary?: boolean }) => ({
        url: img.url ?? img.imageUrl ?? '',
        isPrimary: Boolean(img.isPrimary),
      }))
    : [];

  const variants = Array.isArray(data.variants) ? data.variants : [];

  return {
    ...data,
    images,
    stock: { hub: Number(stockHub), direct: Number(stockDirect) },
    seller,
    variants,
  };
}

/** Where the dish is bought from at first: from the kitchen when only it has stock, or when the dish says so. */
function initialStockType(data: RawProduct, dish: ProductDetail): 'direct' | 'hub' {
  if (dish.stock.hub === 0 && dish.stock.direct > 0) return 'direct';
  return data.stockType === 'direct' ? 'direct' : 'hub';
}

const defaultVariantId = (dish: ProductDetail) => (dish.variants.find((v) => v.isDefault) ?? dish.variants[0])?.id ?? null;

/**
 * `initial` is the server's copy of the dish (the same public read the page's link preview uses): with it the page is
 * rendered with the dish on the server, and the browser then refreshes it for the signed-in customer and their address.
 */
export default function ProductDetailPage({ initial }: { initial?: RawProduct }) {
  const params = useParams();
  const router = useRouter();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { showToast } = useToast();
  const t = useT(browseMessages);
  const tc = useT(commonMessages);
  const { addItem } = useCartStore(useShallow((s) => ({ addItem: s.addItem })));
  const [first] = useState(() => (initial ? normalizeProduct(initial, t('seller')) : null));
  const [product, setProduct] = useState<ProductDetail | null>(first);
  const [catalogPromotions, setCatalogPromotions] = useState<CatalogPromotion[]>([]);
  const [loading, setLoading] = useState(!first);
  // Why the dish could not be read when it was not a 404: a dish that could not be read is not a dish that does not exist.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [quantity, setQuantity] = useState(1);
  const [stockType, setStockType] = useState<'direct' | 'hub'>(() => (initial && first ? initialStockType(initial, first) : 'hub'));
  const [selectedHub, setSelectedHub] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [addToCartLoading, setAddToCartLoading] = useState(false);
  const [justAddedToCart, setJustAddedToCart] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(() => (first ? defaultVariantId(first) : null));
  const [isFavorite, setIsFavorite] = useState(false);
  const [cartConflict, setCartConflict] = useState<CartConflictInfo | null>(null);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  // The product is fetched twice on load: once immediately, and again with the saved
  // address's coordinates for a precise delivery estimate. Without care the second
  // fetch flashed the full-page spinner, reset the customer's chosen variant and stock
  // type, and — if the responses arrived out of order — let the less precise one win.
  const loadSeqRef = useRef(0);
  // The server's copy counts as loaded: the first browser read refreshes it without the spinner or resetting choices.
  const loadedProductRef = useRef<string | null>(first ? (params.id as string) : null);
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
      // The service types the list item; the detail endpoint sends more (delivery, variants, per-channel stock).
      const data = response.data as unknown as RawProduct | undefined;
      if (!data) return;
      appliedSeqRef.current = seq;
      loadedProductRef.current = requestedId;
      setLoadError(null);
      const next = normalizeProduct(data, t('seller'));
      setProduct(next);
      // Initial choices only on the first load of this product; a refresh keeps what the
      // customer already picked.
      if (!isRefresh) setStockType(initialStockType(data, next));
      setSelectedVariantId((current) =>
        isRefresh && current && next.variants.some((v) => v.id === current) ? current : defaultVariantId(next)
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

      if (next.seller.id && isAuthenticated) {
        try {
          const isFav = await favoriteService.checkFavorite(next.seller.id);
          setIsFavorite(isFav);
        } catch {
          setIsFavorite(false);
        }
      }
    } catch (error) {
      console.error('Failed to load product:', error);
      // A dish already on screen stays; with none, only a 404 says it does not exist, anything else is a read that failed.
      if (!isRefresh) setLoadError((error as { response?: { status?: number } })?.response?.status === 404 ? null : error);
    } finally {
      if (seq === loadSeqRef.current || loadedProductRef.current === requestedId) setLoading(false);
    }
  };

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

  const handleToggleFavorite = async () => {
    if (!isAuthenticated) {
      router.push(loginUrlHere());
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
      router.push(loginUrlHere());
      return;
    }

    if (!product) return;

    // A kitchen that is closed, busy or away takes no orders. Say so now, as the kitchen's own page does, instead of letting the
    // dish sit in a bag that cannot be checked out.
    if (product.seller?.id && product.seller.isAcceptingOrders === false) {
      showToast(product.seller.acceptingOrdersReason || t('toastKitchenClosed', { name: product.seller.businessName }), 'error');
      return;
    }

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
    } catch (err) {
      if (apiErrorStatus(err) === 409 || apiErrorCode(err) === 'CART_SELLER_MISMATCH') {
        const details = apiErrorDetails(err) as CartConflictDetails | undefined;
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
        const msg = errorMessage(err, t('toastAddToCartFailed'));
        showToast(msg, 'error');
      }
    } finally {
      setAddToCartLoading(false);
    }
  };

  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    if (!product) return;

    // A kitchen that is closed, busy or away takes no orders. Say so now, as the kitchen's own page does, instead of letting the
    // dish sit in a bag that cannot be checked out.
    if (product.seller?.id && product.seller.isAcceptingOrders === false) {
      showToast(product.seller.acceptingOrdersReason || t('toastKitchenClosed', { name: product.seller.businessName }), 'error');
      return;
    }
    setAddToCartLoading(true);
    try {
      await cartService.addToCart({
        productId: product.id,
        variantId: selectedVariantId || undefined,
        quantity,
        stockType: 'direct',
      });
      router.push('/checkout');
    } catch (err) {
      // The tray holds another kitchen: ask what to do, as "Add to Bag" does (the code is the server's CART_SELLER_MISMATCH).
      if (apiErrorStatus(err) === 409 || apiErrorCode(err) === 'CART_SELLER_MISMATCH') {
        const conflictDetails = apiErrorDetails(err) as CartConflictDetails | undefined;
        setCartConflict({
          existingSellerName: conflictDetails?.existingSeller?.name || t('anotherKitchen'),
          newSellerName: conflictDetails?.newSeller?.name || product.seller.businessName,
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
        const msg = errorMessage(err, t('toastInstantCheckoutFailed'));
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
              <p className="text-muted">{t('loadingProduct')}</p>
            </div>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
          <p className="text-muted">{t('loadingProduct')}</p>
        </div>
      </div>
    );
  }

  if (!product && loadError) {
    const failed = <LoadError error={loadError} onRetry={() => void loadProduct()} />;
    return isAuthenticated ? (
      <DashboardLayout title={tc('loadFailedTitle')} subtitle="" sidebarItems={sidebarItems} userType="customer">
        {failed}
      </DashboardLayout>
    ) : (
      <div className="min-h-screen bg-page flex items-center justify-center p-6">
        <div className="w-full max-w-lg">{failed}</div>
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
          <div className="bg-surface rounded-[20px] border border-dashed border-line-strong p-12 text-center">
            <div className="w-20 h-20 bg-raised rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🔍</span>
            </div>
            <h2 className="text-2xl font-bold text-ink mb-3">{t('notFoundTitle')}</h2>
            <p className="text-muted mb-6">{t('notFoundBody')}</p>
            <Link href="/products">
              <Button>
                <span className="me-2">🛍️</span> {t('browseProducts')}
              </Button>
            </Link>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen bg-page flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">{t('notFoundShort')}</p>
          <Link href="/products">
            <Button>{t('backToProducts')}</Button>
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
      <div className="lg:sticky lg:top-[calc(6rem+var(--safe-top))] self-start">
        <div className="bg-surface rounded-[24px] border border-line overflow-hidden">
          <div className="aspect-[4/3] lg:aspect-square lg:max-h-[520px] bg-raised flex items-center justify-center overflow-hidden">
            {product.images[selectedImage]?.url ? (
              <img
                src={product.images[selectedImage].url}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <CoverImage alt={t('noImages')} label={product.name} size="lg" className="w-full h-full" />
            )}
          </div>
          {product.images.length > 1 && (
            <div className="p-3 flex gap-2 overflow-x-auto">
              {product.images.slice(0, 6).map((image, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setSelectedImage(index)}
                  aria-label={t('showPhoto', { n: index + 1 })}
                  aria-pressed={selectedImage === index}
                  className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all ${
                    selectedImage === index ? 'ring-[3px] ring-brand ring-offset-2 ring-offset-surface' : 'opacity-80 hover:opacity-100'
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
        <nav aria-label={t('breadcrumbLabel')} className="flex items-center gap-2 text-sm text-muted">
          <Link href="/products" className="font-semibold text-brand-ink hover:underline">
            {t('breadcrumbProducts')}
          </Link>
          <span aria-hidden>/</span>
          <span className="text-ink truncate">{product.name}</span>
        </nav>

        {/* Title & meta */}
        <div>
          <h1 className="text-[28px] sm:text-[36px] leading-tight font-extrabold text-ink tracking-tight mb-1">
            {product.name}
          </h1>
          {product.nameUrdu && (
            <p className="text-lg text-muted mb-4">{product.nameUrdu}</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-accent-soft text-accent-soft-ink px-3 py-1.5 rounded-full text-sm font-bold">
              {product.totalReviews > 0
                ? `★ ${product.ratingAverage.toFixed(1)} · ${t('reviewsCount', { count: product.totalReviews })}`
                : t('new')}
            </span>
            {(product.stock.hub + product.stock.direct) > 0 && (
              <span className="inline-flex items-center bg-brand-soft text-brand-soft-ink px-3 py-1.5 rounded-full text-sm font-bold">
                {t('inStock')}
              </span>
            )}
          </div>
        </div>

        {/* Price block - clear hierarchy */}
        <div className="rounded-[20px] bg-raised p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-3xl sm:text-4xl font-extrabold text-ink">
              {formatPrice(catalogPromotions.length > 0 ? unitPrice : Math.round(product.price))}
            </span>
            {(catalogPromotions.length > 0 || (product.originalPrice != null && product.originalPrice > product.price)) && (
              <span className="text-lg text-muted line-through">
                {formatPrice(catalogPromotions.length > 0 ? product.price : Math.round(product.originalPrice ?? 0))}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {catalogPromotions.length > 0 && (
              <span className="text-sm font-extrabold bg-accent text-on-accent px-2.5 py-1 rounded-full">
                {catalogPromotions.length === 1
                  ? getPromotionLabel(catalogPromotions[0], t, formatPrice)
                  : catalogPromotions.map((p) => getPromotionLabel(p, t, formatPrice)).join(' + ')}
              </span>
            )}
            {catalogPromotions.length === 0 &&
              product.originalPrice != null &&
              Math.round(product.originalPrice) > Math.round(product.price) && (
                <span className="text-sm font-extrabold bg-accent text-on-accent px-2.5 py-1 rounded-full">
                  {t('percentOff', { value: Math.round((1 - product.price / product.originalPrice) * 100) })}
                </span>
              )}
            <span className="text-muted text-sm">{t('perUnit', { unit: product.unit })}</span>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div>
            <h2 className="text-base font-extrabold text-ink mb-2">
              {t('description')}
            </h2>
            <p className="text-ink leading-relaxed">{product.description}</p>
          </div>
        )}

        {/* Allergens, dietary info, ingredients & heating instructions —
            purchasing-decision info a customer needs before buying food. */}
        {(product.allergens ||
          (product.dietaryInfo && product.dietaryInfo.length > 0) ||
          product.ingredients ||
          product.heatingInstructions) && (
          <div className="space-y-3 rounded-[20px] bg-accent-soft p-4 sm:p-5">
            {product.allergens && (
              <div>
                <h3 className="text-xs font-extrabold text-accent-soft-ink uppercase tracking-wider mb-1">
                  {t('allergens')}
                </h3>
                <p className="text-sm text-accent-soft-ink">{product.allergens}</p>
              </div>
            )}
            {product.dietaryInfo && product.dietaryInfo.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {product.dietaryInfo.map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 text-xs font-bold rounded-full bg-surface text-ink"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
            {product.ingredients && (
              <div>
                <h3 className="text-xs font-extrabold text-accent-soft-ink uppercase tracking-wider mb-1">
                  {t('ingredients')}
                </h3>
                <p className="text-sm text-accent-soft-ink">{product.ingredients}</p>
              </div>
            )}
            {product.heatingInstructions && (
              <div>
                <h3 className="text-xs font-extrabold text-accent-soft-ink uppercase tracking-wider mb-1">
                  {t('heating')}
                </h3>
                <p className="text-sm text-accent-soft-ink">{product.heatingInstructions}</p>
                {product.heatingInstructionsUrdu && (
                  <p className="text-sm text-accent-soft-ink mt-1">{product.heatingInstructionsUrdu}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Seller & Community Card */}
        <div className="rounded-[20px] border border-line bg-surface p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-brand-soft text-brand-soft-ink flex items-center justify-center font-black text-base" aria-hidden>
                👩‍🍳
              </div>
              <div>
                <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-0.5">
                  {t('homeKitchen')}
                </p>
                <p className="font-bold text-ink flex items-center gap-2">
                  {product.seller?.id ? (
                    <Link href={`/kitchens/${product.seller.id}`} className="hover:underline">
                      {product.seller.businessName}
                    </Link>
                  ) : (
                    <span>{product.seller?.businessName ?? t('seller')}</span>
                  )}
                  {product.seller?.isVerified && (
                    <span className="text-[11px] font-extrabold text-brand-soft-ink bg-brand-soft px-2 py-0.5 rounded-full">
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
                className="w-10 h-10 flex items-center justify-center rounded-full border border-line bg-surface hover:bg-raised transition-colors"
                title={t('saveKitchenFav')}
                aria-label={t('saveKitchenFav')}
                aria-pressed={isFavorite}
              >
                <Heart
                  className={`w-4 h-4 transition-colors ${
                    isFavorite ? 'fill-red-500 text-red-500' : 'text-muted hover:text-red-500'
                  }`}
                />
              </button>
              <div className="text-end">
                <p className="text-[11px] text-muted font-bold uppercase">{t('rating')}</p>
                <p className="font-black text-sm text-ink">{product.seller?.rating ? `★ ${product.seller.rating.toFixed(1)}` : t('new')}</p>
              </div>
            </div>
          </div>

          {/* Proximity / Community Badge */}
          {(product.isSameCommunity || product.communityBadge || product.community?.name) && (
            <div className="pt-2 flex items-center gap-2">
              {product.isSameCommunity ? (
                <span className="px-2.5 py-1 rounded-full bg-brand-soft text-brand-soft-ink text-xs font-extrabold flex items-center gap-1.5">
                  <span>🏡</span> {t('inYourCommunity')}
                </span>
              ) : product.communityBadge ? (
                <span className="px-2.5 py-1 rounded-full bg-brand-soft text-brand-soft-ink text-xs font-extrabold flex items-center gap-1.5">
                  <span>📍</span> {product.communityBadge}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-raised text-ink text-xs font-bold flex items-center gap-1.5">
                  <span>📍</span> {product.community?.name}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Availability */}
        {product.seller?.availability && (
          <div className={`flex items-center justify-between py-3 px-4 rounded-2xl ${
            product.seller.availability.isOpen ? 'bg-brand-soft' : 'bg-raised'
          }`}>
            <div>
              <p className={`text-sm font-semibold ${product.seller.availability.isOpen ? 'text-brand-soft-ink' : 'text-muted'}`}>
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
                <p className="text-xs text-muted">{t('closesAt', { time: formatClock(product.seller.availability.closesAt) })}</p>
              )}
              {!product.seller.availability.isOpen && product.seller.availability.opensAt && (
                <p className="text-xs text-muted">{t('opensAt', { time: formatClock(product.seller.availability.opensAt) })}</p>
              )}
              {!product.seller.availability.isOpen && product.seller.availability.reason && (
                <p className="text-xs text-muted">{product.seller.availability.reason}</p>
              )}
            </div>
            {product.seller.preOrderOnly && (
              <span className="text-xs font-medium bg-accent-soft text-accent-soft-ink px-2.5 py-1 rounded-full">
                {t('preOrdersOnly')}
              </span>
            )}
          </div>
        )}
        {product.seller && (
          <p className={`text-sm font-medium -mt-2 ${product.seller.isAcceptingOrders ? 'text-brand-ink' : 'text-red-600'}`}>
            {product.seller.isAcceptingOrders
              ? product.seller.preOrderOnly ? t('acceptingPreOrders') : t('acceptingOrders')
              : product.seller.acceptingOrdersReason || t('notAccepting')}
          </p>
        )}
        {product.seller?.mealCategories && product.seller.mealCategories.length > 0 && (
          <div className="flex flex-wrap gap-2 -mt-2">
            {product.seller.mealCategories.map((c) => (
              <span key={c} className="text-xs font-medium bg-raised text-ink px-2.5 py-1 rounded-full capitalize">
                {c.replace('_', ' ')}
              </span>
            ))}
          </div>
        )}

        {/* Delivery to you — real fee/distance/ETA once we know an address; an
            honest prompt instead of a guess when we don't. */}
        <div className="rounded-2xl bg-raised px-4 py-3">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wider mb-1.5">
            {t('deliveryToYou')}
          </h3>
          {product.delivery ? (
            <>
              <p className="text-sm text-ink">
                {product.delivery.deliverable
                  ? `${product.delivery.fee === 0 ? t('freeDelivery') : t('deliveryFeeAmount', { amount: formatPrice(product.delivery.fee) })}${
                      product.estimatedDeliveryMinMinutes != null
                        ? ` · ${t('etaMin', { min: product.estimatedDeliveryMinMinutes, max: product.estimatedDeliveryMaxMinutes })}`
                        : ''
                    }${product.delivery.distanceKm != null ? ` · ${t('kmAway', { km: product.delivery.distanceKm })}` : ''}`
                  : product.delivery.reason || t('notDeliverable')}
              </p>
              {product.minOrderAmountForDelivery ? (
                <p className="text-xs text-muted mt-0.5">{t('minOrder', { amount: formatPrice(product.minOrderAmountForDelivery) })}</p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">
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
        <div className="lg:sticky lg:top-[calc(6rem+var(--safe-top))] bg-surface rounded-[24px] shadow-[var(--shadow-card)] border border-line p-5 sm:p-6 space-y-6">
          {product.variants.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink mb-3">{t('options')}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedVariantId(null)}
                  disabled={product.stockQuantity !== undefined && product.stockQuantity <= 0}
                  className={`px-4 py-2 rounded-xl border-2 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    selectedVariantId === null
                      ? 'border-ink bg-ink text-page'
                      : 'border-line text-ink hover:border-line-strong'
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
                        ? 'border-ink bg-ink text-page'
                        : 'border-line text-ink hover:border-line-strong'
                    }`}
                  >
                    {v.name} · {formatPrice(v.price)}
                    {v.stockQuantity <= 0 && t('outOfStock')}
                  </button>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-lg font-extrabold text-ink">{t('deliveryQty')}</h2>

          {/* Delivery type */}
          <div>
            <p className="text-sm font-medium text-ink mb-3">{t('deliveryType')}</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStockType('hub')}
                className={`p-4 rounded-xl border-2 text-start transition-all ${
                  stockType === 'hub'
                    ? 'border-brand bg-brand-soft'
                    : 'border-line hover:border-line-strong hover:bg-raised/50'
                }`}
              >
                <p className="font-semibold text-ink">{t('hubDelivery')}</p>
                <p className="text-sm text-muted mt-0.5">
                  {product.delivery && !product.delivery.deliverable
                    ? t('deliveryNotHere')
                    : product.estimatedDeliveryMinMinutes != null
                      ? t('etaMin', { min: product.estimatedDeliveryMinMinutes, max: product.estimatedDeliveryMaxMinutes })
                      : t('addAddressEta')}
                </p>
                <p className="text-xs text-muted mt-1">{t('available', { count: product.stock.hub })}</p>
              </button>
              <button
                type="button"
                onClick={() => setStockType('direct')}
                className={`p-4 rounded-xl border-2 text-start transition-all ${
                  stockType === 'direct'
                    ? 'border-brand bg-brand-soft'
                    : 'border-line hover:border-line-strong hover:bg-raised/50'
                }`}
              >
                <p className="font-semibold text-ink">{t('direct')}</p>
                <p className="text-sm text-muted mt-0.5">{t('nextDay')}</p>
                <p className="text-xs text-muted mt-1">{t('available', { count: product.stock.direct })}</p>
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <p className="text-sm font-medium text-ink mb-3">{t('quantity')}</p>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center gap-1 rounded-[14px] bg-raised p-1">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-11 h-11 rounded-[10px] bg-surface shadow-xs flex items-center justify-center text-ink hover:bg-line font-bold text-lg transition-colors"
                  aria-label={t('decreaseQty')}
                >
                  −
                </button>
                <span
                  className="min-w-10 h-11 flex items-center justify-center font-extrabold text-ink text-lg"
                  aria-live="polite"
                >
                  {quantity}
                </span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
                  disabled={quantity >= maxQty}
                  className="w-11 h-11 rounded-[10px] bg-brand text-on-brand flex items-center justify-center hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-lg transition-colors"
                  aria-label={t('increaseQty')}
                >
                  +
                </button>
              </div>
              <span className="text-muted text-sm">{product.unit}</span>
            </div>
          </div>

          {/* Special Instructions (Section 9) */}
          <div className="pt-2">
            <label htmlFor="specialInstructions" className="block text-xs font-bold text-ink mb-1">
              {t('specialInstructions')}
            </label>
            <textarea
              id="specialInstructions"
              rows={2}
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder={t('specialPlaceholder')}
              className="w-full text-sm p-3 rounded-xl border border-line focus:border-brand focus:ring-2 focus:ring-brand/20 outline-none transition-all resize-none bg-surface text-ink placeholder:text-muted"
            />
          </div>

          {/* Action Buttons: Add to Bag & Buy Now */}
          <div className="pt-2 space-y-2">
            {product.menuLabel && (
              <p className={`text-sm font-semibold rounded-xl px-3 py-2 ${product.availableToday === false ? 'bg-accent-soft text-accent-soft-ink' : 'bg-brand-soft text-brand-soft-ink'}`} data-testid="menu-note">
                {product.availableToday === false ? t('notOnMenuToday', { days: product.menuLabel }) : t('onMenuNote', { days: product.menuLabel })}
              </p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button
                onClick={handleAddToCart}
                className="w-full h-12 text-[15px] font-extrabold bg-brand text-on-brand hover:bg-brand-500 rounded-xl"
                disabled={maxQty < quantity || addToCartLoading || product.availableToday === false}
              >
                {addToCartLoading ? t('adding') : t('addToBag', { amount: formatPrice(unitPrice * quantity) })}
              </Button>
              <Button
                onClick={handleBuyNow}
                variant="outline"
                className="w-full h-12 text-[15px] font-extrabold rounded-xl"
                disabled={maxQty < quantity || addToCartLoading || product.availableToday === false}
              >
                {t('buyNow')}
              </Button>
            </div>
            {justAddedToCart && (
              <p className="text-center text-sm text-muted">
                <Link href="/cart" className="font-medium text-ink underline hover:no-underline">
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
      <h2 className="text-[22px] sm:text-[28px] font-extrabold tracking-tight text-ink mb-4">{t('reviews')}</h2>
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
    <div className="min-h-screen bg-page text-ink pb-24">
      <SiteHeader />

      <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-6 md:py-10">
        {productContent}
      </div>
      <CartConflictModal isOpen={!!cartConflict} conflict={cartConflict} />
    </div>
  );
}

