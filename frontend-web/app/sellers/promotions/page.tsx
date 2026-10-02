'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

// Clean Modern Icons
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
  plus: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  tag: (
    <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.386a11.175 11.175 0 004.914-4.914c.486-.827.313-1.908-.386-2.607L11.159 3.659A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  ),
  clock: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
    <svg className="w-4 h-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  ),
  calendar: (
    <svg className="w-4 h-4 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
    </svg>
  ),
  chart: (
    <svg className="w-4 h-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  copy: (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  ),
  percent: (
    <svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5 1.5a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-11 6a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
    </svg>
  ),
  cash: (
    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
    </svg>
  ),
  gift: (
    <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.25v8.25a1.5 1.5 0 01-1.5 1.5H4.5a1.5 1.5 0 01-1.5-1.5v-8.25M12 4.875A2.625 2.625 0 109.375 7.5H12m0-2.625V7.5m0-2.625A2.625 2.625 0 1114.625 7.5H12m0 0V21m-8.625-9.75h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  bundle: (
    <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m16.5 0H3.75m16.5 0a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25m16.5 0v3.75a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V7.5" />
    </svg>
  ),
  lightbulb: (
    <svg className="w-5 h-5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.5h-4.5a.75.75 0 01-.75-.75v-.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v.75a.75.75 0 01-.75.75zm-6-8.25a6 6 0 1112 0c0 2.26-1.25 4.228-3.09 5.25H9.09A5.986 5.986 0 016 11.25z" />
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

function CreatePromotionModal({
  isOpen,
  onClose,
  onSubmit,
  onUpdate,
  onError,
  initialData,
  promotionId,
}: CreatePromotionModalProps) {
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
        const list = (raw as unknown[])
          .map((rawItem) => {
            const p = rawItem as Record<string, unknown>;
            return {
              id: String(p.id ?? ''),
              name: String(p.name ?? p.title ?? ''),
              price: Number(p.price ?? 0),
              stockQuantity: Number(p.stockQuantity ?? p.stock_quantity ?? 0),
              approvalStatus: (p.approvalStatus ?? p.approval_status) as string | undefined,
            };
          })
          .filter((p) => p.id);
        setProducts(list);
      })
      .catch((err) => {
        console.error('Failed to load products for promotion:', err);
        setProducts([]);
        const isNetwork = err.code === 'ERR_NETWORK' || err.message?.includes('Network Error');
        setProductsLoadError(
          isNetwork
            ? 'Connection refused — the backend is not running.'
            : err.response?.data?.error?.message ?? err.response?.data?.message ?? err.message ?? 'Failed to load products'
        );
        if (!isNetwork) onError?.(err.response?.data?.error?.message ?? err.message ?? 'Failed to load products');
      })
      .finally(() => setProductsLoading(false));
  }, [onError]);

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
      setSelectedProductIds(initialData.products ?? initialData.applicableProductIds ?? []);
      loadProductsForPromotion();
    } else if (isOpen) {
      const now = new Date();
      const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      setFormData({
        name: '',
        type: 'percentage',
        discountValue: '15',
        startDate: now.toISOString().slice(0, 16),
        endDate: end.toISOString().slice(0, 16),
        code: '',
        minOrderValue: '',
        maxUsage: '',
      });
      setSelectedProductIds([]);
      loadProductsForPromotion();
    }
  }, [isOpen, initialData, loadProductsForPromotion]);

  const toggleProduct = (productId: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const handleClose = () => {
    onClose();
  };

  const filteredModalProducts = products.filter((p) =>
    productSearch.trim() ? p.name.toLowerCase().includes(productSearch.toLowerCase()) : true
  );

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-100 flex flex-col">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span className="text-orange-500">{Icons.discounts}</span>
              <span>{isEditMode ? 'Edit Promotion Campaign' : 'Create Special Deal & Discount'}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Attract customer orders with time-sensitive vouchers and percentage discounts.
            </p>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition-colors"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6 flex-1">
          {/* Promotion Name */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Campaign Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g. Weekend Flash Feast / Eid Mubarak Offer"
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
              required
            />
          </div>

          {/* Promotion Type Selector */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              Discount Structure <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { value: 'percentage', label: 'Percentage Off', desc: 'e.g. 20% savings', icon: Icons.percent },
                { value: 'fixed', label: 'Fixed Cash Off', desc: 'e.g. ₨ 200 off', icon: Icons.cash },
                { value: 'buy_x_get_y', label: 'Buy X Get Y', desc: 'e.g. B2G1 free meal', icon: Icons.gift },
                { value: 'bundle', label: 'Combo Bundle', desc: 'Curated value pack', icon: Icons.bundle },
              ].map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, type: type.value })}
                  className={`p-3.5 rounded-2xl border text-start transition-all ${
                    formData.type === type.value
                      ? 'border-orange-500 bg-orange-50/60 ring-1 ring-orange-400 shadow-xs'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center mb-1">
                    {type.icon}
                  </div>
                  <div className="font-bold text-slate-900 text-xs sm:text-sm mt-1">{type.label}</div>
                  <div className="text-[11px] text-slate-500 font-medium">{type.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Discount Value & Promo Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Discount Amount <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                {formData.type === 'fixed' && (
                  <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₨</span>
                )}
                <input
                  type="number"
                  value={formData.discountValue}
                  onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                  placeholder={formData.type === 'percentage' ? '20' : '200'}
                  className={`w-full py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all ${
                    formData.type === 'fixed' ? 'ps-9 pe-4' : 'px-4'
                  }`}
                  required
                />
                {formData.type === 'percentage' && (
                  <span className="absolute end-3.5 top-1/2 -translate-y-1/2 text-xs font-black text-slate-500">%</span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Coupon Code (Optional)
              </label>
              <input
                type="text"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. NURAYFEAST"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Campaign Starts <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Campaign Ends <span className="text-rose-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                required
              />
            </div>
          </div>

          {/* Min Order & Max Usage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Minimum Order Requirement
              </label>
              <div className="relative">
                <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">₨</span>
                <input
                  type="number"
                  value={formData.minOrderValue}
                  onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                  placeholder="0 (no minimum)"
                  className="w-full ps-9 pe-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-1.5">
                Total Redemption Cap
              </label>
              <input
                type="number"
                value={formData.maxUsage}
                onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                placeholder="Leave blank for unlimited"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Product Selection List */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                Applicable Menu Items ({selectedProductIds.length} included)
              </label>
              {!productsLoadError && filteredModalProducts.length > 0 && (
                <div className="flex gap-2 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setSelectedProductIds(products.map((p) => p.id))}
                    className="text-orange-600 hover:text-orange-700"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedProductIds([])}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
              {!productsLoadError && products.length > 0 && (
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Filter dishes by name..."
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                />
              )}

              <div className="max-h-44 overflow-y-auto space-y-1.5 pe-1">
                {productsLoadError ? (
                  <div className="py-4 text-center">
                    <p className="text-xs font-bold text-rose-600">{productsLoadError}</p>
                    <button
                      type="button"
                      onClick={loadProductsForPromotion}
                      className="mt-2 px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-lg"
                    >
                      Retry
                    </button>
                  </div>
                ) : productsLoading ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-medium">
                    Loading your dishes...
                  </div>
                ) : filteredModalProducts.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-medium">
                    {products.length === 0
                      ? 'No products available yet. Add products to your kitchen first.'
                      : 'No dishes match filter.'}
                  </div>
                ) : (
                  filteredModalProducts.map((product) => {
                    const isChecked = selectedProductIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-orange-50/70 border-orange-300'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProduct(product.id)}
                          className="rounded text-orange-500 focus:ring-orange-500 w-4 h-4"
                        />
                        <span className="flex-1 text-xs font-bold text-slate-900 truncate">
                          {product.name}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 shrink-0">
                          {formatPrice(product.price)}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>

              {selectedProductIds.length === 0 && !productsLoadError && !productsLoading && (
                <p className="text-[11px] text-amber-600 font-bold flex items-center gap-1">
                  <span>Please select at least one menu item to apply this discount.</span>
                </p>
              )}
            </div>
          </div>

          {/* Modal Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1 rounded-xl font-bold text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={selectedProductIds.length === 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-xs shadow-md shadow-orange-500/20 disabled:opacity-50"
            >
              {isEditMode ? 'Update Campaign' : 'Launch Campaign'}
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
  const [searchFilter, setSearchFilter] = useState('');

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
      }
    } catch (error: any) {
      console.error('Failed to load promotions:', error);
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePromotion = async (data: any) => {
    const discountType = data.type === 'fixed' || data.type === 'percentage' ? data.type : 'percentage';
    const code = (data.code || data.name?.replace(/\s/g, '').toUpperCase().slice(0, 20) || 'PROMO')
      .toUpperCase()
      .replace(/\s/g, '');
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
      validUntil: data.endDate
        ? new Date(data.endDate).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
    payload.applyTo = 'selected';
    payload.productIds = Array.isArray(data.selectedProductIds) ? data.selectedProductIds : [];

    try {
      const response = await apiClient.post('/promotions', payload);
      if (response.data.success) {
        showToast('Promotion launched successfully!', 'success');
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
        : err?.message ?? error.response?.data?.message ?? 'Failed to create promotion';
      showToast(msg, 'error');
    }
  };

  const handleUpdatePromotion = async (id: string, data: any) => {
    const discountType = data.type === 'fixed' || data.type === 'percentage' ? data.type : 'percentage';
    const code = (data.code || data.name?.replace(/\s/g, '').toUpperCase().slice(0, 20) || 'PROMO')
      .toUpperCase()
      .replace(/\s/g, '');
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
      validUntil: data.endDate
        ? new Date(data.endDate).toISOString()
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
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
        : err?.message ?? error.response?.data?.message ?? 'Failed to update promotion';
      showToast(msg, 'error');
    }
  };

  const handleDeletePromotion = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promotion?')) return;
    try {
      await apiClient.delete(`/promotions/${id}`);
      showToast('Promotion deleted', 'success');
      setPromotions((prev) => prev.filter((p) => p.id !== id));
      if (detailPromo?.id === id) setDetailPromo(null);
      if (editingPromo?.id === id) {
        setEditingPromo(null);
        setShowCreateModal(false);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to delete promotion', 'error');
    }
  };

  const copyPromoCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast(`Code "${code}" copied to clipboard!`, 'success');
  };

  // Metrics
  const activeDeals = promotions.filter((p) => p.status === 'active');
  const scheduledDeals = promotions.filter((p) => p.status === 'scheduled');
  const expiredDeals = promotions.filter((p) => p.status === 'expired');
  const totalRedemptions = promotions.reduce((acc, p) => acc + p.usageCount, 0);

  const filteredPromotions = promotions.filter((p) => {
    if (activeTab !== 'all' && p.status !== activeTab) return false;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchCode = p.code?.toLowerCase().includes(q);
      if (!matchName && !matchCode) return false;
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    const styles = {
      active: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      scheduled: 'bg-sky-100 text-sky-800 border-sky-200',
      expired: 'bg-slate-100 text-slate-600 border-slate-200',
      draft: 'bg-amber-100 text-amber-800 border-amber-200',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  const getTypeIcon = (type: string): ReactNode => {
    if (type === 'percentage') return Icons.percent;
    if (type === 'fixed') return Icons.cash;
    if (type === 'buy_x_get_y') return Icons.gift;
    if (type === 'bundle') return Icons.bundle;
    return Icons.discounts;
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="Promotions"
      subtitle="Manage discount codes and special deals"
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
              { label: 'All Products', icon: Icons.products, href: '/sellers/products', isActive: false },
              { label: 'Inventory & Stock', icon: Icons.inventory, href: '/sellers/products?view=inventory', isActive: false },
              {
                label: 'Discounts & Deals',
                icon: Icons.discounts,
                href: '/sellers/promotions',
                isActive: true,
                count: promotions.length,
              },
            ].map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 whitespace-nowrap ${
                  tab.isActive
                    ? 'bg-orange-500 text-white shadow-sm'
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
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              onClick={() => {
                setEditingPromo(null);
                setShowCreateModal(true);
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-orange-500/20 flex items-center gap-2 px-4 py-2"
            >
              {Icons.plus}
              Create Deal
            </Button>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* KPI Summary Cards with Clean Icons */}
        {/* ========================================================================= */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Active Deals */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-orange-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-orange-600">
                Active Campaigns
              </span>
              <div className="w-8 h-8 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-sm">
                {Icons.fire}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {activeDeals.length}
            </div>
            <div className="mt-2 text-xs font-medium text-orange-600 flex items-center gap-1">
              <span>Currently live on storefront</span>
            </div>
          </div>

          {/* Scheduled */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-sky-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-600">
                Scheduled Deals
              </span>
              <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm">
                {Icons.calendar}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {scheduledDeals.length}
            </div>
            <div className="mt-2 text-xs font-medium text-sky-600">
              Starts automatically
            </div>
          </div>

          {/* Total Usage */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-purple-200 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-600">
                Total Redemptions
              </span>
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center font-bold text-sm">
                {Icons.chart}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {totalRedemptions}
            </div>
            <div className="mt-2 text-xs font-medium text-purple-600">
              Orders placed with vouchers
            </div>
          </div>

          {/* Expired */}
          <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm relative overflow-hidden group hover:border-slate-300 transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Completed & Expired
              </span>
              <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center font-bold text-sm">
                {Icons.clock}
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {expiredDeals.length}
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">
              Archived campaigns
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Controls & Tab Filter Bar */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <svg
              className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search promotions by campaign title or promo code..."
              className="w-full ps-10 pe-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'All Deals', count: promotions.length },
              { id: 'active', label: 'Active', count: activeDeals.length },
              { id: 'scheduled', label: 'Scheduled', count: scheduledDeals.length },
              { id: 'expired', label: 'Expired', count: expiredDeals.length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-white text-slate-700 shadow-xs'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* Promotions List */}
        {/* ========================================================================= */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-sm animate-pulse flex flex-col sm:flex-row gap-4 items-center">
                <div className="w-24 h-24 bg-slate-100 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2.5 w-full">
                  <div className="h-5 bg-slate-200 rounded w-1/3" />
                  <div className="h-4 bg-slate-100 rounded w-1/2" />
                  <div className="h-3 bg-slate-100 rounded w-1/4" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredPromotions.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-12 sm:p-16 text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-5 text-orange-500 shadow-inner">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.386a11.175 11.175 0 004.914-4.914c.486-.827.313-1.908-.386-2.607L11.159 3.659A2.25 2.25 0 009.568 3z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight mb-2">
              {activeTab === 'all' ? 'No Active Promotions' : `No ${activeTab} promotions`}
            </h2>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed max-w-md mx-auto">
              Boost your kitchen sales and reach new foodies with time-sensitive deals and voucher codes.
            </p>
            <Button
              onClick={() => {
                setEditingPromo(null);
                setShowCreateModal(true);
              }}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl shadow-lg shadow-orange-500/20 px-6 py-2.5"
            >
              Create Your First Deal
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredPromotions.map((promo) => {
              const hasLimit = promo.usageLimitTotal != null && promo.usageLimitTotal > 0;
              const usagePercent = hasLimit
                ? Math.min(100, Math.round((promo.usageCount / promo.usageLimitTotal!) * 100))
                : 0;

              return (
                <div
                  key={promo.id}
                  className="bg-white rounded-3xl shadow-sm border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all duration-200 overflow-hidden group"
                >
                  <div className="flex flex-col lg:flex-row items-stretch">
                    {/* Left Voucher Coupon Badge */}
                    <div className="lg:w-52 bg-gradient-to-br from-orange-500 to-amber-600 p-5 text-white flex flex-col justify-between relative overflow-hidden shrink-0">
                      {/* Decorative background watermark */}
                      <div className="absolute -end-3 -bottom-3 w-20 h-20 opacity-15 select-none pointer-events-none text-white">
                        {getTypeIcon(promo.type)}
                      </div>

                      <div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-orange-200">
                          {promo.type === 'percentage'
                            ? 'DISCOUNT VOUCHER'
                            : promo.type === 'fixed'
                            ? 'FLAT CASH OFF'
                            : 'SPECIAL COMBO'}
                        </span>
                        <div className="text-2xl sm:text-3xl font-black tracking-tight mt-1">
                          {promo.type === 'percentage' && `${promo.discountValue}% OFF`}
                          {promo.type === 'fixed' && `${formatPrice(promo.discountValue)} OFF`}
                          {promo.type === 'buy_x_get_y' && 'B2G1 FREE'}
                          {promo.type === 'bundle' && 'BUNDLE DEAL'}
                        </div>
                      </div>

                      {promo.code && (
                        <div className="mt-4 pt-3 border-t border-white/20">
                          <button
                            type="button"
                            onClick={() => copyPromoCode(promo.code!)}
                            className="flex items-center justify-between w-full bg-black/20 hover:bg-black/30 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold tracking-wider text-white transition-colors"
                            title="Click to copy code"
                          >
                            <span>{promo.code}</span>
                            {Icons.copy}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Middle Campaign Info */}
                    <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600 transition-colors">
                            {promo.name}
                          </h3>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-bold capitalize border ${getStatusBadge(
                              promo.status
                            )}`}
                          >
                            {promo.status}
                          </span>
                        </div>

                        {/* Validity Dates & Terms */}
                        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs font-medium text-slate-500">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            {Icons.clock}
                            <span>
                              {new Date(promo.startDate).toLocaleDateString()} —{' '}
                              {new Date(promo.endDate).toLocaleDateString()}
                            </span>
                          </span>

                          {promo.minOrderAmount != null && promo.minOrderAmount > 0 && (
                            <span className="text-slate-600">
                              Min. order: <strong className="text-slate-900">{formatPrice(promo.minOrderAmount)}</strong>
                            </span>
                          )}

                          {promo.products && promo.products.length > 0 && (
                            <span className="text-slate-600">
                              Applies to <strong className="text-slate-900">{promo.products.length} menu items</strong>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Usage Progress Bar */}
                      {hasLimit && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                            <span>Redemption Cap</span>
                            <span>
                              {promo.usageCount} / {promo.usageLimitTotal} claimed ({usagePercent}%)
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full transition-all duration-300"
                              style={{ width: `${usagePercent}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Action Center */}
                    <div className="p-5 sm:p-6 lg:border-s border-slate-100 flex lg:flex-col items-center justify-between lg:justify-center gap-3 shrink-0 bg-slate-50/50">
                      <div className="text-center">
                        <div className="text-2xl font-black text-slate-900 tracking-tight">
                          {promo.usageCount}
                        </div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                          Orders Placed
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold text-xs border-slate-200 hover:bg-slate-100"
                          onClick={() => setDetailPromo(promo)}
                        >
                          Details
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold text-xs border-slate-200 hover:bg-slate-100"
                          onClick={() => {
                            setEditingPromo(promo);
                            setShowCreateModal(true);
                          }}
                        >
                          {Icons.edit}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-xl font-bold text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                          onClick={() => handleDeletePromotion(promo.id)}
                        >
                          {Icons.trash}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ========================================================================= */}
        {/* Pro Marketing & Pricing Advisory with SVG Icons */}
        {/* ========================================================================= */}
        <div className="bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 rounded-3xl p-6 border border-orange-200/80 shadow-xs">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-2xl bg-orange-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.5h-4.5a.75.75 0 01-.75-.75v-.75a.75.75 0 01.75-.75h4.5a.75.75 0 01.75.75v.75a.75.75 0 01-.75.75zm-6-8.25a6 6 0 1112 0c0 2.26-1.25 4.228-3.09 5.25H9.09A5.986 5.986 0 016 11.25z" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base mb-1">
                Kitchen Playbook: High-Impact Promotions
              </h3>
              <p className="text-xs text-slate-600 mb-3 leading-relaxed">
                Strategic discounting protects your kitchen margins while dramatically increasing order volume and customer repeat frequency.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-semibold text-slate-700">
                <div className="bg-white/80 rounded-2xl p-3 border border-orange-100">
                  <div className="flex items-center gap-1.5 font-bold text-orange-700 mb-1">
                    {Icons.clock}
                    <span>Limited-Time Windows</span>
                  </div>
                  Create 48-hour weekend specials to induce immediate purchase action.
                </div>
                <div className="bg-white/80 rounded-2xl p-3 border border-orange-100">
                  <div className="flex items-center gap-1.5 font-bold text-orange-700 mb-1">
                    {Icons.bundle}
                    <span>Bundle Pairings</span>
                  </div>
                  Pair slow-moving sides with high-margin signature curries & frozen packs.
                </div>
                <div className="bg-white/80 rounded-2xl p-3 border border-orange-100">
                  <div className="flex items-center gap-1.5 font-bold text-orange-700 mb-1">
                    {Icons.discounts}
                    <span>Minimum Baskets</span>
                  </div>
                  Set a minimum order (e.g. ₨ 1,200) so average ticket value rises with discounts.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* Detail Modal */}
      {/* ========================================================================= */}
      {detailPromo && (
        <div
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
          onClick={() => setDetailPromo(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Campaign Blueprint</h2>
              <button
                type="button"
                onClick={() => setDetailPromo(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs sm:text-sm">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Campaign Name</p>
                <p className="font-bold text-slate-900 text-base">{detailPromo.name}</p>
              </div>
              {detailPromo.code && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Promo Code</p>
                  <span className="inline-block mt-1 font-mono font-black text-sm bg-slate-100 px-3 py-1 rounded-xl text-slate-900 border border-slate-200">
                    {detailPromo.code}
                  </span>
                </div>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Discount Offered</p>
                <p className="font-black text-orange-600 text-base">
                  {detailPromo.type === 'percentage' && `${detailPromo.discountValue}% OFF`}
                  {detailPromo.type === 'fixed' && `${formatPrice(detailPromo.discountValue)} OFF`}
                  {detailPromo.type === 'buy_x_get_y' && 'Buy X Get Y'}
                  {detailPromo.type === 'bundle' && 'Bundle deal'}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Duration</p>
                <p className="font-medium text-slate-700">
                  {new Date(detailPromo.startDate).toLocaleString()} —{' '}
                  {new Date(detailPromo.endDate).toLocaleString()}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Usage</p>
                  <p className="font-bold text-slate-900">{detailPromo.usageCount} orders</p>
                </div>
                {detailPromo.minOrderAmount != null && detailPromo.minOrderAmount > 0 && (
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Min. Basket</p>
                    <p className="font-bold text-slate-900">{formatPrice(detailPromo.minOrderAmount)}</p>
                  </div>
                )}
              </div>
              <div className="pt-4 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl font-bold text-xs"
                  onClick={() => setDetailPromo(null)}
                >
                  Close
                </Button>
                <Button
                  type="button"
                  className="flex-1 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-bold text-xs"
                  onClick={() => {
                    setEditingPromo(detailPromo);
                    setDetailPromo(null);
                    setShowCreateModal(true);
                  }}
                >
                  Edit Campaign
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Promotion Modal */}
      <CreatePromotionModal
        isOpen={showCreateModal}
        onClose={() => {
          setShowCreateModal(false);
          setEditingPromo(null);
        }}
        onSubmit={handleCreatePromotion}
        onUpdate={handleUpdatePromotion}
        onError={(msg) => showToast(msg, 'error')}
        initialData={editingPromo}
        promotionId={editingPromo?.id ?? null}
      />
    </DashboardLayout>
  );
}
