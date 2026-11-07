'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import { Copy, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorDetails } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';
import { StatusPill } from '@/components/ui/StatusPill';
import { dateClock } from '@/components/sellers/order-timing';
import { useLocale, useT } from '@/lib/i18n';
import { kitchenPromotionMessages } from '@/lib/i18n/messages/kitchen-promotions';

type PromoT = ReturnType<typeof useT<typeof kitchenPromotionMessages.en>>;

const sidebarItems = SELLER_SIDEBAR_ITEMS;

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
  onSubmit: (data: PromotionPayload) => void;
  onUpdate?: (id: string, data: PromotionPayload) => void;
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

interface PromotionFormValues {
  name: string;
  type: string;
  discountValue: string;
  startDate: string;
  endDate: string;
  code: string;
  minOrderValue: string;
  maxUsage: string;
}

/** What the form sends: its values and the dishes the deal applies to. */
type PromotionPayload = PromotionFormValues & { applyTo: 'selected'; selectedProductIds: string[] };

type Tab = 'all' | 'active' | 'scheduled' | 'expired';

const TYPE_OPTIONS = ['percentage', 'fixed', 'buy_x_get_y', 'bundle'] as const;

const FIELD =
  'w-full min-h-11 px-3.5 rounded-xl bg-surface border border-line-strong text-[15px] text-ink placeholder:text-muted focus:outline-none focus:border-brand-600 focus:ring-3 focus:ring-brand/30';
const LABEL = 'block text-sm font-medium text-ink mb-1.5';

function offLabel(p: Pick<Promotion, 'type' | 'discountValue'>, t: PromoT): string {
  if (p.type === 'percentage') return t('percentOff', { value: p.discountValue });
  if (p.type === 'fixed') return t('amountOff', { amount: formatPrice(p.discountValue) });
  if (p.type === 'buy_x_get_y') return t('type.buy_x_get_y');
  return t('comboDeal');
}

function whenLabel(p: Promotion, t: PromoT, locale: string): string {
  if (p.status === 'active') return t('ends', { when: dateClock(p.endDate, locale) });
  if (p.status === 'scheduled') return t('starts', { when: dateClock(p.startDate, locale) });
  if (p.status === 'expired') return t('ended', { when: dateClock(p.endDate, locale) });
  return t('notLive');
}

/**
 * A time as a date-and-time box shows it: the phone's local time, YYYY-MM-DDTHH:MM. toISOString() alone gives UTC, which the box
 * then reads back as local time, moving the deal five hours earlier in Pakistan on every save.
 */
