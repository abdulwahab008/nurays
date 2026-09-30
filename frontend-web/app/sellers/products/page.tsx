'use client';

import { useState, useEffect, useMemo, Suspense, ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

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
  images?: Array<{ imageUrl: string; isPrimary: boolean }>;
  category?: { name: string };
}

// Icons
const Icons = {
  products: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  ),
  inventory: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  discounts: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.386a11.175 11.175 0 004.914-4.914c.486-.827.313-1.908-.386-2.607L11.159 3.659A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  snowflake: (
    <svg className="w-3.5 h-3.5 text-cyan-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m0-18l3 3m-3-3l-3 3m0 12l3 3m0 0l3-3M4.5 7.5l15 9m-15-9l3.5.5m-3.5-.5l.5 3.5m14.5 5.5l-3.5-.5m3.5.5l-.5-3.5M4.5 16.5l15-9m-15 9l.5-3.5m-.5 3.5l3.5-.5m11.5-8.5l.5 3.5m-.5-3.5l-3.5.5" />
    </svg>
  ),
  leaf: (
    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
    </svg>
  ),
  plate: (
    <svg className="w-3.5 h-3.5 text-orange-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  pan: (
    <svg className="w-3.5 h-3.5 text-purple-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  ),
  sparkles: (
    <svg className="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
    </svg>
  ),
  clock: (
    <svg className="w-3 h-3 text-white shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  box: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  alertTriangle: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
  alertCircle: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  ),
};

