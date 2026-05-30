'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

const sidebarItems = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: '' },
  { name: 'Orders', href: '/sellers/orders', icon: '' },
  { name: 'Products', href: '/sellers/products', icon: '' },
  { name: 'Inventory', href: '/sellers/products?view=inventory', icon: '' },
  { name: 'Promotions', href: '/sellers/promotions', icon: '' },
  { name: 'Delivery', href: '/sellers/settings#delivery', icon: '' },
  { name: 'Earnings', href: '/sellers/earnings', icon: '' },
  { name: 'Analytics', href: '/sellers/analytics', icon: '' },
  { name: 'Notifications', href: '/sellers/notifications', icon: '' },
  { name: 'Settings', href: '/sellers/settings', icon: '' },
];

// Icons
const Icons = {
  plus: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  tag: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  clock: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  fire: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  ),
};

interface Promotion {
  id: string;
  name: string;
  type: 'percentage' | 'fixed' | 'buy_x_get_y' | 'bundle';
  discountValue: number;
  startDate: string;
  endDate: string;
  status: 'active' | 'scheduled' | 'expired' | 'draft';
  usageCount: number;
  products: string[];
  code?: string;
  minOrderAmount?: number;
  usageLimitTotal?: number | null;
  applicableProductIds?: string[];
}

// Modal for creating/editing promotions
interface CreatePromotionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  onUpdate?: (id: string, data: any) => void;
  onError?: (message: string) => void;
  initialData?: Promotion | null;
  promotionId?: string | null;
}

interface SellerProduct {
  id: string;
  name: string;
  price: number;
  stockQuantity: number;
  approvalStatus?: string;
}

