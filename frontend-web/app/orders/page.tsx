'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ShoppingBag, Package, RotateCcw, Search, X } from 'lucide-react';
import { orderService, Order, OrderItem } from '@/lib/services/order.service';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useSocket } from '@/lib/hooks/use-socket';
import { useToast } from '@/components/ui/toast';
import { cartService } from '@/lib/services/cart.service';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { commonMessages, statusKey } from '@/lib/i18n/messages/common';
import { ordersMessages } from '@/lib/i18n/messages/orders';
import { useShallow } from 'zustand/react/shallow';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import { awaitingPayment, orderProgress, paymentNote, type PaymentNote } from '@/components/orders/order-progress';

/** A listed order, with what newer servers add to the list (how it is paid and fulfilled, and its kitchen). */
type ListedOrder = Order & {
  paymentMethod?: string | null;
  deliveryType?: string | null;
  items: Array<Order['items'][number] & { seller?: { businessName?: string | null } | null }>;
};

const ACTIVE_STATUSES = ['pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit'];
/** Payment words worth a line on the card; "paid", "pay on delivery" and "not charged" add nothing to the status. */
const SHOWN_PAYMENT_NOTES: PaymentNote[] = ['awaitingPayment', 'submitted', 'failed', 'refunded', 'refundPending'];

export default function OrdersPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-raised">
          <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OrdersContent />
    </React.Suspense>
  );
}