// Product type display info with clean SVG icons
const productTypeInfo: Record<string, { label: string; icon: ReactNode; color: string; border: string }> = {
  frozen: { label: 'Sub-Zero Frozen', icon: Icons.snowflake, color: 'bg-cyan-50 text-cyan-700', border: 'border-cyan-200' },
  fresh: { label: 'Fresh Market', icon: Icons.leaf, color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
  ready_to_eat: { label: 'Ready to Eat', icon: Icons.plate, color: 'bg-orange-50 text-orange-700', border: 'border-orange-200' },
  ready_to_cook: { label: 'Ready to Cook', icon: Icons.pan, color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
};

// Format unit for display
const formatUnit = (unit?: string): string => {
  if (!unit) return '';
  const unitMap: Record<string, string> = {
    piece: 'per piece',
    pack: 'per pack',
    dozen: 'per dozen',
    '100g': 'per 100g',
    '250g': 'per 250g',
    '500g': 'per 500g',
    '1kg': 'per 1 KG',
    kg: 'per KG',
  };
  return unitMap[unit] || unit;
};

function SellerProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInventoryView = searchParams?.get('view') === 'inventory';
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadProducts();
  }, [isAuthenticated, user, router]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/products/seller/my-products');
      if (response.data.success) {
        setProducts(response.data.data.products || []);
      }
    } catch (error: any) {
      console.error('Failed to load products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/products/${productId}`, { isActive: !currentStatus });
      showToast(`Product ${!currentStatus ? 'activated' : 'hidden'} successfully`, 'success');
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update product', 'error');
    }
  };

  const handleQuickStockUpdate = async (productId: string, newStock: number) => {
    if (newStock < 0) {
      showToast('Stock quantity cannot be negative', 'error');
      return;
    }

    try {
      setUpdatingStock((prev) => ({ ...prev, [productId]: true }));
      await apiClient.patch(`/products/${productId}`, { stockQuantity: newStock });
      showToast('Stock updated successfully', 'success');

      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stockQuantity: newStock } : p))
      );
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update stock', 'error');
    } finally {
      setUpdatingStock((prev) => ({ ...prev, [productId]: false }));
    }
  };

  const handleBulkStockUpdate = async () => {
    if (!bulkStockValue || selectedProducts.length === 0) {
      showToast('Please enter stock value and select products', 'error');
      return;
    }

    const stockNum = parseInt(bulkStockValue, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      showToast('Stock quantity must be 0 or higher', 'error');
      return;
    }

    try {
      setLoading(true);
      await Promise.all(
        selectedProducts.map((productId) =>
          apiClient.patch(`/products/${productId}`, { stockQuantity: stockNum })
        )
      );
      showToast(`Successfully updated stock for ${selectedProducts.length} items`, 'success');
      setShowBulkUpdate(false);
      setBulkStockValue('');
      setSelectedProducts([]);
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to bulk update stock', 'error');
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
      showToast('Product removed from catalog', 'success');
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to delete product', 'error');
    }
  };

  // Metrics calculation
  const totalProducts = products.length;
  const inStockCount = products.filter((p) => p.stockQuantity > 10).length;
  const lowStockCount = products.filter((p) => p.stockQuantity > 0 && p.stockQuantity <= 10).length;
  const outOfStockCount = products.filter((p) => p.stockQuantity === 0).length;
  const activeCount = products.filter((p) => p.isActive && p.approvalStatus === 'approved').length;
  const pendingCount = products.filter((p) => p.approvalStatus === 'pending').length;

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

  return (
    <DashboardLayout
      title={isInventoryView ? 'Inventory' : 'Products'}
      subtitle={
        isInventoryView
          ? 'Manage your stock quantities and restock items'
          : 'Manage dishes, pricing, and availability'
      }
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ========================================================================= */}
        {/* Sleek Sub-navigation Tabs */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl p-1.5 border border-slate-200 shadow-sm flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              {
                label: 'All Products',
                icon: Icons.products,
                href: '/sellers/products',
                isActive: !isInventoryView,
                count: totalProducts,
              },
              {
                label: 'Inventory & Stock',
                icon: Icons.inventory,
                href: '/sellers/products?view=inventory',
                isActive: isInventoryView,
                alertCount: lowStockCount + outOfStockCount,
              },
              {
                label: 'Discounts & Deals',
                icon: Icons.discounts,
                href: '/sellers/promotions',
                isActive: false,
              },
            ].map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  tab.isActive
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                <span className="shrink-0">{tab.icon}</span>
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      tab.isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
                {tab.alertCount !== undefined && tab.alertCount > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      tab.isActive
                        ? 'bg-rose-500 text-white'
                        : 'bg-rose-100 text-rose-700 animate-pulse'
                    }`}
                  >
                    {tab.alertCount} alert{tab.alertCount > 1 ? 's' : ''}
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {products.length > 0 && (
              <button
                onClick={() => {
                  setSelectedProducts([]);
                  setBulkStockValue('');
                  setShowBulkUpdate(true);
                }}
                className="flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 hover:border-slate-300 shadow-sm transition-all"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Bulk Stock
                {selectedProducts.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-black text-emerald-700 bg-emerald-100 rounded-full">
                    {selectedProducts.length}
                  </span>
                )}
              </button>
            )}

            <Link href="/sellers/products/new">
              <button className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm hover:shadow transition-all">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Product
              </button>
            </Link>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KPI Strip: Highlights Key Metrics with Clean Icons */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1 */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                {isInventoryView ? 'Tracked Items' : 'Total Listings'}
              </span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                {Icons.box}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {totalProducts}
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">
              {activeCount} active in catalog
            </div>
          </div>

          {/* Card 2 */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-600">
                Healthy Stock
              </span>
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm">
                {Icons.check}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {inStockCount}
            </div>
            <div className="mt-2 text-xs font-medium text-emerald-600 flex items-center gap-1">
              <span>Ready for fast dispatch</span>
            </div>
          </div>

          {/* Card 3 */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-amber-600">
                Low Stock Warning
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold text-sm">
                {Icons.alertTriangle}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-600 tracking-tight">
              {lowStockCount}
            </div>
            <div className="mt-2 text-xs font-medium text-amber-700">
              1 – 10 items remaining
            </div>
          </div>

          {/* Card 4 */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-rose-600">
                Out of Stock
              </span>
              <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold text-sm">
                {Icons.alertCircle}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-rose-600 tracking-tight">
              {outOfStockCount}
            </div>
            <div className="mt-2 text-xs font-medium text-rose-700">
              {outOfStockCount > 0 ? 'Restock immediately' : 'Zero stockouts'}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Search, Filter Chips & Controls */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <svg
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by product title, category, or cuisine..."
              className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </div>

          {/* Filter Chips Bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {/* Stock Filters */}
            {[
              { key: 'all', label: 'All Stock', count: products.length },
              { key: 'in_stock', label: 'Healthy', dot: 'bg-emerald-500', count: inStockCount },
              { key: 'low_stock', label: 'Low Stock', dot: 'bg-amber-500', count: lowStockCount },
              { key: 'out_of_stock', label: 'Out of Stock', dot: 'bg-rose-500', count: outOfStockCount },
            ].map((chip) => (
              <button
                key={chip.key}
                onClick={() => setStockFilter(chip.key as StockFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  stockFilter === chip.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {chip.dot && <span className={`w-2 h-2 rounded-full ${chip.dot} shrink-0`} />}
                <span>{chip.label}</span>
                <span
                  className={`ml-1 text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    stockFilter === chip.key ? 'bg-white/20 text-white' : 'bg-white text-slate-600 shadow-xs'
                  }`}
                >
                  {chip.count}
                </span>
              </button>
            ))}

            {/* Status Filter (when in All Products view) */}
            {!isInventoryView && (
              <div className="flex items-center pl-2 border-l border-slate-200 gap-1">
                {[
                  { key: 'all', label: 'Status: All' },
                  { key: 'active', label: 'Live' },
                  { key: 'hidden', label: 'Hidden' },
                  ...(pendingCount > 0 ? [{ key: 'pending', label: 'Pending Review' }] : []),
                ].map((chip) => (
                  <button
                    key={chip.key}
                    onClick={() => setStatusFilter(chip.key as StatusFilter)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                      statusFilter === chip.key
                        ? 'bg-emerald-700 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Main Products Grid / Content */}
        {/* ========================================================================= */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm animate-pulse">
                <div className="h-48 bg-slate-100" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-6 bg-slate-100 rounded w-1/2" />
                  <div className="h-10 bg-slate-50 rounded-xl" />
                  <div className="h-8 bg-slate-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 sm:p-16 text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-5 text-emerald-600 shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">No Products in Kitchen Yet</h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              Start publishing your ready-to-cook delicacies, sub-zero frozen specials, or fresh market items to get noticed by hungry customers.
            </p>
            <Link href="/sellers/products/new">
              <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/20 px-6">
                Add Your First Dish
              </Button>
            </Link>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 text-center max-w-xl mx-auto">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-500">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">No products match criteria</h3>
            <p className="text-xs text-slate-500 mb-5">Try modifying your search query or switching the stock filter.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStockFilter('all');
                setStatusFilter('all');
              }}
              className="rounded-xl font-bold text-xs"
            >
              Reset Filters
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredProducts.map((product) => {
              const isLow = product.stockQuantity > 0 && product.stockQuantity <= 10;
              const isOut = product.stockQuantity === 0;
              const typeMeta = productTypeInfo[product.productType || 'frozen'] || productTypeInfo.frozen;

              return (
                <div
                  key={product.id}
                  className={`bg-white rounded-3xl shadow-sm border transition-all duration-300 flex flex-col justify-between overflow-hidden group hover:shadow-xl hover:-translate-y-0.5 ${
                    isOut
                      ? 'border-rose-300 ring-1 ring-rose-100'
                      : isLow
                      ? 'border-amber-300 ring-1 ring-amber-100'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header & Thumbnail */}
                  <div>
                    <div className="h-48 bg-slate-100 relative overflow-hidden">
                      {product.images && product.images[0] ? (
                        <img
                          src={
                            product.images[0].imageUrl.startsWith('http')
                              ? product.images[0].imageUrl
                              : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3001'}${product.images[0].imageUrl}`
                          }
                          alt={product.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200">
                          <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                          </svg>
                          <span className="text-[11px] font-semibold text-slate-400">No Image Uploaded</span>
                        </div>
                      )}

                      {/* Top Gradient Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />

                      {/* Badges Overlay */}
                      <div className="absolute top-3 left-3 right-3 flex items-center justify-between gap-2 pointer-events-auto">
                        {/* Type Badge with SVG Icon */}
                        <span
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-bold backdrop-blur-md border shadow-xs flex items-center gap-1.5 ${typeMeta.color} ${typeMeta.border}`}
                        >
                          {typeMeta.icon}
                          <span>{typeMeta.label}</span>
                        </span>

                        {/* Status / Moderation Badge */}
                        {product.approvalStatus === 'pending' ? (
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-sm bg-amber-500 text-white backdrop-blur-md flex items-center gap-1">
                            {Icons.clock}
                            <span>Under Review</span>
                          </span>
                        ) : product.approvalStatus === 'rejected' ? (
                          <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-sm bg-rose-600 text-white backdrop-blur-md">
                            ✕ Rejected
                          </span>
                        ) : (
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold shadow-xs flex items-center gap-1.5 backdrop-blur-md ${
                              product.isActive
                                ? 'bg-emerald-600/90 text-white'
                                : 'bg-slate-800/80 text-slate-200'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                product.isActive ? 'bg-emerald-200 animate-pulse' : 'bg-slate-400'
                              }`}
                            />
                            {product.isActive ? 'Live' : 'Hidden'}
                          </span>
                        )}
                      </div>

                      {/* Shelf Life / Category bottom badge on image */}
                      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between pointer-events-none text-white text-[11px] font-bold drop-shadow-sm">
                        <span>{product.category?.name || 'General'}</span>
                        {product.shelfLifeHours ? (
                          <span className="bg-black/50 px-2 py-0.5 rounded-lg backdrop-blur-xs flex items-center gap-1">
                            {Icons.clock}
                            <span>{product.shelfLifeHours}h shelf</span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {/* Product Details Content */}
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <h3 className="font-bold text-slate-900 text-base leading-snug line-clamp-2 group-hover:text-emerald-700 transition-colors">
                          {product.name}
                        </h3>
                      </div>

                      {/* Price & Unit */}
                      <div className="flex items-baseline justify-between mb-3">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-xl font-black text-slate-900 tracking-tight">
                            {formatPrice(product.price)}
                          </span>
                          {product.unit && (
                            <span className="text-xs font-semibold text-slate-400">
                              {formatUnit(product.unit)}
                            </span>
                          )}
                        </div>

                        {/* Stock status pill */}
                        <div
                          className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 ${
                            isOut
                              ? 'bg-rose-100 text-rose-800'
                              : isLow
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              isOut ? 'bg-rose-500' : isLow ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                          />
                          {isOut ? 'Out of stock' : `${product.stockQuantity} in stock`}
                        </div>
                      </div>

                      {/* Visual Inventory Level Bar */}
                      <div className="mb-3.5">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1">
                          <span>Stock Level</span>
                          <span className={isOut ? 'text-rose-600' : isLow ? 'text-amber-600' : 'text-slate-600'}>
                            {product.stockQuantity} units
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isOut
                                ? 'w-0'
                                : isLow
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{
                              width: `${Math.min(100, Math.max(5, (product.stockQuantity / 50) * 100))}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Profit Strip with SVG icon */}
                      {product.costPrice && product.costPrice > 0 ? (
                        <div className="mb-4 px-3 py-2 bg-emerald-50/70 border border-emerald-100 rounded-2xl flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                            {Icons.sparkles}
                            <span>Margin</span>
                          </span>
                          <span className="font-black text-emerald-700">
                            {formatPrice(product.price - product.costPrice - product.price * 0.15)}
                            <span className="text-[10px] font-bold text-emerald-600 ml-1">
                              ({(
                                ((product.price - product.costPrice - product.price * 0.15) / product.price) *
                                100
                              ).toFixed(0)}
                              %)
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="mb-4 h-[38px] flex items-center text-[11px] text-slate-400 px-1">
                          <span>No cost price recorded</span>
                        </div>
                      )}

                      {/* Inline Stock Adjustment Drawer (When Active) */}
                      {editingStock[product.id] && (
                        <div className="mb-4 p-3 bg-slate-50 border border-slate-200 rounded-2xl space-y-2 animate-in fade-in zoom-in-95 duration-150">
                          <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                            <span>Adjust Stock Level</span>
                            <span className="text-slate-400">Current: {product.stockQuantity}</span>
                          </div>

                          {/* Stepper shortcuts */}
                          <div className="grid grid-cols-4 gap-1.5">
                            {[-5, -1, 1, 5].map((delta) => {
                              const curr = stockValues[product.id] ?? product.stockQuantity;
                              const target = Math.max(0, curr + delta);
                              return (
                                <button
                                  key={delta}
                                  type="button"
                                  onClick={() => setStockValues((prev) => ({ ...prev, [product.id]: target }))}
                                  className="py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 transition-colors"
                                >
                                  {delta > 0 ? `+${delta}` : delta}
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="number"
                              min="0"
                              value={stockValues[product.id] ?? product.stockQuantity}
                              onChange={(e) =>
                                setStockValues((prev) => ({
                                  ...prev,
                                  [product.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                }))
                              }
                              className="w-24 px-3 py-1.5 border border-slate-300 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                              disabled={updatingStock[product.id]}
                              autoFocus
                            />

                            <button
                              type="button"
                              onClick={async () => {
                                const val = stockValues[product.id] ?? product.stockQuantity;
                                await handleQuickStockUpdate(product.id, val);
                                setEditingStock((prev) => ({ ...prev, [product.id]: false }));
                              }}
                              disabled={updatingStock[product.id]}
                              className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1"
                            >
                              {updatingStock[product.id] ? (
                                <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <>Save</>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingStock((prev) => ({ ...prev, [product.id]: false }));
                                setStockValues((prev) => ({ ...prev, [product.id]: product.stockQuantity }));
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
                              title="Cancel"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Bottom Action Toolbar */}
                  <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/50 mt-auto">
                    <div className="grid grid-cols-4 gap-1.5 pt-3">
                      {/* Quick Stock Toggle */}
                      <button
                        onClick={() =>
                          setEditingStock((prev) => ({ ...prev, [product.id]: !prev[product.id] }))
                        }
                        className={`flex items-center justify-center p-2.5 rounded-xl border transition-all ${
                          editingStock[product.id]
                            ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                        }`}
                        title="Quick Stock Adjustment"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                      </button>

                      {/* Edit Product */}
                      <Link href={`/sellers/products/${product.id}/edit`} className="w-full">
                        <button
                          className="w-full flex items-center justify-center p-2.5 rounded-xl bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 hover:border-slate-300 transition-all"
                          title="Edit Details"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
                          </svg>
                        </button>
                      </Link>

                      {/* Live / Hide Toggle */}
                      <button
                        onClick={() => handleToggleActive(product.id, product.isActive)}
                        className={`flex items-center justify-center p-2.5 rounded-xl border transition-all ${
                          product.isActive
                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        }`}
                        title={product.isActive ? 'Hide from store' : 'Publish to store'}
                      >
                        {product.isActive ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>

                      {/* Delete */}
                      <button
                        onClick={() => {
                          if (confirm(`Are you sure you want to permanently delete "${product.name}"?`)) {
                            handleDeleteProduct(product.id);
                          }
                        }}
                        className="flex items-center justify-center p-2.5 rounded-xl bg-white text-rose-600 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 transition-all"
                        title="Delete Product"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* High-End Bulk Stock Update Modal */}
      {/* ========================================================================= */}
      {showBulkUpdate && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-slate-100">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  <span className="text-slate-600">{Icons.box}</span>
                  <span>Bulk Inventory Restock</span>
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Update inventory count simultaneously across multiple catalog dishes.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowBulkUpdate(false);
                  setSelectedProducts([]);
                  setBulkStockValue('');
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* Value Input and Quick Presets */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
                <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                  Target Stock Quantity
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={bulkStockValue}
                    onChange={(e) => setBulkStockValue(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-36 px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-lg font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    autoFocus
                  />
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[0, 10, 25, 50, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBulkStockValue(String(preset))}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                          bulkStockValue === String(preset)
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {preset === 0 ? 'Out of stock (0)' : `${preset} units`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Product Selection List with Search */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Select Products ({selectedProducts.length} chosen)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedProducts(products.map((p) => p.id))}
                      className="px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProducts([])}
                      className="px-2.5 py-1 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <input
                  type="text"
                  value={bulkModalSearch}
                  onChange={(e) => setBulkModalSearch(e.target.value)}
                  placeholder="Filter items in list..."
                  className="w-full px-3.5 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 bg-slate-50"
                />

                <div className="max-h-60 overflow-y-auto space-y-2 border border-slate-100 rounded-2xl p-2 bg-slate-50/50">
                  {products
                    .filter((p) =>
                      bulkModalSearch.trim()
                        ? p.name.toLowerCase().includes(bulkModalSearch.toLowerCase())
                        : true
                    )
                    .map((product) => {
                      const isSelected = selectedProducts.includes(product.id);
                      return (
                        <div
                          key={product.id}
                          onClick={() => toggleProductSelection(product.id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                            isSelected
                              ? 'bg-emerald-50 border-emerald-400 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleProductSelection(product.id)}
                              className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                            />
                            <div>
                              <p className="text-xs font-bold text-slate-900">{product.name}</p>
                              <p className="text-[11px] text-slate-500 font-medium">
                                Current stock: {product.stockQuantity}
                              </p>
                            </div>
                          </div>
                          <span className="text-xs font-bold text-slate-700">
                            {formatPrice(product.price)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowBulkUpdate(false);
                  setSelectedProducts([]);
                  setBulkStockValue('');
                }}
                className="flex-1 rounded-xl font-bold text-xs"
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkStockUpdate}
                disabled={!bulkStockValue || selectedProducts.length === 0 || loading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-md shadow-emerald-600/20"
              >
                {loading
                  ? 'Updating...'
                  : `Apply Restock to ${selectedProducts.length} Items`}
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
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500" />
        </div>
      }
    >
      <SellerProductsContent />
    </Suspense>
  );
}