function toLocalInput(at: Date | string): string {
  const d = new Date(at);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** The form's starting values: the promotion being edited, or a week-long 15% deal starting now. */
function promotionFormFor(initialData?: Promotion | null): PromotionFormValues {
  if (initialData) {
    return {
      name: initialData.name,
      type: initialData.type === 'fixed' ? 'fixed' : 'percentage',
      discountValue: String(initialData.discountValue),
      startDate: toLocalInput(initialData.startDate),
      endDate: toLocalInput(initialData.endDate),
      code: initialData.code || '',
      minOrderValue: initialData.minOrderAmount != null ? String(initialData.minOrderAmount) : '',
      maxUsage: initialData.usageLimitTotal != null ? String(initialData.usageLimitTotal) : '',
    };
  }
  return {
    name: '',
    type: 'percentage',
    discountValue: '15',
    startDate: toLocalInput(new Date()),
    endDate: toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    code: '',
    minOrderValue: '',
    maxUsage: '',
  };
}

/** Mounted only while open, so every opening starts from the promotion being edited (or a new deal) and loads the products once. */
function CreatePromotionModal(props: CreatePromotionModalProps) {
  return props.isOpen ? <PromotionForm key={props.promotionId ?? 'new'} {...props} /> : null;
}

function PromotionForm({
  onClose,
  onSubmit,
  onUpdate,
  onError,
  initialData,
  promotionId,
}: CreatePromotionModalProps) {
  const t = useT(kitchenPromotionMessages);
  const isEditMode = Boolean(promotionId && initialData);
  const [formData, setFormData] = useState(() => promotionFormFor(initialData));
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>(
    () => initialData?.products ?? initialData?.applicableProductIds ?? []
  );
  const [products, setProducts] = useState<SellerProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsLoadError, setProductsLoadError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');

  // The latest error callback, without making the product request depend on it (it is a new function on every render of the page).
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const fetchProducts = useCallback(() => {
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
            ? t('offline')
            : err.response?.data?.error?.message ?? err.response?.data?.message ?? err.message ?? t('dishesLoadFailed')
        );
        if (!isNetwork) onErrorRef.current?.(err.response?.data?.error?.message ?? err.message ?? t('dishesLoadFailed'));
      })
      .finally(() => setProductsLoading(false));
  }, [t]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const loadProductsForPromotion = () => {
    setProductsLoadError(null);
    setProductsLoading(true);
    fetchProducts();
  };

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

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="promo-form-title"
        className="bg-surface w-full sm:max-w-xl max-h-[92vh] flex flex-col rounded-t-[20px] sm:rounded-[20px] border border-line shadow-[var(--shadow-card)]"
      >
        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 pt-5 pb-4 border-b border-line">
          <h2 id="promo-form-title" className="text-lg font-semibold text-ink">
            {isEditMode ? t('editTitle') : t('newTitle')}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label={t('close')}
            className="-me-2 w-11 h-11 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
            <div>
              <label htmlFor="promo-name" className={LABEL}>
                {t('name')}
              </label>
              <input
                id="promo-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('namePlaceholder')}
                className={FIELD}
                required
              />
            </div>

            <fieldset>
              <legend className={LABEL}>{t('kind')}</legend>
              <div className="grid grid-cols-2 gap-2">
                {TYPE_OPTIONS.map((type) => (
                  <label
                    key={type}
                    className="min-h-11 rounded-xl border border-line-strong px-3.5 py-2.5 cursor-pointer hover:bg-raised has-[:checked]:border-brand-600 has-[:checked]:bg-brand-soft has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-brand/40"
                  >
                    <input
                      type="radio"
                      name="promo-type"
                      value={type}
                      checked={formData.type === type}
                      onChange={() => setFormData({ ...formData, type })}
                      className="sr-only"
                    />
                    <span className="block text-sm font-medium text-ink">{t(`type.${type}`)}</span>
                    <span className="block text-xs text-muted">{t(`type.${type}.hint`)}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="promo-value" className={LABEL}>
                  {formData.type === 'fixed' ? t('type.fixed') : formData.type === 'percentage' ? t('type.percentage') : t('howMuchOff')}
                </label>
                <div className="relative">
                  {formData.type === 'fixed' && (
                    <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">Rs</span>
                  )}
                  <input
                    id="promo-value"
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.type === 'percentage' ? '20' : '200'}
                    className={`${FIELD} tabular-nums ${formData.type === 'fixed' ? 'ps-10' : ''} ${formData.type === 'percentage' ? 'pe-9' : ''}`}
                    required
                  />
                  {formData.type === 'percentage' && (
                    <span className="absolute end-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">%</span>
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="promo-code" className={LABEL}>
                  {t('code')} <span className="font-normal text-muted">{t('optional')}</span>
                </label>
                <input
                  id="promo-code"
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder={t('codePlaceholder')}
                  aria-describedby="promo-code-hint"
                  className={`${FIELD} font-mono uppercase placeholder:normal-case placeholder:font-sans`}
                />
                <p id="promo-code-hint" className="mt-1 text-xs text-muted">{t('codeHint')}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="promo-start" className={LABEL}>
                  {t('startsLabel')}
                </label>
                <input
                  id="promo-start"
                  type="datetime-local"
                  value={formData.startDate}
                  onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                  className={FIELD}
                  required
                />
              </div>
              <div>
                <label htmlFor="promo-end" className={LABEL}>
                  {t('endsLabel')}
                </label>
                <input
                  id="promo-end"
                  type="datetime-local"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className={FIELD}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="promo-min" className={LABEL}>
                  {t('smallestOrder')} <span className="font-normal text-muted">{t('optional')}</span>
                </label>
                <div className="relative">
                  <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-sm text-muted" aria-hidden="true">Rs</span>
                  <input
                    id="promo-min"
                    type="number"
                    value={formData.minOrderValue}
                    onChange={(e) => setFormData({ ...formData, minOrderValue: e.target.value })}
                    placeholder={t('anyAmount')}
                    className={`${FIELD} ps-10 tabular-nums`}
                  />
                </div>
              </div>
              <div>
                <label htmlFor="promo-max" className={LABEL}>
                  {t('timesUsable')} <span className="font-normal text-muted">{t('optional')}</span>
                </label>
                <input
                  id="promo-max"
                  type="number"
                  value={formData.maxUsage}
                  onChange={(e) => setFormData({ ...formData, maxUsage: e.target.value })}
                  placeholder={t('noLimit')}
                  className={`${FIELD} tabular-nums`}
                />
              </div>
            </div>

            <fieldset>
              <div className="flex items-center justify-between gap-3 mb-1.5">
                <legend className="text-sm font-medium text-ink">
                  {t('dishes')} <span className="font-normal text-muted tabular-nums">{t('picked', { count: selectedProductIds.length })}</span>
                </legend>
                {!productsLoadError && filteredModalProducts.length > 0 && (
                  <div className="flex -me-2">
                    <button
                      type="button"
                      onClick={() => setSelectedProductIds(products.map((p) => p.id))}
                      className="min-h-11 px-2 text-sm font-medium text-brand-ink hover:underline"
                    >
                      {t('pickAll')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedProductIds([])}
                      className="min-h-11 px-2 text-sm font-medium text-muted hover:text-ink"
                    >
                      {t('clear')}
                    </button>
                  </div>
                )}
              </div>

              {!productsLoadError && products.length > 0 && (
                <div className="relative mb-2">
                  <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder={t('findDish')}
                    aria-label={t('findDish')}
                    className={`${FIELD} ps-10`}
                  />
                </div>
              )}

              <div className="max-h-56 overflow-y-auto rounded-xl border border-line divide-y divide-line">
                {productsLoadError ? (
                  <div className="px-4 py-5 text-center">
                    <p className="text-sm text-red-700">{productsLoadError}</p>
                    <Button type="button" variant="outline" onClick={loadProductsForPromotion} className="mt-3">
                      {t('tryAgain')}
                    </Button>
                  </div>
                ) : productsLoading ? (
                  <p className="px-4 py-5 text-center text-sm text-muted">{t('loadingDishes')}</p>
                ) : filteredModalProducts.length === 0 ? (
                  <p className="px-4 py-5 text-center text-sm text-muted">
                    {products.length === 0
                      ? t('noDishesYet')
                      : t('noDishMatch')}
                  </p>
                ) : (
                  filteredModalProducts.map((product) => {
                    const isChecked = selectedProductIds.includes(product.id);
                    return (
                      <label
                        key={product.id}
                        className={`flex items-center gap-3 min-h-11 px-3.5 py-2 cursor-pointer ${isChecked ? 'bg-brand-soft' : 'hover:bg-raised'}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleProduct(product.id)}
                          className="w-4 h-4 accent-brand-600"
                        />
                        <bdi className="flex-1 min-w-0 text-[15px] text-ink truncate">{product.name}</bdi>
                        <span className="text-sm text-muted tabular-nums shrink-0">{formatPrice(product.price)}</span>
                      </label>
                    );
                  })
                )}
              </div>

              {selectedProductIds.length === 0 && !productsLoadError && !productsLoading && (
                <p className="mt-2 text-sm text-muted">{t('pickOne')}</p>
              )}
            </fieldset>
          </div>

          <div className="flex gap-3 px-5 sm:px-6 py-4 border-t border-line">
            <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={selectedProductIds.length === 0} className="flex-1">
              {isEditMode ? t('saveChanges') : t('create')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface DealRowProps {
  promo: Promotion;
  quiet?: boolean;
  onCopy: (code: string) => void;
  onDetails: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function DealRow({ promo, quiet, onCopy, onDetails, onEdit, onDelete }: DealRowProps) {
  const t = useT(kitchenPromotionMessages);
  const { locale } = useLocale();
  const hasLimit = promo.usageLimitTotal != null && promo.usageLimitTotal > 0;
  const usagePercent = hasLimit ? Math.min(100, Math.round((promo.usageCount / promo.usageLimitTotal!) * 100)) : 0;
  const dishCount = promo.products?.length ?? 0;
  const facts = [
    whenLabel(promo, t, locale),
    promo.minOrderAmount != null && promo.minOrderAmount > 0 ? t('ordersOver', { amount: formatPrice(promo.minOrderAmount) }) : null,
    dishCount > 0 ? (dishCount === 1 ? t('dishCountOne') : t('dishCount', { count: dishCount })) : null,
  ].filter(Boolean);

  return (
    <li className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-6 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <p className={`text-lg font-semibold tabular-nums ${quiet ? 'text-muted' : 'text-ink'}`}>{offLabel(promo, t)}</p>
          <p className={`text-[15px] min-w-0 break-words ${quiet ? 'text-muted' : 'text-ink'}`}><bdi>{promo.name}</bdi></p>
          {promo.status === 'draft' && <StatusPill>{t('notLive')}</StatusPill>}
        </div>
        <p className="mt-1 text-sm text-muted">{facts.join(', ')}</p>
        {hasLimit && !quiet ? (
          <div className="mt-2.5 flex items-center gap-3 max-w-sm">
            <div className="h-1.5 flex-1 rounded-full bg-raised overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${usagePercent}%` }} />
            </div>
            <span className="text-sm text-muted tabular-nums whitespace-nowrap">
              {t('usedOf', { used: promo.usageCount, total: promo.usageLimitTotal ?? 0 })}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted tabular-nums">
            {hasLimit
              ? t('usedOf', { used: promo.usageCount, total: promo.usageLimitTotal ?? 0 })
              : promo.usageCount === 1
                ? t('usedOnce')
                : t('usedTimes', { count: promo.usageCount })}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 shrink-0">
        {promo.code && (
          <button
            type="button"
            onClick={() => onCopy(promo.code!)}
            aria-label={t('copyCode', { code: promo.code })}
            className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl bg-raised text-ink font-mono text-sm hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            {promo.code}
            <Copy className="w-4 h-4 text-muted" aria-hidden="true" />
          </button>
        )}
        <div className="flex items-center gap-1">
          <Button type="button" variant="ghost" onClick={onDetails} className="px-3">
            {t('details')}
          </Button>
          <Button type="button" variant={quiet ? 'ghost' : 'outline'} onClick={onEdit} className={quiet ? 'px-3 text-muted hover:text-ink hover:bg-raised' : 'px-4'}>
            <Pencil className="w-4 h-4" aria-hidden="true" />
            {t('edit')}
          </Button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('deleteNamed', { name: promo.name })}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-muted hover:text-red-700 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <Trash2 className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}

export default function SellerPromotionsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const t = useT(kitchenPromotionMessages);
  const { locale } = useLocale();

  const [loading, setLoading] = useState(true);
  // Why the promotions could not be read; shown instead of "no discounts yet", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailPromo, setDetailPromo] = useState<Promotion | null>(null);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [searchFilter, setSearchFilter] = useState('');

  const loadPromotions = async () => {
    try {
      setLoading(true);
      setLoadError(null);
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
    } catch (error: unknown) {
      console.error('Failed to load promotions:', error);
      // The promotions already on the screen stay (a refresh after an action must not wipe the list).
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
      showToast(t('accessDenied'), 'error');
      return;
    }

    loadPromotions();
  }, [isAuthenticated, user, router]);

  const handleCreatePromotion = async (data: PromotionPayload) => {
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
        showToast(t('created'), 'success');
        setShowCreateModal(false);
        loadPromotions();
      } else {
        showToast(t('createFailed'), 'error');
      }
    } catch (error) {
      const details = apiErrorDetails(error) as Array<{ field?: string; message?: string }> | undefined;
      const msg = details?.length
        ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('. ')
        : apiErrorMessage(error, t('createFailed'));
      showToast(msg, 'error');
    }
  };

  const handleUpdatePromotion = async (id: string, data: PromotionPayload) => {
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
        showToast(t('savedToast'), 'success');
        setShowCreateModal(false);
        setEditingPromo(null);
        loadPromotions();
      } else {
        showToast(t('saveFailed'), 'error');
      }
    } catch (error) {
      const details = apiErrorDetails(error) as Array<{ field?: string; message?: string }> | undefined;
      const msg = details?.length
        ? details.map((d) => (d.field ? `${d.field}: ${d.message}` : d.message)).join('. ')
        : apiErrorMessage(error, t('saveFailed'));
      showToast(msg, 'error');
    }
  };

  const handleDeletePromotion = async (id: string) => {
    if (!(await confirmDialog({ title: t('deleteTitle'), message: t('deleteBody'), confirmText: t('delete') }))) return;
    try {
      await apiClient.delete(`/promotions/${id}`);
      showToast(t('deleted'), 'success');
      setPromotions((prev) => prev.filter((p) => p.id !== id));
      if (detailPromo?.id === id) setDetailPromo(null);
      if (editingPromo?.id === id) {
        setEditingPromo(null);
        setShowCreateModal(false);
      }
    } catch (error) {
      showToast(apiErrorMessage(error, t('deleteFailed')), 'error');
    }
  };

  const copyPromoCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast(t('copied', { code }), 'success');
  };

  const openNew = () => {
    setEditingPromo(null);
    setShowCreateModal(true);
  };

  const openEdit = (promo: Promotion) => {
    setEditingPromo(promo);
    setShowCreateModal(true);
  };

  const activeDeals = promotions.filter((p) => p.status === 'active');
  const scheduledDeals = promotions.filter((p) => p.status === 'scheduled');
  const expiredDeals = promotions.filter((p) => p.status === 'expired');

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

  if (!isAuthenticated) {
    return null;
  }

  // The promotions could not be read (and none from an earlier read are on the screen).
  const couldNotRead = !loading && Boolean(loadError) && promotions.length === 0;
  const hasAny = promotions.length > 0;

  const rowFor = (promo: Promotion, quiet?: boolean) => (
    <DealRow
      key={promo.id}
      promo={promo}
      quiet={quiet}
      onCopy={copyPromoCode}
      onDetails={() => setDetailPromo(promo)}
      onEdit={() => openEdit(promo)}
      onDelete={() => handleDeletePromotion(promo.id)}
    />
  );

  const running = filteredPromotions.filter((p) => p.status === 'active');
  const runningRedemptions = running.reduce((a, p) => a + p.usageCount, 0);
  const later = filteredPromotions.filter((p) => p.status === 'scheduled' || p.status === 'draft');
  const ended = filteredPromotions.filter((p) => p.status === 'expired');
  const searching = searchFilter.trim().length > 0;

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: 'all', label: t('tab.all'), count: promotions.length },
    { id: 'active', label: t('tab.active'), count: activeDeals.length },
    { id: 'scheduled', label: t('tab.scheduled'), count: scheduledDeals.length },
    { id: 'expired', label: t('tab.expired'), count: expiredDeals.length },
  ];

  const runningCard =
    running.length > 0 ? (
      <ul className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] px-5 divide-y divide-line">
        {running.map((p) => rowFor(p))}
      </ul>
    ) : (
      <p className="rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] px-5 py-6 text-[15px] text-muted">
        {searching ? t('noRunningMatch') : t('nothingRunning')}
      </p>
    );

  const flatList = (list: Promotion[], quiet?: boolean) => (
    <ul className="divide-y divide-line">{list.map((p) => rowFor(p, quiet))}</ul>
  );

  return (
    <DashboardLayout
      title={t('title')}
      subtitle={t('subtitle')}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-5xl">
        {!couldNotRead && !loading && hasAny ? (
          <div className="flex flex-col-reverse md:flex-row md:items-end md:justify-between gap-3 border-b border-line mb-6">
            <div role="tablist" aria-label={t('showDiscounts')} className="flex gap-5 overflow-x-auto [scrollbar-width:none]">
              {tabs.map((tab) => {
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative -mb-px flex items-center gap-2 min-h-11 pb-1 text-[15px] whitespace-nowrap border-b-2 transition-colors ${
                      selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className="min-w-6 px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums bg-raised text-muted">
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 md:pb-2">
              <div className="relative flex-1 md:w-64 md:flex-none">
                <Search className="w-4 h-4 text-muted absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchLabel')}
                  className={`${FIELD} ps-10`}
                />
              </div>
              <Button onClick={openNew} className="shrink-0">
                <Plus className="w-4 h-4" aria-hidden="true" />
                {t('newTitle')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mb-6">
            <Button onClick={openNew}>
              <Plus className="w-4 h-4" aria-hidden="true" />
              {t('newTitle')}
            </Button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-3 py-10 text-[15px] text-muted">
            <span className="animate-spin rounded-full h-5 w-5 border-2 border-line border-t-brand-600" aria-hidden="true" />
            {t('loading')}
          </div>
        ) : loadError && promotions.length === 0 ? (
          <LoadError error={loadError} onRetry={loadPromotions} title={t('loadFailed')} className="max-w-2xl" />
        ) : !hasAny ? (
          <p className="py-6 text-[15px] text-muted max-w-xl">
            {t('empty')}
          </p>
        ) : activeTab === 'all' ? (
          <div className="space-y-6">
            <section aria-labelledby="running-heading">
              <h2 id="running-heading" className="text-sm font-semibold text-ink mb-3">
                {t('runningNow')}
                {running.length > 0 && (
                  <span className="font-normal text-muted tabular-nums">
                    {runningRedemptions === 1 ? t('usedOnOrdersOne') : t('usedOnOrders', { count: runningRedemptions })}
                  </span>
                )}
              </h2>
              {runningCard}
            </section>
            {later.length > 0 && (
              <section aria-labelledby="later-heading" className="pt-6 border-t border-line">
                <h2 id="later-heading" className="text-sm font-semibold text-ink">{t('startingLater')}</h2>
                {flatList(later)}
              </section>
            )}
            {ended.length > 0 && (
              <section aria-labelledby="ended-heading" className="pt-6 border-t border-line">
                <h2 id="ended-heading" className="text-sm font-semibold text-muted">{t('endedHeading')}</h2>
                {flatList(ended, true)}
              </section>
            )}
            {searching && filteredPromotions.length === 0 && (
              <p className="text-[15px] text-muted">{t('noMatch')}</p>
            )}
          </div>
        ) : activeTab === 'active' ? (
          runningCard
        ) : filteredPromotions.length === 0 ? (
          <p className="py-6 text-[15px] text-muted">
            {searching
              ? t('noMatch')
              : activeTab === 'scheduled'
              ? t('noneWaiting')
              : t('noneEnded')}
          </p>
        ) : (
          flatList(filteredPromotions, activeTab === 'expired')
        )}

        {!couldNotRead && !loading && (
          <section aria-labelledby="tips-heading" className="mt-10 pt-6 border-t border-line">
            <h2 id="tips-heading" className="text-sm font-semibold text-ink mb-2">{t('whatWorks')}</h2>
            <ul className="space-y-1.5 text-sm text-muted list-disc ps-5 max-w-2xl">
              <li>{t('tip1')}</li>
              <li>{t('tip2')}</li>
              <li>{t('tip3')}</li>
            </ul>
          </section>
        )}
      </div>

      {detailPromo && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
          onClick={() => setDetailPromo(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="promo-detail-title"
            className="bg-surface w-full sm:max-w-md rounded-t-[20px] sm:rounded-[20px] border border-line shadow-[var(--shadow-card)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 sm:px-6 pt-5">
              <div className="min-w-0">
                <h2 id="promo-detail-title" className="text-lg font-semibold text-ink break-words">{detailPromo.name}</h2>
                <p className="text-sm text-muted">{whenLabel(detailPromo, t, locale)}</p>
              </div>
              <button
                type="button"
                onClick={() => setDetailPromo(null)}
                aria-label={t('close')}
                className="-me-2 -mt-2 w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-muted hover:text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>
            <dl className="px-5 sm:px-6 mt-4 divide-y divide-line border-y border-line">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-muted">{t('discount')}</dt>
                <dd className="text-[15px] font-semibold text-ink tabular-nums text-end">{offLabel(detailPromo, t)}</dd>
              </div>
              {detailPromo.code && (
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-sm text-muted">{t('code')}</dt>
                  <dd className="text-[15px] font-mono text-ink">{detailPromo.code}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-muted">{t('startsLabel')}</dt>
                <dd className="text-[15px] text-ink text-end">{dateClock(detailPromo.startDate, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-muted">{t('endsLabel')}</dt>
                <dd className="text-[15px] text-ink text-end">{dateClock(detailPromo.endDate, locale)}</dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-sm text-muted">{t('usedOn')}</dt>
                <dd className="text-[15px] text-ink tabular-nums">
                  {detailPromo.usageCount === 1 ? t('ordersOne') : t('orders', { count: detailPromo.usageCount })}
                </dd>
              </div>
              {detailPromo.minOrderAmount != null && detailPromo.minOrderAmount > 0 && (
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-sm text-muted">{t('smallestOrder')}</dt>
                  <dd className="text-[15px] text-ink tabular-nums">{formatPrice(detailPromo.minOrderAmount)}</dd>
                </div>
              )}
            </dl>
            <div className="flex gap-3 px-5 sm:px-6 py-4">
              <Button type="button" variant="outline" className="flex-1" onClick={() => setDetailPromo(null)}>
                {t('close')}
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  setEditingPromo(detailPromo);
                  setDetailPromo(null);
                  setShowCreateModal(true);
                }}
              >
                {t('editTitle')}
              </Button>
            </div>
          </div>
        </div>
      )}

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