function OrdersContent() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated })));
  const { showToast } = useToast();
  const { onOrderStatusUpdate } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  // Orders arrive 20 at a time. The summary cards use whole-history counts from the
  // server (statusCounts), not just the orders loaded so far.
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const ordersRef = useRef<Order[]>([]);
  const [loading, setLoading] = useState(true);
  // Why the first page of orders could not be loaded; shown instead of an empty list, which would say there are no orders.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const mountedRef = useRef(false);
  const t = useT(ordersMessages);
  const tc = useT(commonMessages);

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  // Live status updates via socket — no manual page refresh required
  useEffect(() => {
    if (!onOrderStatusUpdate) return;
    mountedRef.current = true;
    const unsubscribe = onOrderStatusUpdate((data) => {
      if (!mountedRef.current) return;
      // Keep the whole-history counts in step with the change (the order may not be
      // among the loaded ones, in which case only its old status is unknown).
      const previous = ordersRef.current.find((o) => o.id === data.orderId);
      const previousStatus: string | undefined = previous?.orderStatus ?? previous?.status;
      if (!previousStatus) {
        // Not among the loaded orders (older page): its old status is unknown, so ask the
        // server for the true counts instead of letting the cards drift.
        orderService
          .getMyOrders({ page: 1, limit: 1 })
          .then((r) => {
            const counts = r.data?.statusCounts;
            if (mountedRef.current && counts) setStatusCounts(counts);
          })
          .catch(() => {});
      }
      if (previousStatus && previousStatus !== data.status) {
        setStatusCounts((prev) =>
          prev
            ? {
                ...prev,
                [previousStatus]: Math.max(0, (prev[previousStatus] ?? 0) - 1),
                [data.status]: (prev[data.status] ?? 0) + 1,
              }
            : prev
        );
      }
      setOrders((prev) =>
        prev.map((o) =>
          o.id === data.orderId
            ? { ...o, orderStatus: data.status, status: data.status }
            : o
        )
      );
      if (data.status === 'cancelled') {
        showToast(
          t('list.toastCancelled', { number: data.orderNumber ?? data.orderId }),
          'error',
          10000
        );
      } else {
        showToast(
          t('list.toastStatus', {
            number: data.orderNumber ?? data.orderId,
            status: statusKey(String(data.status)) in commonMessages.en
              ? tc(statusKey(String(data.status)))
              : String(data.status).replace(/_/g, ' '),
          }),
          'info'
        );
      }
    });
    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [onOrderStatusUpdate, showToast, t, tc]);

  const PAGE_SIZE = 20;

  const loadOrders = async (pageToLoad = 1) => {
    const append = pageToLoad > 1;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const response = await orderService.getMyOrders({ page: pageToLoad, limit: PAGE_SIZE });
      const data = response.data;
      const incoming: Order[] = data?.orders ?? [];
      setOrders((prev) => {
        if (!append) return incoming;
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...incoming.filter((o) => !seen.has(o.id))];
      });
      setPage(data?.pagination?.page ?? pageToLoad);
      setTotalPages(data?.pagination?.totalPages ?? 1);
      if (data?.statusCounts) setStatusCounts(data.statusCounts);
    } catch (error) {
      console.error('Failed to load orders:', error);
      // The orders already on the screen stay; only the first page has nothing to fall back on.
      if (append) showToast(apiErrorMessage(error, tc('somethingWrong')), 'error');
      else setLoadError(error);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }
    loadOrders();
  }, [isAuthenticated]);

  const handleReorder = async (e: React.MouseEvent, order: Order) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderingId(order.id);
    try {
      // The list carries only the first dishes and not how each was stocked; the order itself has all of them.
      const items: OrderItem[] = (await orderService.getOrder(order.id)).data?.items ?? order.items ?? [];
      for (const item of items) {
        const pId = item.productId || item.product?.id;
        if (pId) {
          await cartService.addToCart({
            productId: pId,
            variantId: item.variantId || undefined,
            quantity: item.quantity || 1,
            stockType: item.fulfillmentType === 'hub' ? 'hub' : 'direct',
            hubId: item.fulfillmentType === 'hub' ? item.hubId ?? undefined : undefined,
            clearAndAdd: true,
          });
        }
      }
      showToast(t('list.toastAddedToTray'), 'success');
      router.push('/cart');
    } catch (error) {
      showToast(apiErrorMessage(error, t('list.reorderFailed')), 'error');
    } finally {
      setReorderingId(null);
    }
  };

  // Derive effective status
  const getOrderStatus = (o: Order): string => {
    const raw = String(o.orderStatus ?? o.status ?? 'pending');
    if (raw === 'pending') {
      const items = o.items ?? [];
      if (items.length > 0 && items.every((item) => item.status === 'cancelled')) {
        return 'cancelled';
      }
    }
    return raw;
  };

  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  // Count summaries
  const sumStatuses = (statuses: string[]) =>
    statuses.reduce((sum, st) => sum + (statusCounts?.[st] ?? 0), 0);
  const totalOrdersCount = statusCounts
    ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
    : orders.length;
  // A pending order whose items were all cancelled is shown as cancelled (see getOrderStatus);
  // the server counts it as pending, so move the loaded ones across to keep cards and list in step.
  const derivedCancelled = orders.filter(
    (o) => String(o.orderStatus ?? o.status ?? 'pending') === 'pending' && getOrderStatus(o) === 'cancelled'
  ).length;
  const inProgressCount = statusCounts
    ? Math.max(0, sumStatuses(['pending', 'confirmed', 'preparing', 'ready']) - derivedCancelled)
    : orders.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(getOrderStatus(o))).length;
  const onTheWayCount = statusCounts
    ? sumStatuses(['in_transit', 'dispatched'])
    : orders.filter((o) => ['in_transit', 'dispatched'].includes(getOrderStatus(o))).length;
  const deliveredCount = statusCounts
    ? sumStatuses(['delivered', 'completed'])
    : orders.filter((o) => ['delivered', 'completed'].includes(getOrderStatus(o))).length;
  const cancelledCount = statusCounts
    ? sumStatuses(['cancelled']) + derivedCancelled
    : orders.filter((o) => getOrderStatus(o) === 'cancelled').length;
  const hasMore = page < totalPages;

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const s = getOrderStatus(o);
      let matchesFilter = true;
      if (filter === 'active') {
        matchesFilter = ['pending', 'confirmed', 'preparing', 'ready', 'in_transit', 'dispatched'].includes(s);
      } else if (filter === 'past') {
        matchesFilter = ['delivered', 'completed'].includes(s);
      } else if (filter === 'cancelled') {
        matchesFilter = s === 'cancelled';
      }

      if (!matchesFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const num = String(o.orderNumber || '').toLowerCase();
        const hasItemMatch = (o.items || []).some((i) => (i.productName || '').toLowerCase().includes(q));
        return num.includes(q) || hasItemMatch;
      }

      return true;
    }).sort((a, b) => Number(ACTIVE_STATUSES.includes(getOrderStatus(b))) - Number(ACTIVE_STATUSES.includes(getOrderStatus(a))));
  }, [orders, filter, searchQuery]);

  const getStatusBadge = (status: string) => ({
    label: `list.badge.${status}` in ordersMessages.en
      ? t(`list.badge.${status}` as keyof typeof ordersMessages.en)
      : statusKey(status) in commonMessages.en
        ? tc(statusKey(status))
        : status.replace(/_/g, ' '),
  });

  return (
    <DashboardLayout
      title={t('list.title')}
      subtitle={t('list.subtitle')}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {loadError && !loading && orders.length === 0 ? (
          <LoadError error={loadError} onRetry={() => loadOrders()} title={t('list.loadFailed')} />
        ) : (
        <>
        {!loading && totalOrdersCount === 0 && orders.length === 0 ? (
          <div className="bg-surface rounded-[24px] p-8 sm:p-12 text-center border border-line" data-testid="orders-empty">
            <div className="w-16 h-16 rounded-2xl bg-brand-soft flex items-center justify-center mx-auto mb-4 text-brand-soft-ink">
              <Package className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-ink mb-2">{t('list.emptyAllTitle')}</h3>
            <p className="text-sm text-muted max-w-md mx-auto mb-6">{t('list.emptyAllBody')}</p>
            <Link href="/kitchens">
              <Button className="min-h-11 px-6 rounded-xl">
                <ShoppingBag className="w-4 h-4" /> {t('list.exploreKitchens')}
              </Button>
            </Link>
          </div>
        ) : (
        <>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 py-1 scrollbar-none" role="tablist">
            {[
              { id: 'all', label: t('list.tab.all'), count: totalOrdersCount },
              { id: 'active', label: t('list.tab.active'), count: inProgressCount + onTheWayCount },
              { id: 'past', label: t('list.tab.past'), count: deliveredCount },
              { id: 'cancelled', label: t('list.tab.cancelled'), count: cancelledCount },
            ].map((tab) => {
              const selected = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setFilter(tab.id)}
                  className={`flex-shrink-0 inline-flex items-center gap-2 min-h-11 px-4 rounded-full text-sm font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    selected ? 'bg-brand-soft text-brand-soft-ink border border-brand' : 'bg-surface text-ink border border-line hover:bg-raised'
                  }`}
                >
                  <span>{tab.label}</span>
                  {!loading && (
                    <span className={`px-1.5 rounded-full text-xs font-semibold tabular-nums ${selected ? 'bg-surface text-brand-soft-ink' : 'bg-raised text-muted'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="relative sm:min-w-[260px]">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" aria-hidden />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('list.searchPlaceholder')}
              aria-label={t('list.searchPlaceholder')}
              className="w-full h-11 ps-9 pe-11 rounded-xl text-sm bg-raised border border-transparent text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand focus:bg-surface transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('list.clearSearch')}
                className="absolute end-0 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full text-muted hover:text-ink flex items-center justify-center"
              >
                <X className="w-4 h-4" aria-hidden />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted">{t('list.loadingTitle')}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="bg-surface rounded-[20px] p-8 text-center border border-line">
            <h3 className="text-lg font-semibold text-ink mb-1">
              {searchQuery ? t('list.emptySearchTitle') : filter === 'all' ? t('list.emptyAllTitle') : t(`list.emptyTitle.${filter as 'active' | 'past' | 'cancelled'}`)}
            </h3>
            <p className="text-sm text-muted max-w-md mx-auto">
              {searchQuery ? t('list.emptySearchBody', { query: searchQuery }) : filter === 'all' ? t('list.emptyAllBody') : t(`list.emptyBody.${filter as 'active' | 'past' | 'cancelled'}`)}
            </p>
          </div>
        ) : (
          <ul className="space-y-3" data-testid="orders-list">
            {(filteredOrders as ListedOrder[]).map((order) => {
              const status = getOrderStatus(order);
              const unpaid = awaitingPayment(status, order.paymentMethod, order.paymentStatus);
              const badge = getStatusBadge(unpaid ? 'pending_payment' : status);
              const isActive = ACTIVE_STATUSES.includes(status);
              const items = order.items ?? [];
              const itemCount = items.length || order.itemsCount || 1;
              const note = paymentNote(status, order.paymentMethod, order.paymentStatus);
              const showNote = SHOWN_PAYMENT_NOTES.includes(note) && !(unpaid && note === 'awaitingPayment');
              const kitchen = items[0]?.seller?.businessName;
              const progress = isActive && !unpaid ? orderProgress(status, order.deliveryType) : null;

              return (
                <li
                  key={order.id}
                  className={`relative bg-surface rounded-[20px] border transition-colors ${
                    isActive ? 'border-brand/50 shadow-[var(--shadow-card)]' : 'border-line hover:border-line-strong'
                  }`}
                  data-testid="order-card"
                >
                  <div className="p-4 sm:p-5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/orders/${order.id}`}
                          className="block truncate font-semibold text-ink hover:underline after:absolute after:inset-0 after:rounded-[20px]"
                        >
                          {kitchen || t('list.orderNumber', { number: order.orderNumber })}
                        </Link>
                        {kitchen && (
                          <p className="text-xs text-muted tabular-nums">
                            <bdi>#{order.orderNumber}</bdi>
                          </p>
                        )}
                      </div>
                      <OrderStatusPill status={unpaid ? 'pending_payment' : status} label={badge.label} className="shrink-0" />
                    </div>

                    {progress && (
                      <div data-testid="order-progress">
                        <p className="text-xs text-muted">
                          {t('list.step', { step: progress.reached + 1, total: progress.steps.length })}
                        </p>
                        <div
                          role="progressbar"
                          aria-valuemin={1}
                          aria-valuemax={progress.steps.length}
                          aria-valuenow={progress.reached + 1}
                          aria-valuetext={t('list.step', { step: progress.reached + 1, total: progress.steps.length })}
                          className="mt-1 h-1.5 rounded-full bg-raised overflow-hidden"
                        >
                          <div className="h-full rounded-full bg-brand" style={{ width: `${((progress.reached + 1) / progress.steps.length) * 100}%` }} />
                        </div>
                      </div>
                    )}

                    <p className={`text-sm truncate ${isActive ? 'text-ink' : 'text-muted'}`}>
                      {items.length > 0
                        ? items.map((it) => `${it.quantity || 1}× ${it.productName || it.product?.name || t('list.dishFallback')}`).join(', ')
                        : itemCount !== 1
                          ? t('list.itemsInOrder', { count: itemCount })
                          : t('list.oneItemInOrder')}
                    </p>

                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 text-sm text-muted">
                        <bdi dir="ltr" className={`font-semibold tabular-nums ${status === 'cancelled' ? 'text-muted' : 'text-ink'}`}>
                          {formatPrice(order.totalAmount)}
                        </bdi>
                        {' · '}
                        <bdi>{formatDateTime(order.createdAt)}</bdi>
                        {showNote && <span data-testid="payment-note"> · {t(`list.pay.${note}`)}</span>}
                      </p>
                      {['delivered', 'completed', 'cancelled'].includes(status) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleReorder(e, order)}
                          disabled={reorderingId === order.id}
                          className="relative z-10 min-h-11 shrink-0"
                          title={t('list.reorderTitle')}
                        >
                          <RotateCcw className={`w-3.5 h-3.5 ${reorderingId === order.id ? 'animate-spin' : ''}`} />
                          {t('list.reorder')}
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore && !loading && (
          <div className="mt-6 text-center">
            <Button
              onClick={() => loadOrders(page + 1)}
              disabled={loadingMore}
              className="h-11 px-6 rounded-xl text-sm font-bold bg-surface border border-line-strong hover:bg-raised text-ink"
            >
              {loadingMore ? tc('loading') : t('list.loadMore', { loaded: orders.length, total: totalOrdersCount })}
            </Button>
            {filter !== 'all' && (
              <p className="text-xs text-muted mt-2">
                {t('list.filterNote')}
              </p>
            )}
          </div>
        )}
        </>
        )}
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
