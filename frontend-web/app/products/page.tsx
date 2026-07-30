'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { productService, Product } from '@/lib/services/product.service';
import { formatPrice } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout } from '@/components/layout/DashboardShell';
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
  const sorted = [...promos].sort((a, b) => (a.type === 'percentage' && b.type === 'fixed' ? -1 : a.type === 'fixed' && b.type === 'percentage' ? 1 : 0));
  const result = sorted.reduce((price, p) => {
    if (p.type === 'percentage' && p.discountValue > 0) return price * (1 - p.discountValue / 100);
    if (p.type === 'fixed' && p.discountValue > 0) return Math.max(0, price - p.discountValue);
    return price;
  }, originalPrice);
  return Math.round(result);
}

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
  iconUrl?: string;
  slug: string;
  children?: Category[];
}

const productTypeOptions = [
  { value: 'all', label: 'All Types' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'ready_to_eat', label: 'Ready to Eat' },
  { value: 'ready_to_cook', label: 'Ready to Cook' },
];

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [searchInput, setSearchInput] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedProductType, setSelectedProductType] = useState(searchParams.get('productType') || 'all');
  const [sortBy, setSortBy] = useState('newest');
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [promotionsByProductId, setPromotionsByProductId] = useState<Record<string, CatalogPromotion[]>>({});

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'price_low', label: 'Price: Low to High' },
    { value: 'price_high', label: 'Price: High to Low' },
    { value: 'rating', label: 'Top Rated' },
    { value: 'popular', label: 'Most Popular' },
  ];

  // Load categories from API
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setCategoriesLoading(true);
        const response = await apiClient.get('/categories');
        if (response.data.success) {
          setCategories(response.data.data || []);
        }
      } catch (error) {
        console.error('Failed to load categories:', error);
      } finally {
        setCategoriesLoading(false);
      }
    };
    loadCategories();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [page, selectedCategory, selectedProductType, sortBy, searchQuery]);

  // Sync search term whenever the URL's ?search= changes (e.g. a new navbar search)
  useEffect(() => {
    const paramSearch = searchParams.get('search') || '';
    setSearchQuery(paramSearch);
    setSearchInput(paramSearch);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.toString()]);

  const loadProducts = async () => {
    setLoading(true);
    setError('');
    try {
      const productTypeValue = selectedProductType !== 'all' ? selectedProductType as 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook' : undefined;
      const response = await productService.getProducts({ 
        page, 
        limit: 20,
        categoryId: selectedCategory !== 'all' ? selectedCategory : undefined,
        productType: productTypeValue,
        sort: sortBy as any,
        search: searchQuery || undefined,
      });
      if (response && response.data) {
        const list = response.data.products || [];
        setProducts(list);
        setTotalPages(response.data.pagination?.totalPages || 1);
        // Fetch promotions for catalog (customer listing – public endpoint)
        if (list.length > 0) {
          try {
            const ids = list.map((p: Product) => p.id).join(',');
            const promRes = await apiClient.get<{ success: boolean; data: Record<string, CatalogPromotion[]> }>(`/promotions/catalog?productIds=${encodeURIComponent(ids)}`);
            if (promRes.data.success && promRes.data.data) setPromotionsByProductId(promRes.data.data);
            else setPromotionsByProductId({});
          } catch {
            setPromotionsByProductId({});
          }
        } else {
          setPromotionsByProductId({});
        }
      } else {
        setError('Failed to load products. Please try again.');
      }
    } catch (error: any) {
      console.error('Failed to load products:', error);
      const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to load products';
      setError(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearchQuery(searchInput);
  };

  // If not authenticated, show public layout
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--cream-50)' }}>
        {/* Public Navbar */}
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
                <span className="font-display italic" style={{ fontSize: 26, color: 'var(--ink-900)', fontWeight: 400 }}>
                  nuray
                </span>
              </Link>
              <div className="flex items-center gap-3">
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

        {/* Public Content */}
        <div className="max-w-[1440px] mx-auto px-6 md:px-12 py-10 md:py-14">
          <div className="mb-10">
            <div className="eyebrow">On the menu today</div>
            <h1 className="font-display mt-3 text-[44px] md:text-[56px]" style={{ color: 'var(--ink-900)' }}>
              Today's plates
            </h1>
            <p className="mt-3 max-w-[480px] text-[15px]" style={{ color: 'var(--ink-500)' }}>
              Sealed, frozen, and delivered cold from verified home kitchens across Karachi.
            </p>
          </div>
          {renderProductsContent()}
        </div>
      </div>
    );
  }

  function renderProductsContent() {
    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Failed to load products</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <Button onClick={loadProducts} variant="outline" className="border-red-300 text-red-700">
            Try Again
          </Button>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="text-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading products...</p>
        </div>
      );
    }

    if (products.length === 0) {
      const hasActiveFilters = Boolean(searchQuery) || selectedCategory !== 'all' || selectedProductType !== 'all';
      if (hasActiveFilters) {
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              {searchQuery ? `No results for "${searchQuery}"` : 'No products match these filters'}
            </h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Try a different search term or clear your filters to see everything we have.
            </p>
            <Button
              onClick={() => {
                setSearchInput('');
                setSearchQuery('');
                setSelectedCategory('all');
                setSelectedProductType('all');
                setPage(1);
              }}
              className="bg-gray-700 hover:bg-gray-800"
            >
              Clear search & filters
            </Button>
          </div>
        );
      }
      // Different empty state for logged-in customers vs public visitors
      if (isAuthenticated) {
        return (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">No Products Available Yet</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Our sellers are preparing amazing homemade food for you. Check back soon!
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Button onClick={loadProducts} className="bg-gray-700 hover:bg-gray-800">
                Refresh
              </Button>
              <Link href="/dashboard">
                <Button variant="outline">
                  Back to Dashboard
                </Button>
              </Link>
            </div>
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-sm text-gray-400">
                Want to sell your homemade food?{' '}
                <Link href="/sellers/register" className="text-gray-700 hover:underline">
                  Register as a seller
                </Link>
              </p>
            </div>
          </div>
        );
      }
      
      // Public view - encourage becoming a seller
      return (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-3">No Products Available Yet</h2>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            We're working on adding amazing homemade food products. Check back soon or become a seller!
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link href="/sellers/register">
              <Button className="bg-gray-700 hover:bg-gray-800">
                Become a Seller
              </Button>
            </Link>
            <Button onClick={loadProducts} variant="outline">
              Refresh
            </Button>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {products.map((product) => (
            <Link
              key={product.id}
              href={`/products/${product.id}`}
              className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border border-gray-100 hover:border-gray-200 group"
            >
              <div className="aspect-square bg-gray-100 relative overflow-hidden">
                {product.primaryImage ? (
                  <img
                    src={product.primaryImage}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm text-center px-2">
                    No images attached
                  </div>
                )}
                {/* Quick Add Button */}
                <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="w-10 h-10 bg-gray-700 text-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-800 transition-colors">
                    +
                  </button>
                </div>
              </div>
              <div className="p-4">
                {promotionsByProductId[product.id]?.length ? (
                  <span className="inline-block px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mb-2">
                    {promotionsByProductId[product.id].length === 1
                      ? getPromotionLabel(promotionsByProductId[product.id][0])
                      : promotionsByProductId[product.id].map(getPromotionLabel).join(' + ')}
                  </span>
                ) : null}
                <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">{product.name}</h3>
                <p className="text-sm text-gray-500 mb-3 flex items-center gap-1">
                  <span className="truncate">{product.seller?.businessName ?? 'Seller'}</span>
                  {product.seller?.isVerified && (
                    <span className="text-gray-700 text-xs">Verified</span>
                  )}
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    {promotionsByProductId[product.id]?.length ? (
                      <>
                        <p className="text-sm text-gray-400 line-through">{formatPrice(product.price)}</p>
                        <p className="text-xl font-bold text-gray-700">
                          {formatPrice(getStackedDiscountedPrice(product.price, promotionsByProductId[product.id]))}
                        </p>
                      </>
                    ) : (
                      <p className="text-xl font-bold text-gray-700">
                        {formatPrice(product.price)}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">per {product.unit}</p>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded-lg">
                    <span className="text-sm font-medium text-gray-700">
                      {(product.ratingAverage ?? 0).toFixed(1)} rating
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex justify-center items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              size="sm"
            >
              ← Previous
            </Button>
            <span className="px-4 py-2 text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              size="sm"
            >
              Next →
            </Button>
          </div>
        )}
      </>
    );
  }

  return (
    <DashboardLayout
      title="Today's plates"
      subtitle="Verified home kitchens across Karachi"
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Search and Filters */}
      <div className="rounded-2xl p-4 mb-6" style={{ background: 'var(--paper-0)', border: '1px solid var(--ink-100)' }}>
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="flex gap-3 mb-4">
          <div className="flex-1 relative">
            <input
              type="text"
              placeholder="Search for biryani, kebabs, parathas..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-4 pr-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            />
          </div>
          <Button type="submit" className="bg-gray-700 hover:bg-gray-800 px-6">
            Search
          </Button>
        </form>

        {/* Product Type Filter */}
        <div className="flex gap-2 flex-wrap mb-4">
          {productTypeOptions.map((type) => (
            <button
              key={type.value}
              onClick={() => { setSelectedProductType(type.value); setPage(1); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                selectedProductType === type.value
                  ? 'bg-gray-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <span>{type.label}</span>
            </button>
          ))}
        </div>

        {/* Categories */}
        <div className="flex gap-2 flex-wrap mb-4">
          {/* All Categories Button */}
          <button
            onClick={() => { setSelectedCategory('all'); setPage(1); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
              selectedCategory === 'all'
                ? 'bg-gray-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <span>All Categories</span>
          </button>
          
          {/* Dynamic Categories from API */}
          {categoriesLoading ? (
            <span className="text-sm text-gray-400">Loading categories...</span>
          ) : (
            categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => { setSelectedCategory(cat.id); setPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === cat.id
                    ? 'bg-gray-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <span>{cat.name}</span>
              </button>
            ))
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {products.length} products found
          </p>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-gray-500 focus:border-transparent"
            >
              {sortOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {renderProductsContent()}
    </DashboardLayout>
  );
}