function CreatePromotionModal({ isOpen, onClose, onSubmit, onUpdate, onError, initialData, promotionId }: CreatePromotionModalProps) {
  const isEditMode = Boolean(promotionId && initialData);
  const [formData, setFormData] = useState({
    name: '',
    type: 'percentage',
    discountValue: '',
    startDate: '',
    endDate: '',
    code: '',
    minOrderValue: '',
    maxUsage: '',
  });
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadError, setProductsLoadError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  const loadProductsForPromotion = useCallback(() => {
    setProductsLoadError(null);
    setProductsLoading(true);
    apiClient
      .get<{ success: boolean; data: { products?: SellerProduct[]; pagination?: { total: number } } }>(
        '/products/seller/my-products',
        { params: { limit: 100 } }
      )
      .then((res) => {
        const data = res.data?.data;
        const raw = Array.isArray(data?.products)
          ? data.products
          : Array.isArray(data)
            ? data
            : [];
        const list = (raw as unknown[]).map((rawItem) => {
          const p = rawItem as Record<string, unknown>;
          return {
            id: String(p.id ?? ''),
            name: String(p.name ?? p.title ?? ''),
            price: Number(p.price ?? 0),
            stockQuantity: Number(p.stockQuantity ?? p.stock_quantity ?? 0),
            approvalStatus: (p.approvalStatus ?? p.approval_status) as string | undefined,
          };
        }).filter((p) => p.id);
        setProducts(list);
      })
      .catch((err) => {
        console.error('Failed to load products for promotion:', err);
        setProducts([]);
        const isNetwork = err.code === 'ERR_NETWORK' || err.message?.includes('Network Error');
        setProductsLoadError(
          isNetwork
            ? 'Connection refused — the backend is not running.'
            : (err.response?.data?.error?.message ?? err.response?.data?.message ?? err.message ?? 'Failed to load products')
        );
        if (!isNetwork) onError?.(err.response?.data?.error?.message ?? err.message ?? 'Failed to load products');
      })
      .finally(() => setProductsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError is optional and stable enough
  }, []);

  // Prefill form when editing
  useEffect(() => {
    if (isOpen && initialData) {
      const start = initialData.startDate.slice(0, 16);
      const end = initialData.endDate.slice(0, 16);
      setFormData({
        name: initialData.name,
        type: initialData.type === 'fixed' ? 'fixed' : 'percentage',
        discountValue: String(initialData.discountValue),
        startDate: start,
        endDate: end,
        code: initialData.code || '',
        minOrderValue: initialData.minOrderAmount != null ? String(initialData.minOrderAmount) : '',
        maxUsage: initialData.usageLimitTotal != null ? String(initialData.usageLimitTotal) : '',
      });
      setSelectedProductIds(initialData.applicableProductIds ?? initialData.products ?? []);
    } else if (isOpen && !initialData) {
      setFormData({
        name: '',
        type: 'percentage',
        discountValue: '',
        startDate: '',
        endDate: '',
        code: '',
        minOrderValue: '',
        maxUsage: '',
      });
      setSelectedProductIds([]);
    }
  }, [isOpen, initialData]);

  // Load seller's products when modal opens
  useEffect(() => {
    if (isOpen) loadProductsForPromotion();
  }, [isOpen, loadProductsForPromotion]);

  const handleClose = () => {
    setSelectedProductIds([]);
    setProductSearch('');
    setProductsLoadError(null);
    onClose();
  };

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const filteredProducts = productSearch.trim()
    ? products.filter((p) => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : products;

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedProductIds.length === 0) return;
    const data = { ...formData, applyTo: 'selected' as const, selectedProductIds };
    if (isEditMode && promotionId && onUpdate) {
      onUpdate(promotionId, data);
    } else {
      onSubmit(data);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">{isEditMode ? 'Edit Promotion' : 'Create New Promotion'}</h2>
            <button 
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Promotion Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Promotion Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Eid Special Sale"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              required
            />
          </div>

          {/* Promotion Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Discount Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'percentage', label: 'Percentage Off', desc: 'e.g., 20% off', icon: '💯' },
                { value: 'fixed', label: 'Fixed Amount', desc: 'e.g., Rs. 100 off', icon: '💵' },
                { value: 'buy_x_get_y', label: 'Buy X Get Y', desc: 'e.g., Buy 2 Get 1', icon: '🎁' },
                { value: 'bundle', label: 'Bundle Deal', desc: 'Combo offers', icon: '📦' },
              ].map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    formData.type === type.value
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{type.icon}</span>
                  <div className="font-medium text-gray-900 mt-2">{type.label}</div>
                  <div className="text-xs text-gray-500">{type.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Discount Value */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Discount Value <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                {formData.type === 'percentage' && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                )}
                {formData.type === 'fixed' && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">Rs.</span>
                )}
                <input
                  type="number"
                  value={formData.discountValue}
                  onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                  placeholder={formData.type === 'percentage' ? '20' : '100'}
                  className={`w-full py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent ${
                    formData.type === 'fixed' ? 'pl-12 pr-4' : 'px-4'
                  }`}
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Promo Code (Optional)
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g., EID2024"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent uppercase"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                required
              />
            </div>
          </div>

          {/* Additional Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Minimum Order Value
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">Rs.</span>
                <input
                  type="number"
                  value={formData.minOrderValue}
                  onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                  placeholder="0"
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Usage (Total)
              </label>
              <input
                type="number"
                value={formData.maxUsage}
                onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                placeholder="Unlimited"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Selected Products */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Apply Promotion To
            </label>
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <span className="text-sm font-medium text-gray-700">
                  Selected Products
                  {selectedProductIds.length > 0 && (
                    <span className="ml-2 text-orange-600">
                      ({selectedProductIds.length} selected)
                    </span>
                  )}
                </span>
                {!productsLoadError && filteredProducts.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedProductIds(filteredProducts.map((p) => p.id))
                    }
                    className="text-sm font-medium text-orange-600 hover:text-orange-700 whitespace-nowrap"
                  >
                    Select all
                  </button>
                )}
              </div>
              {!productsLoadError && (
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Search products by name..."
                  className="w-full mb-3 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
              )}
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {productsLoadError ? (
                  <div className="py-6 px-4 text-center">
                    <p className="text-sm font-medium text-red-600 mb-2">
                      {productsLoadError}
                    </p>
                    <p className="text-xs text-gray-600 mb-4">
                      Start the backend in a terminal: <code className="bg-gray-200 px-1.5 py-0.5 rounded text-xs">cd backend && npm run dev</code>
                    </p>
                    <button
                      type="button"
                      onClick={loadProductsForPromotion}
                      className="px-4 py-2 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600"
                    >
                      Retry
                    </button>
                  </div>
                ) : productsLoading ? (
                  <div className="py-6 text-center text-sm text-gray-500">Loading your products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-500">
                    {products.length === 0
                      ? 'You have no products yet. Add products first.'
                      : 'No products match your search.'}
                  </div>
                ) : (
                  filteredProducts.map((product) => (
                    <label
                      key={product.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => toggleProduct(product.id)}
                        className="rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                      />
                      <span className="flex-1 text-sm font-medium text-gray-900 truncate">
                        {product.name}
                      </span>
                      <span className="text-sm text-gray-500 shrink-0">
                        {formatPrice(product.price)}
                      </span>
                    </label>
                  ))
                )}
              </div>
              {selectedProductIds.length === 0 && !productsLoadError && !productsLoading && products.length > 0 && (
                <p className="mt-2 text-xs text-amber-600">
                  Select at least one product above.
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 py-3"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={selectedProductIds.length === 0}
              className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isEditMode ? 'Update Promotion' : 'Create Promotion'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SellerPromotionsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'scheduled' | 'expired'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailPromo, setDetailPromo] = useState<Promotion | null>(null);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

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

    loadPromotions();
  }, [isAuthenticated, user, router]);

  const loadPromotions = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/promotions');
      if (response.data.success && Array.isArray(response.data.data)) {
        const list = response.data.data as Array<{
          id: string;
          code: string;
          name: string;
          type: string;
          discountValue: number;
          startDate: string;
          endDate: string;
          status: string;
          usageCount: number;
          minOrderAmount?: number;
          usageLimitTotal?: number | null;
          applicableTo?: string;
          applicableProductIds?: string[];
        }>;
        setPromotions(
          list.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type as Promotion['type'],
            discountValue: p.discountValue,
            startDate: typeof p.startDate === 'string' ? p.startDate : new Date(p.startDate).toISOString(),
            endDate: typeof p.endDate === 'string' ? p.endDate : new Date(p.endDate).toISOString(),
            status: p.status as Promotion['status'],
            usageCount: p.usageCount,
            products: p.applicableProductIds ?? [],
            code: p.code,
            minOrderAmount: p.minOrderAmount,
            usageLimitTotal: p.usageLimitTotal,
            applicableProductIds: p.applicableProductIds,
          }))
        );
      } else {
        setPromotions([]);
      }
    } catch (error: any) {
      console.error('Failed to load promotions:', error);
      setPromotions([]);
      if (error.response?.status !== 403) {
        showToast(error.response?.data?.error?.message || 'Failed to load promotions', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePromotion = async (data: any) => {
    const discountType = data.type === 'fixed' || data.type === 'percentage' ? data.type : 'percentage';
    if (data.type && !['fixed', 'percentage'].includes(data.type)) {
      showToast('Only percentage and fixed amount discounts are supported. Created as percentage.', 'info');
    }
    const code = (data.code || data.name?.replace(/\s/g, '').toUpperCase().slice(0, 20) || 'PROMO').toUpperCase().replace(/\s/g, '');
    const discountValue = Number(data.discountValue);
    const minOrderAmount = Number(data.minOrderValue) || 0;
    const maxUsageNum = data.maxUsage != null && data.maxUsage !== '' ? parseInt(String(data.maxUsage), 10) : NaN;
    const usageLimitTotal = Number.isInteger(maxUsageNum) && maxUsageNum >= 1 ? maxUsageNum : null;
    const payload: Record<string, unknown> = {
      name: String(data.name || '').trim() || 'Promotion',
      code: (code || 'PROMO' + Date.now()).slice(0, 50),
      description: (data.name || '').trim() || undefined,
      discountType,
      discountValue: Number.isFinite(discountValue) && discountValue >= 0 ? discountValue : 0,
      maxDiscountAmount: null,
      minOrderAmount: minOrderAmount >= 0 ? minOrderAmount : 0,
      usageLimitTotal,
      usageLimitPerUser: 1,
      validFrom: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
      validUntil: data.endDate ? new Date(data.endDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    payload.applyTo = 'selected';
    payload.productIds = Array.isArray(data.selectedProductIds) ? data.selectedProductIds : [];
    try {
      const response = await apiClient.post('/promotions', payload);
      if (response.data.success) {
        showToast('Promotion created successfully!', 'success');
        setShowCreateModal(false);
        loadPromotions();
      } else {
        showToast('Failed to create promotion', 'error');
      }
    } catch (error: any) {
      const err = error.response?.data?.error;
      const details = err?.details as Array<{ field?: string; message?: string }> | undefined;
      const msg = details?.length
        ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('. ')
        : (err?.message ?? error.response?.data?.message ?? 'Failed to create promotion');
      showToast(msg, 'error');
    }
  };

  const handleUpdatePromotion = async (id: string, data: any) => {
    const discountType = data.type === 'fixed' || data.type === 'percentage' ? data.type : 'percentage';
    const code = (data.code || data.name?.replace(/\s/g, '').toUpperCase().slice(0, 20) || 'PROMO').toUpperCase().replace(/\s/g, '');
    const discountValue = Number(data.discountValue);
    const minOrderAmount = Number(data.minOrderValue) || 0;
    const maxUsageNum = data.maxUsage != null && data.maxUsage !== '' ? parseInt(String(data.maxUsage), 10) : NaN;
    const usageLimitTotal = Number.isInteger(maxUsageNum) && maxUsageNum >= 1 ? maxUsageNum : null;
    const payload: Record<string, unknown> = {
      name: String(data.name || '').trim() || 'Promotion',
      code: (code || 'PROMO').slice(0, 50),
      description: (data.name || '').trim() || undefined,
      discountType,
      discountValue: Number.isFinite(discountValue) && discountValue >= 0 ? discountValue : 0,
      maxDiscountAmount: null,
      minOrderAmount: minOrderAmount >= 0 ? minOrderAmount : 0,
      usageLimitTotal,
      usageLimitPerUser: 1,
      validFrom: data.startDate ? new Date(data.startDate).toISOString() : new Date().toISOString(),
      validUntil: data.endDate ? new Date(data.endDate).toISOString() : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    payload.applyTo = 'selected';
    payload.productIds = Array.isArray(data.selectedProductIds) ? data.selectedProductIds : [];
    try {
      const response = await apiClient.patch(`/promotions/${id}`, payload);
      if (response.data.success) {
        showToast('Promotion updated successfully!', 'success');
        setShowCreateModal(false);
        setEditingPromo(null);
        loadPromotions();
      } else {
        showToast('Failed to update promotion', 'error');
      }
    } catch (error: any) {
      const err = error.response?.data?.error;
      const details = err?.details as Array<{ field?: string; message?: string }> | undefined;
      const msg = details?.length
        ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('. ')
        : (err?.message ?? error.response?.data?.message ?? 'Failed to update promotion');
      showToast(msg, 'error');
    }
  };

  const handleDeletePromotion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;
    try {
      await apiClient.delete(`/promotions/${id}`);
      showToast('Promotion deleted', 'success');
      setPromotions(promotions.filter((p) => p.id !== id));
      if (detailPromo?.id === id) setDetailPromo(null);
      if (editingPromo?.id === id) { setEditingPromo(null); setShowCreateModal(false); }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to delete promotion', 'error');
    }
  };

  const filteredPromotions = promotions.filter(p => {
    if (activeTab === 'all') return true;
    return p.status === activeTab;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-green-100 text-green-700',
      scheduled: 'bg-blue-100 text-blue-700',
      expired: 'bg-gray-100 text-gray-500',
      draft: 'bg-yellow-100 text-yellow-700',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      percentage: '💯',
      fixed: '💵',
      buy_x_get_y: '🎁',
      bundle: '📦',
    };
    return icons[type as keyof typeof icons] || '🏷️';
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Promotions & Deals"
      subtitle="Create and manage special offers for your customers"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Active Deals', value: promotions.filter(p => p.status === 'active').length, color: 'green', icon: '🔥' },
            { label: 'Scheduled', value: promotions.filter(p => p.status === 'scheduled').length, color: 'blue', icon: '📅' },
            { label: 'Total Usage', value: promotions.reduce((acc, p) => acc + p.usageCount, 0), color: 'purple', icon: '📊' },
            { label: 'Expired', value: promotions.filter(p => p.status === 'expired').length, color: 'gray', icon: '⏱️' },
          ].map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex items-center gap-3">
                <div className="text-2xl">{stat.icon}</div>
                <div>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Header with Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex gap-2 overflow-x-auto pb-2 sm:pb-0">
            {[
              { id: 'all', label: 'All Deals' },
              { id: 'active', label: 'Active' },
              { id: 'scheduled', label: 'Scheduled' },
              { id: 'expired', label: 'Expired' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-200'
                    : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          <Button 
            onClick={() => setShowCreateModal(true)}
            className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-200 flex items-center gap-2"
          >
            {Icons.plus}
            Create Deal
          </Button>
        </div>

        {/* Promotions List */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading promotions...</p>
          </div>
        ) : filteredPromotions.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.tag}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {activeTab === 'all' ? 'No promotions yet' : `No ${activeTab} promotions`}
            </h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Create special deals and discounts to attract more customers and boost your sales.
            </p>
            <Button 
              onClick={() => setShowCreateModal(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-200"
            >
              Create Your First Deal
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPromotions.map((promo) => (
              <div 
                key={promo.id} 
                role="button"
                tabIndex={0}
                onClick={() => setDetailPromo(promo)}
                onKeyDown={(e) => e.key === 'Enter' && setDetailPromo(promo)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  {/* Icon & Name */}
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl flex items-center justify-center text-2xl">
                      {getTypeIcon(promo.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900 text-lg">{promo.name}</h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadge(promo.status)}`}>
                          {promo.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
                        {promo.code && (
                          <span className="bg-gray-100 px-2 py-0.5 rounded font-mono text-xs">
                            {promo.code}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          {Icons.clock}
                          {new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Discount */}
                  <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl px-6 py-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {promo.type === 'percentage' && `${promo.discountValue}%`}
                      {promo.type === 'fixed' && formatPrice(promo.discountValue)}
                      {promo.type === 'buy_x_get_y' && 'B2G1'}
                      {promo.type === 'bundle' && 'Bundle'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {promo.type === 'percentage' && 'OFF'}
                      {promo.type === 'fixed' && 'OFF'}
                      {promo.type === 'buy_x_get_y' && 'Free'}
                      {promo.type === 'bundle' && 'Deal'}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="text-center px-4">
                    <div className="text-xl font-bold text-gray-900">{promo.usageCount}</div>
                    <div className="text-xs text-gray-500">Times Used</div>
                  </div>

                  {/* Actions - stop propagation so clicking buttons doesn't open detail */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1"
                      onClick={() => {
                        setEditingPromo(promo);
                        setShowCreateModal(true);
                      }}
                    >
                      {Icons.edit}
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                      onClick={() => setDetailPromo(promo)}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      Detail
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-1"
                      onClick={() => handleDeletePromotion(promo.id)}
                    >
                      {Icons.trash}
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick Tips */}
        <div className="mt-8 bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-6 border border-orange-100">
          <div className="flex items-start gap-4">
            <div className="text-3xl">{Icons.fire}</div>
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">Tips for Effective Promotions</h3>
              <ul className="text-sm text-gray-600 space-y-1.5">
                <li>• Create time-limited deals to create urgency</li>
                <li>• Use clear promo codes that are easy to remember</li>
                <li>• Bundle slow-moving items with popular ones</li>
                <li>• Run promotions during festivals and special occasions</li>
                <li>• Test different discount types to see what works best</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      {detailPromo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailPromo(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Promotion Details</h2>
              <button
                type="button"
                onClick={() => setDetailPromo(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-semibold text-gray-900">{detailPromo.name}</p>
              </div>
              {detailPromo.code && (
                <div>
                  <p className="text-sm text-gray-500">Promo Code</p>
                  <p className="font-mono font-medium text-gray-900">{detailPromo.code}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Discount</p>
                <p className="font-semibold text-orange-600">
                  {detailPromo.type === 'percentage' && `${detailPromo.discountValue}% off`}
                  {detailPromo.type === 'fixed' && `${formatPrice(detailPromo.discountValue)} off`}
                  {detailPromo.type === 'buy_x_get_y' && 'Buy X Get Y'}
                  {detailPromo.type === 'bundle' && 'Bundle deal'}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Valid</p>
                <p className="text-gray-900">
                  {new Date(detailPromo.startDate).toLocaleString()} – {new Date(detailPromo.endDate).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-500">Status</p>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadge(detailPromo.status)}`}>
                  {detailPromo.status}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Times used</p>
                <p className="font-medium text-gray-900">{detailPromo.usageCount}</p>
              </div>
              {(detailPromo.minOrderAmount != null && detailPromo.minOrderAmount > 0) && (
                <div>
                  <p className="text-sm text-gray-500">Minimum order</p>
                  <p className="text-gray-900">{formatPrice(detailPromo.minOrderAmount)}</p>
                </div>
              )}
              {(detailPromo.usageLimitTotal != null && detailPromo.usageLimitTotal > 0) && (
                <div>
                  <p className="text-sm text-gray-500">Max usage (total)</p>
                  <p className="text-gray-900">{detailPromo.usageLimitTotal}</p>
                </div>
              )}
              <div className="pt-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setDetailPromo(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => {
                    setEditingPromo(detailPromo);
                    setDetailPromo(null);
                    setShowCreateModal(true);
                  }}
                >
                  {Icons.edit}
                  Edit
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Promotion Modal */}
      <CreatePromotionModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingPromo(null); }}
        onSubmit={handleCreatePromotion}
        onUpdate={handleUpdatePromotion}
        onError={(msg) => showToast(msg, 'error')}
        initialData={editingPromo}
        promotionId={editingPromo?.id ?? null}
      />
    </DashboardLayout>
  );
}
