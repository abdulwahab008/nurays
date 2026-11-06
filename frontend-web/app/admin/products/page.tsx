'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import { AdminFilterTabs } from '@/components/admin/AdminFilterTabs';
import { LoadingLine, Pager, SearchForm, StatusPill, type PillTone } from '@/components/admin/AdminListParts';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatDateTime, formatPrice, imageVariant } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface Product {
  id: string;
  name: string;
  price: number;
  isActive: boolean;
  moderationStatus: string;
  rejectionReason?: string | null;
  description?: string | null;
  category?: string | null;
  unit?: string | null;
  weightGrams?: number | null;
  preparationTime?: number | null;
  ingredients?: string | null;
  allergens?: string | null;
  dietaryInfo?: string[];
  createdAt?: string;
  updatedAt?: string;
  seller: { id?: string; businessName: string };
  images?: Array<{ imageUrl: string; isPrimary: boolean }>;
  variants?: Array<{ id: string; name: string; price: number; weightGrams: number | null }>;
}

type Filter = 'pending' | 'approved' | 'rejected' | 'all';
const FILTERS: Filter[] = ['pending', 'approved', 'rejected', 'all'];
const FILTER_LABEL: Record<Filter, string> = { pending: 'Waiting', approved: 'Approved', rejected: 'Rejected', all: 'All' };
const PAGE_SIZE = 24;

/** One pill for a dish: waiting for a decision, live on the menu, hidden by its kitchen, or turned down. */
function dishStatus(p: Pick<Product, 'moderationStatus' | 'isActive'>): { tone: PillTone; label: string } {
  if (p.moderationStatus === 'pending') return { tone: 'waiting', label: 'Waiting' };
  if (p.moderationStatus === 'rejected') return { tone: 'problem', label: 'Rejected' };
  return p.isActive ? { tone: 'good', label: 'Live' } : { tone: 'neutral', label: 'Hidden' };
}

export default function AdminProductsPage() {
  return (
    <Suspense fallback={null}>
      <AdminProducts />
    </Suspense>
  );
}

