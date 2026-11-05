'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { ImageOff, Loader2, Package, Pencil, Plus, Search, Trash2, X } from 'lucide-react';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

type StockFilter = 'all' | 'in_stock' | 'low_stock' | 'out_of_stock';
type StatusFilter = 'all' | 'active' | 'hidden' | 'pending';

interface Product {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  productType?: 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook';
  shelfLifeHours?: number;
  stockQuantity: number;
  unit?: string;
  isActive: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  menuType?: 'fixed' | 'weekly' | 'daily';
  availableDays?: number[];
  menuDate?: string | null;
  images?: Array<{ imageUrl: string; isPrimary: boolean }>;
  category?: { name: string };
}

const productTypeLabel: Record<string, string> = {
  frozen: 'Frozen',
  fresh: 'Fresh',
  ready_to_eat: 'Ready to eat',
  ready_to_cook: 'Ready to cook',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const photoUrl = (url: string) =>
  url.startsWith('http') ? url : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3001'}${url}`;

const formatUnit = (unit?: string): string => {
  if (!unit) return '';
  const unitMap: Record<string, string> = {
    piece: 'per piece',
    pack: 'per pack',
    dozen: 'per dozen',
    '100g': 'per 100g',
    '250g': 'per 250g',
    '500g': 'per 500g',
    '1kg': 'per 1 kg',
    kg: 'per kg',
  };
  return unitMap[unit] || unit;
};

function SellerProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInventoryView = searchParams?.get('view') === 'inventory';
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();

  const [loading, setLoading] = useState(true);
  // Why the dishes could not be read; shown instead of the empty list, which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [updatingStock, setUpdatingStock] = useState<{ [key: string]: boolean }>({});
  const [stockValues, setStockValues] = useState<{ [key: string]: number }>({});
  const [editingStock, setEditingStock] = useState<{ [key: string]: boolean }>({});

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Bulk update modal
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [bulkModalSearch, setBulkModalSearch] = useState('');

  const loadProducts = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get('/products/seller/my-products');
      if (response.data.success) {
        setProducts(response.data.data.products || []);
      }
    } catch (error: unknown) {
      console.error('Failed to load products:', error);
      // The dishes already on the screen stay (a refresh after an action must not wipe the list).
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('This page is for kitchens only.', 'error');
      return;
    }

    loadProducts();
  }, [isAuthenticated, user, router]);

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/products/${productId}`, { isActive: !currentStatus });
      showToast(!currentStatus ? 'Customers can see this dish now' : 'Dish hidden from customers', 'success');
      loadProducts();
    } catch (error) {
      showToast(apiErrorMessage(error, "Couldn't change this dish"), 'error');
    }
  };

  // A daily dish is on the menu only on the days the kitchen puts it there.
  const handleTodaysMenu = async (productId: string, on: boolean) => {
    try {
      await apiClient.patch(`/products/${productId}`, { menuDate: on ? 'today' : null });
      showToast(on ? "Added to today's menu" : "Taken off today's menu", 'success');
      loadProducts();
    } catch (error) {
      showToast(apiErrorMessage(error, "Couldn't change today's menu"), 'error');
    }
  };

  const onTodaysMenu = (p: Product) =>
    !!p.menuDate && p.menuDate.slice(0, 10) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

  const handleQuickStockUpdate = async (productId: string, newStock: number) => {
    if (newStock < 0) {
      showToast("Stock can't be less than 0", 'error');
      return;
    }

    try {
      setUpdatingStock((prev) => ({ ...prev, [productId]: true }));
      await apiClient.patch(`/products/${productId}`, { stockQuantity: newStock });
      showToast('Stock saved', 'success');

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stockQuantity: newStock } : p))
      );
    } catch (error) {
      showToast(apiErrorMessage(error, "Couldn't save the stock"), 'error');
    } finally {
      setUpdatingStock((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleBulkStockUpdate = async () => {
    if (!bulkStockValue || selectedProducts.length === 0) {
      showToast('Pick the dishes and enter how many you have', 'error');
      return;
    }

    const stockNum = parseInt(bulkStockValue, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      showToast('Stock must be 0 or more', 'error');
      return;
    }

    try {
      setLoading(true);
      await Promise.all(
        selectedProducts.map((productId) =>
          apiClient.patch(`/products/${productId}`, { stockQuantity: stockNum })
        )
      );
      showToast(`Stock saved for ${selectedProducts.length} ${selectedProducts.length === 1 ? 'dish' : 'dishes'}`, 'success');
      setShowBulkUpdate(false);
      setBulkStockValue('');
      setSelectedProducts([]);
      loadProducts();
    } catch (error) {
      showToast(apiErrorMessage(error, "Couldn't save the stock"), 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await apiClient.delete(`/products/${productId}`);
      showToast('Dish deleted', 'success');
      loadProducts();
    } catch (error) {
      showToast(apiErrorMessage(error, "Couldn't delete this dish"), 'error');
    }
  };

  // The dishes could not be read (and there is nothing older on the screen to show).
  const couldNotRead = !loading && !!loadError && products.length === 0;

  const totalProducts = products.length;
  const inStockCount = products.filter((p) => p.stockQuantity > 10).length;
  const lowStockCount = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= 10).length;
  const outOfStockCount = products.filter((p) => p.stockQuantity === 0).length;
  const activeCount = products.filter((p) => p.isActive && p.approvalStatus === 'approved').length;
  const pendingCount = products.filter((p) => p.approvalStatus === 'pending').length;
  const hiddenCount = products.filter((p) => !p.isActive).length;

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name?.toLowerCase().includes(query);
        const matchesCategory = p.category?.name?.toLowerCase().includes(query);
        const matchesType = p.productType?.toLowerCase().includes(query);
        if (!matchesName && !matchesCategory && !matchesType) return false;
      }

      // Stock status filter (always available or in inventory view)
      if (stockFilter === 'in_stock' && p.stockQuantity <= 10) return false;
      if (stockFilter === 'low_stock' && (p.stockQuantity === 0 || p.stockQuantity > 10)) return false;
      if (stockFilter === 'out_of_stock' && p.stockQuantity !== 0) return false;

      // Status filter (in All Products view)
      if (!isInventoryView) {
        if (statusFilter === 'active' && (!p.isActive || p.approvalStatus !== 'approved')) return false;
        if (statusFilter === 'hidden' && p.isActive) return false;
        if (statusFilter === 'pending' && p.approvalStatus !== 'pending') return false;
      }

      return true;
    });
  }, [products, searchQuery, stockFilter, statusFilter, isInventoryView]);

  if (!isAuthenticated) {
    return null;
  }

  const closeBulkUpdate = () => {
    setShowBulkUpdate(false);
    setSelectedProducts([]);
    setBulkStockValue('');
  };

  const showEmpty = !loading && !loadError && products.length === 0;
  const fieldClass =
    'h-11 rounded-xl border border-line bg-surface text-sm text-ink focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand/30';
  const iconButtonClass =
    'inline-flex items-center justify-center w-11 h-11 rounded-xl text-muted hover:text-ink hover:bg-raised transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40';
  const tabs = [
    { label: 'All dishes', href: '/sellers/products', selected: !isInventoryView },
    { label: 'Stock', href: '/sellers/products?view=inventory', selected: isInventoryView },
  ];
  const needRestock = lowStockCount + outOfStockCount;

  return (
    <DashboardLayout
      title={isInventoryView ? 'Stock' : 'Dishes'}
      subtitle={isInventoryView ? 'How many of each dish you have left' : 'Your dishes, their prices and what customers can see'}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-5xl space-y-6">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-end sm:justify-between border-b border-line">
          <nav aria-label="Dishes" className="flex gap-6 -mb-px">
            {tabs.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={tab.selected ? 'page' : undefined}
                className={`flex items-center gap-2 min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors ${
                  tab.selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {tab.label}
                {!couldNotRead && tab.href === '/sellers/products' && totalProducts > 0 && (
                  <span className="min-w-6 px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-raised text-muted">
                    {totalProducts}
                  </span>
                )}
                {!couldNotRead && tab.href !== '/sellers/products' && needRestock > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium tabular-nums bg-accent-soft text-accent-soft-ink">
                    {needRestock} to restock
                  </span>
                )}
              </Link>
            ))}
          </nav>

          <div className="flex gap-2 sm:pb-2">
            {products.length > 0 && (
              <Button
                variant="outline"
                className="flex-1 sm:flex-none px-4"
                onClick={() => {
                  setSelectedProducts([]);
                  setBulkStockValue('');
                  setShowBulkUpdate(true);
                }}
              >
                Update stock
              </Button>
            )}
            {!showEmpty && (
              <Link href="/sellers/products/new" className="flex-1 sm:flex-none">
                <Button className="w-full px-5">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Add a dish
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Counters and filters describe a list; with no list (it could not be read) they would say "0". */}
        {!couldNotRead && products.length > 0 && (
          <>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
              {[
                { label: 'Showing to customers', value: activeCount },
                { label: 'Hidden', value: hiddenCount },
                { label: 'Running low', value: lowStockCount },
                { label: 'Sold out', value: outOfStockCount },
                ...(pendingCount > 0 ? [{ label: 'Waiting for approval', value: pendingCount }] : []),
              ].map((figure) => (
                <div key={figure.label} className={figure.value === 0 && figure.label !== 'Showing to customers' ? 'hidden sm:block' : undefined}>
                  <dt className="text-sm text-muted">{figure.label}</dt>
                  <dd className="text-2xl font-semibold text-ink tabular-nums">{figure.value}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <label htmlFor="dish-search" className="sr-only">Search dishes</label>
                <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  id="dish-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name or category"
                  className={`${fieldClass} w-full ps-10 pe-11 placeholder:text-muted`}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute end-0 top-0 w-11 h-11 flex items-center justify-center text-muted hover:text-ink"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <label htmlFor="stock-filter" className="sr-only">Stock</label>
                <select
                  id="stock-filter"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as StockFilter)}
                  className={`${fieldClass} min-w-0 flex-1 sm:flex-none px-3`}
                >
                  <option value="all">Any stock</option>
                  <option value="in_stock">More than 10 left ({inStockCount})</option>
                  <option value="low_stock">Running low ({lowStockCount})</option>
                  <option value="out_of_stock">Sold out ({outOfStockCount})</option>
                </select>
                {!isInventoryView && (
                  <>
                    <label htmlFor="status-filter" className="sr-only">Who can see it</label>
                    <select
                      id="status-filter"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className={`${fieldClass} min-w-0 flex-1 sm:flex-none px-3`}
                    >
                      <option value="all">Every dish</option>
                      <option value="active">Showing to customers</option>
                      <option value="hidden">Hidden</option>
                      {pendingCount > 0 && <option value="pending">Waiting for approval</option>}
                    </select>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {Boolean(loadError) && products.length > 0 && (
          <LoadError compact error={loadError} onRetry={loadProducts} title="We couldn't load your dishes" />
        )}

        {loading && products.length === 0 ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">Loading your dishes</p>
          </div>
        ) : couldNotRead ? (
          <LoadError error={loadError} onRetry={loadProducts} title="We couldn't load your dishes" className="max-w-2xl" />
        ) : products.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-muted max-w-xs mx-auto mb-5">Your dishes will be listed here once you add them.</p>
            <Link href="/sellers/products/new">
              <Button>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add your first dish
              </Button>
            </Link>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm text-muted mb-3">No dishes match these filters.</p>
            <Button
              variant="ghost"
              onClick={() => {
                setSearchQuery('');
                setStockFilter('all');
                setStatusFilter('all');
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          <div className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] overflow-hidden">
            <div aria-hidden="true" className="hidden sm:grid sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem_8rem_3rem_5.5rem] gap-x-5 px-5 py-2.5 border-b border-line text-xs text-muted">
              <span />
              <span>Dish</span>
              <span className="text-end">Price</span>
              <span>Stock</span>
              <span>Showing</span>
              <span />
            </div>
            <ul className="divide-y divide-line">
              {filteredProducts.map((product) => {
                const isLow = product.stockQuantity > 0 && product.stockQuantity <= 10;
                const isOut = product.stockQuantity === 0;
                const photo = product.images?.[0];
                const editing = !!editingStock[product.id];
                const onToday = onTodaysMenu(product);
                const profit = product.costPrice && product.costPrice > 0
                  ? product.price - product.costPrice - product.price * 0.15
                  : null;
                const meta = [
                  productTypeLabel[product.productType || 'frozen'] ?? productTypeLabel.frozen,
                  product.category?.name,
                  product.menuType === 'weekly' && (product.availableDays ?? []).length > 0
                    ? (product.availableDays ?? []).map((d) => DAY_NAMES[d]).join(', ')
                    : null,
                  product.shelfLifeHours ? `Keeps ${product.shelfLifeHours} h` : null,
                ].filter(Boolean).join(', ');

                return (
                  <li key={product.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_3rem] sm:grid-cols-[3.5rem_minmax(0,1fr)_7rem_8rem_3rem_5.5rem] items-center gap-x-4 sm:gap-x-5 gap-y-3 px-4 sm:px-5 py-4">
                    <div className="col-start-1 row-start-1 self-start sm:self-center w-14 h-14 rounded-xl bg-raised overflow-hidden flex items-center justify-center">
                      {photo ? (
                        <img src={photoUrl(photo.imageUrl)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <ImageOff className="w-5 h-5 text-muted" aria-label="No photo" />
                      )}
                    </div>

                    <div className="col-start-2 row-start-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <h3 className="font-semibold text-ink leading-snug">{product.name}</h3>
                          {product.approvalStatus === 'pending' ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-accent-soft text-accent-soft-ink">Waiting for approval</span>
                          ) : product.approvalStatus === 'rejected' ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700">Not approved</span>
                          ) : !product.isActive ? (
                            <span className="rounded-full px-2 py-0.5 text-xs font-medium bg-raised text-muted">Hidden</span>
                          ) : null}
                        </div>
                        <p className="text-sm text-muted mt-0.5">{meta}</p>
                        {profit !== null && (
                          <p className="text-xs text-muted mt-0.5 tabular-nums">
                            You keep about {formatPrice(profit)} ({((profit / product.price) * 100).toFixed(0)}%)
                          </p>
                        )}
                        {product.menuType === 'daily' && (
                          <button
                            type="button"
                            onClick={() => handleTodaysMenu(product.id, !onToday)}
                            data-testid="todays-menu-toggle"
                            aria-pressed={onToday}
                            className={`mt-2 min-h-11 px-3 rounded-full text-sm font-medium border transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                              onToday ? 'bg-brand-soft text-brand-soft-ink border-transparent' : 'border-line-strong text-ink hover:bg-raised'
                            }`}
                          >
                            {onToday ? "On today's menu" : "Put on today's menu"}
                          </button>
                        )}
                    </div>

                    <div className="col-span-3 row-start-2 flex items-center gap-2 sm:contents">
                        <p className="flex-1 whitespace-nowrap sm:col-start-3 sm:row-start-1 sm:text-end">
                          <span className="font-semibold text-ink tabular-nums">{formatPrice(product.price)}</span>
                          {product.unit && <span className="text-xs text-muted ms-1 sm:ms-0 sm:block">{formatUnit(product.unit)}</span>}
                        </p>
                        <button
                          type="button"
                          onClick={() => setEditingStock((prev) => ({ ...prev, [product.id]: !prev[product.id] }))}
                          aria-expanded={editing}
                          aria-label={`Change stock for ${product.name}`}
                          className={`sm:col-start-4 sm:row-start-1 justify-self-start whitespace-nowrap inline-flex items-center gap-2 min-h-11 px-3 rounded-xl border text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                            isOut
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : isLow
                                ? 'border-transparent bg-accent-soft text-accent-soft-ink'
                                : 'border-line text-ink hover:bg-raised'
                          }`}
                        >
                          <Package className="w-4 h-4 opacity-70" aria-hidden="true" />
                          {isOut ? 'Sold out' : `${product.stockQuantity} left`}
                        </button>

                    <div className="flex items-center justify-end sm:col-start-6 sm:row-start-1 -my-1">
                      <Link href={`/sellers/products/${product.id}/edit`} aria-label={`Edit ${product.name}`} title="Edit" className={iconButtonClass}>
                        <Pencil className="w-4 h-4" aria-hidden="true" />
                      </Link>
                      <button
                        type="button"
                        onClick={async () => {
                          if ((await confirmDialog({ title: 'Delete this dish?', message: `"${product.name}" will be removed for good.`, confirmText: 'Delete' }))) {
                            handleDeleteProduct(product.id);
                          }
                        }}
                        aria-label={`Delete ${product.name}`}
                        title="Delete"
                        className={`${iconButtonClass} hover:text-red-700 hover:bg-red-50`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={product.isActive}
                      aria-label={`Show ${product.name} to customers`}
                      onClick={() => handleToggleActive(product.id, product.isActive)}
                      className="col-start-3 row-start-1 self-start sm:self-center sm:col-start-5 w-12 min-h-11 flex items-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                    >
                      <span aria-hidden="true" className={`relative w-12 h-7 rounded-full transition-colors ${product.isActive ? 'bg-brand-600' : 'bg-line-strong'}`}>
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] ${product.isActive ? 'start-6' : 'start-1'}`} />
                      </span>
                    </button>

                    {editing && (
                      <div className="col-span-3 row-start-3 sm:row-start-2 sm:col-start-2 sm:col-span-5">
                        <div className="rounded-2xl bg-raised p-3 flex flex-wrap items-center gap-2">
                          <label htmlFor={`stock-${product.id}`} className="text-sm text-ink me-1 w-full sm:w-auto">
                            How many left?
                          </label>
                          {[-5, -1].map((delta) => (
                            <button
                              key={delta}
                              type="button"
                              onClick={() => setStockValues((prev) => ({ ...prev, [product.id]: Math.max(0, (prev[product.id] ?? product.stockQuantity) + delta) }))}
                              className="w-11 h-11 rounded-xl border border-line-strong bg-surface text-sm font-medium text-ink tabular-nums hover:bg-page"
                            >
                              {delta}
                            </button>
                          ))}
                          <input
                            id={`stock-${product.id}`}
                            type="number"
                            min="0"
                            inputMode="numeric"
                            value={stockValues[product.id] ?? product.stockQuantity}
                            onChange={(e) =>
                              setStockValues((prev) => ({
                                ...prev,
                                [product.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                              }))
                            }
                            className={`${fieldClass} w-20 px-3 text-center font-semibold tabular-nums`}
                            disabled={updatingStock[product.id]}
                            autoFocus
                          />
                          {[1, 5].map((delta) => (
                            <button
                              key={delta}
                              type="button"
                              onClick={() => setStockValues((prev) => ({ ...prev, [product.id]: Math.max(0, (prev[product.id] ?? product.stockQuantity) + delta) }))}
                              className="w-11 h-11 rounded-xl border border-line-strong bg-surface text-sm font-medium text-ink tabular-nums hover:bg-page"
                            >
                              +{delta}
                            </button>
                          ))}
                          <div className="flex gap-2 ms-auto">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setEditingStock((prev) => ({ ...prev, [product.id]: false }));
                                setStockValues((prev) => ({ ...prev, [product.id]: product.stockQuantity }));
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              onClick={async () => {
                                const val = stockValues[product.id] ?? product.stockQuantity;
                                await handleQuickStockUpdate(product.id, val);
                                setEditingStock((prev) => ({ ...prev, [product.id]: false }));
                              }}
                              disabled={updatingStock[product.id]}
                            >
                              {updatingStock[product.id] ? <Loader2 className="w-4 h-4 animate-spin" aria-label="Saving" /> : 'Save'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {showBulkUpdate && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-stock-title"
            className="bg-surface rounded-t-[20px] sm:rounded-[20px] border border-line shadow-[var(--shadow-card)] max-w-xl w-full max-h-[90vh] overflow-hidden flex flex-col"
          >
            <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-4">
              <div>
                <h2 id="bulk-stock-title" className="text-lg font-semibold text-ink">Update stock for several dishes</h2>
                <p className="text-sm text-muted mt-0.5">Every dish you tick gets the same number.</p>
              </div>
              <button type="button" onClick={closeBulkUpdate} aria-label="Close" className={`${iconButtonClass} -me-2 -mt-2 shrink-0`}>
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-5 pb-5 overflow-y-auto space-y-6 flex-1">
              <div className="space-y-2">
                <label htmlFor="bulk-stock-value" className="block text-sm font-semibold text-ink">How many of each?</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="bulk-stock-value"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={bulkStockValue}
                    onChange={(e) => setBulkStockValue(e.target.value)}
                    placeholder="25"
                    className={`${fieldClass} w-24 px-3 text-center font-semibold tabular-nums`}
                    autoFocus
                  />
                  {[0, 10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBulkStockValue(String(preset))}
                      aria-pressed={bulkStockValue === String(preset)}
                      className={`min-h-11 px-3 rounded-full text-sm tabular-nums border transition-colors ${
                        bulkStockValue === String(preset)
                          ? 'bg-brand-soft text-brand-soft-ink border-transparent font-medium'
                          : 'border-line text-ink hover:bg-raised'
                      }`}
                    >
                      {preset === 0 ? '0, sold out' : preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t border-line pt-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">
                    Dishes <span className="font-normal text-muted tabular-nums">({selectedProducts.length} ticked)</span>
                  </span>
                  <div className="flex items-center">
                    <Button variant="ghost" size="sm" onClick={() => setSelectedProducts(products.map((p) => p.id))}>
                      Tick all
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted" onClick={() => setSelectedProducts([])}>
                      Clear
                    </Button>
                  </div>
                </div>

                <label htmlFor="bulk-search" className="sr-only">Find a dish</label>
                <input
                  id="bulk-search"
                  type="search"
                  value={bulkModalSearch}
                  onChange={(e) => setBulkModalSearch(e.target.value)}
                  placeholder="Find a dish"
                  className={`${fieldClass} w-full px-3.5 placeholder:text-muted`}
                />

                <ul className="max-h-64 overflow-y-auto divide-y divide-line border border-line rounded-2xl">
                  {products
                    .filter((p) =>
                      bulkModalSearch.trim()
                        ? p.name.toLowerCase().includes(bulkModalSearch.toLowerCase())
                        : true
                    )
                    .map((product) => {
                      const isSelected = selectedProducts.includes(product.id);
                      return (
                        <li key={product.id}>
                          <label className={`flex items-center gap-3 px-3.5 min-h-14 py-2 cursor-pointer transition-colors ${isSelected ? 'bg-brand-soft/60' : 'hover:bg-raised'}`}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleProductSelection(product.id)}
                              className="w-5 h-5 shrink-0 accent-brand-600"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-ink truncate">{product.name}</span>
                              <span className="block text-xs text-muted tabular-nums">{product.stockQuantity} left now</span>
                            </span>
                            <span className="text-sm text-muted tabular-nums">{formatPrice(product.price)}</span>
                          </label>
                        </li>
                      );
                    })}
                </ul>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-line flex gap-3">
              <Button variant="outline" onClick={closeBulkUpdate} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleBulkStockUpdate}
                disabled={!bulkStockValue || selectedProducts.length === 0 || loading}
                className="flex-1"
              >
                {loading
                  ? 'Saving...'
                  : `Save for ${selectedProducts.length} ${selectedProducts.length === 1 ? 'dish' : 'dishes'}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

export default function SellerProductsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-page">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600" />
        </div>
      }
    >
      <SellerProductsContent />
    </Suspense>
  );
}
