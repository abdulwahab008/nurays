'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { productService } from '@/lib/services/product.service';
import { cartService } from '@/lib/services/cart.service';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useCartStore } from '@/lib/store/cart-store';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { apiClient } from '@/lib/api-client';
import ProductReviews from '@/components/products/ProductReviews';

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
  };
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

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
  ];

  useEffect(() => {
    if (params.id) {
      loadProduct();
    }
  }, [params.id]);

  const loadProduct = async () => {
    setLoading(true);
    try {
      const response = await productService.getProduct(params.id as string);
      const data = response.data as any;
      if (!data) return;
      // Ensure stock shape (API may return stockQuantity only or stock: { hub, direct })
      const stockHub = data.stock?.hub ?? data.stockQuantity ?? 0;
      const stockDirect = data.stock?.direct ?? data.stockQuantity ?? 0;
      // Ensure seller shape so rating/toFixed and businessName never throw
      const seller = data.seller
        ? {
            id: data.seller.id ?? '',
            businessName: data.seller.businessName ?? data.seller.business_name ?? 'Seller',
            rating: Number(data.seller.rating ?? data.seller.ratingAverage ?? 0),
            isVerified: Boolean(data.seller.isVerified ?? data.seller.is_verified),
          }
        : { id: '', businessName: 'Seller', rating: 0, isVerified: false };
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
      const defaultVariant = variants.find((v: { isDefault?: boolean }) => v.isDefault) ?? variants[0];
      setSelectedVariantId(defaultVariant?.id ?? null);
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
    } catch (error) {
      console.error('Failed to load product:', error);
    } finally {
      setLoading(false);
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
      showToast('Insufficient stock', 'error');
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
      showToast('Product added to cart. View cart in the sidebar or click the cart icon above.', 'success');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.message || err?.message || 'Failed to add to cart';
      showToast(msg, 'error');
    } finally {
      setAddToCartLoading(false);
    }
  };

  if (loading) {
    if (isAuthenticated) {
      return (
        <DashboardLayout
          title="Loading..."
          subtitle="Please wait"
          sidebarItems={sidebarItems}
          userType="customer"
        >
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading product...</p>
            </div>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream-50)" }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    if (isAuthenticated) {
      return (
        <DashboardLayout
          title="Product Not Found"
          subtitle="Sorry, we couldn't find this product"
          sidebarItems={sidebarItems}
          userType="customer"
        >
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl">🔍</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Product Not Found</h2>
            <p className="text-gray-500 mb-6">The product you're looking for doesn't exist or has been removed.</p>
            <Link href="/products">
              <Button className="bg-gray-700 hover:bg-gray-800">
                <span className="mr-2">🛍️</span> Browse Products
              </Button>
            </Link>
          </div>
        </DashboardLayout>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cream-50)" }}>
        <div className="text-center">
          <p className="text-gray-600 mb-4">Product not found</p>
          <Link href="/products">
            <Button className="bg-gray-700 hover:bg-gray-800">Back to Products</Button>
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
                No images attached
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
            Products
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
              {product.ratingAverage.toFixed(1)} · {product.totalReviews} reviews
            </span>
            {(product.stock.hub + product.stock.direct) > 0 && (
              <span className="inline-flex items-center bg-gray-100 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium">
                In stock
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
                  ? getPromotionLabel(catalogPromotions[0])
                  : catalogPromotions.map(getPromotionLabel).join(' + ')}
              </span>
            )}
            {catalogPromotions.length === 0 &&
              product.originalPrice != null &&
              Math.round(product.originalPrice) > Math.round(product.price) && (
                <span className="text-sm font-medium text-gray-600 bg-white border border-gray-200 px-2.5 py-1 rounded-lg">
                  {Math.round((1 - product.price / product.originalPrice) * 100)}% off
                </span>
              )}
            <span className="text-gray-500 text-sm">per {product.unit}</span>
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider mb-2">
              Description
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
                  ⚠️ Allergens
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
                  Ingredients
                </h3>
                <p className="text-sm text-gray-700">{product.ingredients}</p>
              </div>
            )}
            {product.heatingInstructions && (
              <div>
                <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Heating Instructions
                </h3>
                <p className="text-sm text-gray-700">{product.heatingInstructions}</p>
                {product.heatingInstructionsUrdu && (
                  <p className="text-sm text-gray-600 mt-1">{product.heatingInstructionsUrdu}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Seller */}
        <div className="flex items-center justify-between py-4 border-y border-gray-100">
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-0.5">
              Sold by
            </p>
            <p className="font-semibold text-gray-900">
              {product.seller?.businessName ?? 'Seller'}
              {product.seller?.isVerified && (
                <span className="ml-2 text-xs font-normal text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                  Verified
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-500">Seller rating</p>
            <p className="font-semibold text-gray-900">{(product.seller?.rating ?? 0).toFixed(1)}</p>
          </div>
        </div>

        {/* Purchase card - sticky on large screens */}
        <div className="lg:sticky lg:top-24 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
          {product.variants.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Options</p>
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
                  {product.stockQuantity !== undefined && product.stockQuantity <= 0 && ' (out of stock)'}
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
                    {v.stockQuantity <= 0 && ' (out of stock)'}
                  </button>
                ))}
              </div>
            </div>
          )}

          <h2 className="text-lg font-semibold text-gray-900">Delivery & quantity</h2>

          {/* Delivery type */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Delivery type</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStockType('hub')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  stockType === 'hub'
                    ? 'border-gray-700 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <p className="font-semibold text-gray-900">Hub delivery</p>
                <p className="text-sm text-gray-500 mt-0.5">2–4 hours</p>
                <p className="text-xs text-gray-600 mt-1">{product.stock.hub} available</p>
              </button>
              <button
                type="button"
                onClick={() => setStockType('direct')}
                className={`p-4 rounded-xl border-2 text-left transition-all ${
                  stockType === 'direct'
                    ? 'border-gray-700 bg-gray-50'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50/50'
                }`}
              >
                <p className="font-semibold text-gray-900">Direct</p>
                <p className="text-sm text-gray-500 mt-0.5">Next day</p>
                <p className="text-xs text-gray-600 mt-1">{product.stock.direct} available</p>
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Quantity</p>
            <div className="flex items-center gap-3">
              <div className="inline-flex items-center rounded-xl border-2 border-gray-200 bg-gray-50/50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-12 h-12 flex items-center justify-center text-gray-700 hover:bg-gray-100 font-medium text-lg transition-colors"
                  aria-label="Decrease quantity"
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
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <span className="text-gray-500 text-sm">{product.unit}</span>
            </div>
          </div>

          {/* Add to cart */}
          <div className="pt-2 space-y-2">
            <Button
              onClick={handleAddToCart}
              variant="dark"
              className="w-full h-14 text-base font-semibold"
              disabled={maxQty < quantity || addToCartLoading}
            >
              {addToCartLoading ? 'Adding…' : `Add to bag · ${formatPrice(unitPrice * quantity)}`}
            </Button>
            {justAddedToCart && (
              <p className="text-center text-sm text-gray-600">
                <Link href="/cart" className="font-medium text-gray-900 underline hover:no-underline">
                  View cart
                </Link>
                {' — your item is saved there.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>

    <div className="mt-10">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Reviews</h2>
      <ProductReviews productId={product.id} />
    </div>
    </>
  );

  // For authenticated users, wrap in DashboardLayout
  if (isAuthenticated) {
    return (
      <DashboardLayout
        title={product.name}
        subtitle="Product Details"
        sidebarItems={sidebarItems}
        userType="customer"
      >
        {productContent}
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
                Today's plates
              </Link>
              <Link href="/login" className="text-[13px] font-medium" style={{ color: 'var(--ink-800)' }}>
                Sign in
              </Link>
              <Link href="/register">
                <Button>Join Nuray</Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-10 md:py-14">
        {productContent}
      </div>
    </div>
  );
}