function AdminProducts() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  // The job of this page is moderation, so it opens on the dishes waiting for a decision.
  const statusParam = searchParams.get('status') as Filter | null;
  const filter: Filter = statusParam && FILTERS.includes(statusParam) ? statusParam : 'pending';
  const sellerId = searchParams.get('seller');
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Filter, number>> | null>(null);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const [query, setQuery] = useState('');
  // Why the list could not be read; shown instead of "No dishes", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [open, setOpen] = useState<Product | null>(null);
  // The dish being turned down (its reason is asked for), and the one a request is in flight for.
  const [rejecting, setRejecting] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/products', {
        params: {
          moderationStatus: filter === 'all' ? undefined : filter,
          search: query || undefined,
          sellerId: sellerId || undefined,
          page,
          limit: PAGE_SIZE,
        },
      });
      const data = response.data.data;
      setProducts(data.products || []);
      setCounts(data.counts ?? null);
      setPagination({ total: data.pagination?.total ?? 0, totalPages: data.pagination?.totalPages || 1 });
      setLoadError(null);
    } catch (error) {
      setProducts([]);
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  }, [filter, query, sellerId, page]);

  useEffect(() => {
    if (isAuthenticated && isAdmin) void loadProducts();
  }, [isAuthenticated, isAdmin, loadProducts]);

  const setView = (changes: { status?: Filter; page: number }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (changes.status) params.set('status', changes.status);
    if (changes.page > 1) params.set('page', String(changes.page));
    else params.delete('page');
    router.replace(`/admin/products?${params.toString()}`, { scroll: false });
  };
  const changeFilter = (next: Filter) => setView({ status: next, page: 1 });

  const handleModerate = async (product: Product, action: 'approve' | 'reject', reason?: string) => {
    try {
      setBusyId(product.id);
      await apiClient.post(`/admin/products/${product.id}/moderate`, {
        approved: action === 'approve',
        reason: action === 'reject' ? reason : undefined,
      });
      showToast(action === 'approve' ? `${product.name} is approved` : `${product.name} was rejected`, 'success');
      setRejecting(null);
      setOpen(null);
      void loadProducts();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  const kitchenName = sellerId ? products[0]?.seller.businessName : null;

  return (
    <DashboardLayout title="Dishes" subtitle="A new or changed dish reaches customers only once it is approved here." sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-6xl">
        {sellerId && (
          <p className="mb-4 flex flex-wrap items-center gap-2 text-sm text-muted">
            Dishes from {kitchenName ?? 'one kitchen'}
            <button
              type="button"
              onClick={() => router.replace(`/admin/products?status=${filter}`)}
              className="min-h-11 font-semibold text-brand-ink hover:underline"
            >
              Show every kitchen
            </button>
          </p>
        )}
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <AdminFilterTabs
            label="Dish status"
            value={filter}
            onChange={changeFilter}
            tabs={FILTERS.map((f) => ({ id: f, label: FILTER_LABEL[f], count: counts?.[f] ?? null, waiting: f === 'pending' }))}
            className="md:flex-1"
          />
          <SearchForm
            placeholder="Dish or kitchen"
            label="Search dishes"
            onSearch={(q) => {
              setQuery(q);
              setView({ page: 1 });
            }}
          />
        </div>

        {loading && products.length === 0 ? (
          <LoadingLine text="Loading dishes" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={() => void loadProducts()} title="We couldn't load the dishes" />
        ) : products.length === 0 ? (
          <p className="py-6 text-sm text-muted" data-testid="dishes-empty">
            {query
              ? 'No dish or kitchen matches that search.'
              : filter === 'pending'
                ? 'No dish is waiting. When a kitchen adds or changes a dish, it shows up here.'
                : `No ${FILTER_LABEL[filter].toLowerCase()} dishes.`}
          </p>
        ) : (
          <>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="dish-list">
              {products.map((product) => {
                const status = dishStatus(product);
                const photo = product.images?.[0]?.imageUrl;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(product)}
                      className="flex w-full items-stretch gap-3 rounded-2xl border border-line bg-surface p-3 text-start hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 sm:flex-col"
                    >
                      <span className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-raised sm:h-40 sm:w-full">
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={imageVariant(photo, 'md') ?? photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full items-center justify-center text-xs text-muted">No photo</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-2">
                          <span className="text-[15px] font-semibold leading-snug text-ink">{product.name}</span>
                          <StatusPill tone={status.tone}>{status.label}</StatusPill>
                        </span>
                        <span className="mt-0.5 block truncate text-sm text-muted">{product.seller.businessName}</span>
                        <span className="mt-1 block text-sm font-semibold text-ink tabular-nums">{formatPrice(product.price)}</span>
                        {product.moderationStatus === 'pending' && (
                          <span className="mt-1 block text-xs font-semibold text-brand-ink">Review</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pager page={page} totalPages={pagination.totalPages} total={pagination.total} noun="dishes" onChange={(next) => setView({ page: next })} />
          </>
        )}
      </div>

      {open && (
        <DishSheet
          product={open}
          busy={busyId === open.id}
          onClose={() => setOpen(null)}
          onApprove={() => handleModerate(open, 'approve')}
          onReject={() => setRejecting(open)}
        />
      )}

      <RejectReasonModal
        isOpen={!!rejecting}
        title={`Reject ${rejecting?.name ?? 'this dish'}?`}
        description={`${rejecting?.seller.businessName ?? 'The kitchen'} is told the reason. It can change the dish and send it again.`}
        suggestions={['The photo does not show the dish', 'The description does not match the dish', 'The price or portion looks wrong', 'The dish is not allowed on Nuray']}
        confirmLabel="Reject dish"
        audience="kitchen"
        helpText="It can change the dish and send it again."
        busy={!!rejecting && busyId === rejecting.id}
        onConfirm={(reason) => rejecting && handleModerate(rejecting, 'reject', reason)}
        onCancel={() => setRejecting(null)}
      />
    </DashboardLayout>
  );
}

/** Everything a moderator needs to decide on one dish, with the decision at the bottom. Full screen on a phone. */
function DishSheet({
  product,
  busy,
  onClose,
  onApprove,
  onReject,
}: {
  product: Product;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const status = dishStatus(product);
  const facts: Array<[string, string | null | undefined]> = [
    ['Kitchen', product.seller.businessName],
    ['Category', product.category],
    ['Portion', [product.unit, product.weightGrams ? `${product.weightGrams} g` : null].filter(Boolean).join(', ') || null],
    ['Preparation', product.preparationTime ? `${product.preparationTime} min` : null],
    ['Dietary', product.dietaryInfo?.length ? product.dietaryInfo.join(', ') : null],
    ['Ingredients', product.ingredients],
    ['Allergens', product.allergens],
    ['Added', product.createdAt ? formatDateTime(product.createdAt) : null],
    ['Last changed', product.updatedAt ? formatDateTime(product.updatedAt) : null],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="dish-sheet-title">
      <div className="absolute inset-0 bg-[rgba(6,20,18,0.55)]" onClick={onClose} aria-hidden="true" />
      <div className="relative flex h-full w-full flex-col bg-surface shadow-xl md:max-w-lg" data-testid="dish-sheet">
        <div className="flex items-start gap-3 border-b border-line px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
          <div className="min-w-0 flex-1">
            <h2 id="dish-sheet-title" className="text-lg font-semibold text-ink">
              {product.name}
            </h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted">
              <span className="font-semibold text-ink tabular-nums">{formatPrice(product.price)}</span>
              <StatusPill tone={status.tone}>{status.label}</StatusPill>
            </p>
          </div>
          <Button variant="ghost" className="h-11 w-11 shrink-0 px-0 text-ink" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {product.images && product.images.length > 0 ? (
            <div className="flex snap-x gap-2 overflow-x-auto">
              {product.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={img.imageUrl}
                  src={imageVariant(img.imageUrl, 'lg') ?? img.imageUrl}
                  alt={product.name}
                  className="h-56 w-full max-w-[85%] shrink-0 snap-start rounded-xl object-cover first:max-w-full only:max-w-full"
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-raised px-3 py-6 text-center text-sm text-muted">This dish has no photo.</p>
          )}

          {product.rejectionReason && product.moderationStatus === 'rejected' && (
            <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: {product.rejectionReason}</p>
          )}

          <section>
            <h3 className="mb-1 text-sm font-semibold text-ink">Description</h3>
            <p className="whitespace-pre-wrap text-sm text-ink">{product.description || <span className="text-muted">No description given.</span>}</p>
          </section>

          {product.variants && product.variants.length > 0 && (
            <section className="border-t border-line pt-4">
              <h3 className="mb-1 text-sm font-semibold text-ink">Sizes</h3>
              <ul className="divide-y divide-line text-sm">
                {product.variants.map((v) => (
                  <li key={v.id} className="flex justify-between gap-3 py-2">
                    <span className="text-ink">
                      {v.name}
                      {v.weightGrams ? <span className="text-muted"> · {v.weightGrams} g</span> : null}
                    </span>
                    <span className="font-medium text-ink tabular-nums">{formatPrice(v.price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="border-t border-line pt-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              {facts
                .filter(([, v]) => v)
                .map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted">{label}</dt>
                    <dd className="text-ink">{value}</dd>
                  </div>
                ))}
            </dl>
          </section>
        </div>

        {product.moderationStatus === 'pending' && (
          <div className="grid grid-cols-2 gap-2 border-t border-line px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3">
            <Button variant="outline" className="min-h-11 border-red-200 text-red-700 hover:bg-red-50" disabled={busy} onClick={onReject}>
              Reject
            </Button>
            <Button className="min-h-11" disabled={busy} onClick={onApprove} data-testid="dish-approve">
              {busy ? 'Approving…' : 'Approve'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
