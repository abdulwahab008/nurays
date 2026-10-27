'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ShoppingBag,
  Clock,
  CheckCircle2,
  XCircle,
  ChefHat,
  Truck,
  Package,
  Calendar,
  ArrowRight,
  RotateCcw,
  Receipt,
  Search,
  Sparkles,
  ExternalLink,
  CreditCard,
  Flame,
} from 'lucide-react';
import { orderService, Order, OrderItem } from '@/lib/services/order.service';
import { formatPrice, formatDate } from '@/lib/utils';
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
      router.push(loginUrlHere());
      return;
    }
    loadOrders();
  }, [isAuthenticated]);

  const handleReorder = async (e: React.MouseEvent, order: Order) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderingId(order.id);
    try {
      showToast(t('list.toastAddingToTray'), 'info');
      let items: OrderItem[] = order.items || [];
      if (!items.length || !items[0]?.productId) {
        try {
          const fullRes = await orderService.getOrder(order.id);
          items = fullRes.data?.items || items;
        } catch {
          // ignore fallback error
        }
      }
      for (const item of items) {
        const pId = item.productId || item.product?.id;
        if (pId) {
          await cartService.addToCart({
            productId: pId,
            variantId: item.variantId || undefined,
            quantity: item.quantity || 1,
            stockType: 'direct',
            clearAndAdd: true,
          });
        }
      }
      showToast(t('list.toastAddedToTray'), 'success');
      router.push('/cart');
    } catch {
      router.push(`/orders/${order.id}`);
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
    });
  }, [orders, filter, searchQuery]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          label: t('list.badge.pending'),
          color: 'bg-accent-soft text-accent-soft-ink border-transparent',
          dotColor: 'bg-accent-soft-ink',
          icon: <Clock className="w-3.5 h-3.5" />,
        };
      case 'confirmed':
        return {
          label: t('list.badge.confirmed'),
          color: 'bg-frozen-soft text-frozen-ink border-transparent',
          dotColor: 'bg-frozen-ink',
          icon: <Sparkles className="w-3.5 h-3.5" />,
        };
      case 'preparing':
        return {
          label: t('list.badge.preparing'),
          color: 'bg-accent text-on-accent border-transparent',
          dotColor: 'bg-on-accent',
          icon: <ChefHat className="w-3.5 h-3.5" />,
        };
      case 'ready':
        return {
          label: t('list.badge.ready'),
          color: 'bg-brand-soft text-brand-soft-ink border-transparent',
          dotColor: 'bg-brand-soft-ink',
          icon: <Package className="w-3.5 h-3.5" />,
        };
      case 'dispatched':
      case 'in_transit':
        return {
          label: t('list.badge.onTheWay'),
          color: 'bg-brand text-on-brand border-transparent',
          dotColor: 'bg-on-brand',
          icon: <Truck className="w-3.5 h-3.5" />,
        };
      case 'delivered':
      case 'completed':
        return {
          label: t('list.badge.delivered'),
          color: 'bg-raised text-ink border-line',
          dotColor: 'bg-brand',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        };
      case 'cancelled':
        return {
          label: t('list.badge.cancelled'),
          color: 'bg-red-50 text-red-800 border-red-200',
          dotColor: 'bg-red-600',
          icon: <XCircle className="w-3.5 h-3.5" />,
        };
      default:
        return {
          label: statusKey(status) in commonMessages.en ? tc(statusKey(status)) : status.replace(/_/g, ' '),
          color: 'bg-raised text-ink border-line',
          dotColor: 'bg-muted',
          icon: <Clock className="w-3.5 h-3.5" />,
        };
    }
  };

  const getStepProgress = (status: string) => {
    switch (status) {
      case 'pending':
        return 1;
      case 'confirmed':
        return 2;
      case 'preparing':
      case 'ready':
        return 3;
      case 'dispatched':
      case 'in_transit':
        return 4;
      case 'delivered':
      case 'completed':
        return 5;
      default:
        return 1;
    }
  };

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
        {/* ============================================================ */}
        {/* STATS SUMMARY METRICS (Rich Modern Bento Cards) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* 1. Total Orders */}
          <div className="rounded-[20px] bg-surface border border-line p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-raised flex items-center justify-center text-ink">
                <Receipt className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                {t('list.lifetime')}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {totalOrdersCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-muted mt-0.5">
              {t('list.totalPlaced')}
            </div>
          </div>

          {/* 2. In Progress */}
          <div className="rounded-[20px] bg-surface border border-line p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-accent-soft flex items-center justify-center text-accent-soft-ink">
                <ChefHat className="w-5 h-5" />
              </div>
              {inProgressCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent-soft text-accent-soft-ink text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent-soft-ink animate-pulse" />
                  {t('list.liveCooking')}
                </span>
              ) : (
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  {t('list.active')}
                </span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {inProgressCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-muted mt-0.5">
              {t('list.kitchenPrep')}
            </div>
          </div>

          {/* 3. On the Way */}
          <div className="rounded-[20px] bg-surface border border-line p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center text-brand-soft-ink">
                <Truck className="w-5 h-5" />
              </div>
              {onTheWayCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-brand-soft text-brand-soft-ink text-[11px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  {t('list.riderDispatched')}
                </span>
              ) : (
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  {t('list.transit')}
                </span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {onTheWayCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-muted mt-0.5">
              {t('list.onTheWay')}
            </div>
          </div>

          {/* 4. Delivered */}
          <div className="rounded-[20px] bg-surface border border-line p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-brand-soft flex items-center justify-center text-brand-soft-ink">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                {t('list.fulfilled')}
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              {deliveredCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-muted mt-0.5">
              {t('list.deliveredMeals')}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* FILTER BAR & SEARCH (Modern Segmented Pills) */}
        {/* ============================================================ */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto p-1 scrollbar-none">
            {[
              { id: 'all', label: t('list.tab.all'), count: totalOrdersCount },
              {
                id: 'active',
                label: t('list.tab.active'),
                count: inProgressCount + onTheWayCount,
                hasDot: inProgressCount + onTheWayCount > 0,
              },
              { id: 'past', label: t('list.tab.past'), count: deliveredCount },
              { id: 'cancelled', label: t('list.tab.cancelled'), count: cancelledCount },
            ].map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  aria-pressed={active}
                  onClick={() => setFilter(tab.id)}
                  className={`flex-shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-full text-sm font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    active ? 'bg-ink text-page' : 'bg-surface text-ink border border-line hover:bg-raised'
                  }`}
                >
                  {tab.hasDot && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        active ? 'bg-brand' : 'bg-brand animate-pulse'
                      }`}
                    />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 rounded-full text-[11px] font-extrabold ${
                      active ? 'bg-page/20 text-page' : 'bg-raised text-muted'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[220px] sm:min-w-[260px] px-1 sm:px-0">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('list.searchPlaceholder')}
              aria-label={t('list.searchPlaceholder')}
              className="w-full h-11 ps-9 pe-9 rounded-[14px] text-sm font-semibold bg-raised border border-transparent text-ink placeholder:text-muted placeholder:font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand focus:bg-surface transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                aria-label={t('list.clearSearch')}
                className="absolute end-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full text-sm text-muted hover:text-ink hover:bg-line"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* ORDERS LIST */}
        {/* ============================================================ */}
        {loading ? (
          <div className="bg-surface rounded-[20px] p-12 text-center border border-line">
            <div className="w-10 h-10 border-3 border-brand border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-ink">{t('list.loadingTitle')}</p>
            <p className="text-xs text-muted mt-1">{t('list.loadingSub')}</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          /* Empty State */
          <div className="bg-surface rounded-[24px] p-8 sm:p-14 text-center border border-dashed border-line-strong">
            <div className="w-20 h-20 rounded-3xl bg-brand-soft flex items-center justify-center mx-auto mb-4 text-brand-soft-ink">
              <Package className="w-10 h-10" />
            </div>
            <h3 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight mb-2">
              {searchQuery
                ? t('list.emptySearchTitle')
                : filter === 'all'
                ? t('list.emptyAllTitle')
                : t(`list.emptyTitle.${filter as 'active' | 'past' | 'cancelled'}`)}
            </h3>
            <p className="text-xs sm:text-sm text-muted max-w-md mx-auto mb-6 leading-relaxed">
              {searchQuery
                ? t('list.emptySearchBody', { query: searchQuery })
                : filter === 'all'
                ? t('list.emptyAllBody')
                : t(`list.emptyBody.${filter as 'active' | 'past' | 'cancelled'}`)}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/dashboard">
                <Button className="bg-brand hover:bg-brand-500 text-on-brand font-extrabold h-12 px-6 rounded-xl">
                  <ShoppingBag className="w-4 h-4 me-2" /> {t('list.exploreKitchens')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order) => {
              const status = getOrderStatus(order);
              const badge = getStatusBadge(status);
              const isActive = [
                'pending',
                'confirmed',
                'preparing',
                'ready',
                'dispatched',
                'in_transit',
              ].includes(status);
              const items = order.items ?? [];
              const itemCount = items.length || order.itemsCount || 1;
              const step = getStepProgress(status);

              return (
                <div
                  key={order.id}
                  className="group relative bg-surface rounded-[20px] border border-line hover:border-line-strong transition-colors overflow-hidden"
                >
                  {/* Subtle top accent bar for active orders */}
                  {isActive && (
                    <div className="h-1 w-full bg-brand" />
                  )}

                  <div className="p-4 sm:p-6 space-y-4">
                    {/* Top Row: Order ID, Badges, Date */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-line">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                          href={`/orders/${order.id}`}
                          className="text-base sm:text-lg font-extrabold text-ink hover:underline flex items-center gap-1.5"
                        >
                          <span>{t('list.orderNumber', { number: order.orderNumber })}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted" />
                        </Link>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.color}`}
                        >
                          <span className={`w-2 h-2 rounded-full ${badge.dotColor}`} />
                          {badge.label}
                        </span>

                        {/* Payment Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                            order.paymentStatus === 'paid'
                              ? 'bg-brand-soft text-brand-soft-ink border-brand/40'
                              : 'bg-accent-soft text-accent-soft-ink border-accent/50'
                          }`}
                        >
                          <CreditCard className="w-3 h-3" />
                          {order.paymentStatus === 'paid' ? t('list.paid') : t('list.paymentPending')}
                        </span>
                      </div>

                      {/* Date & Time */}
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                        <Calendar className="w-3.5 h-3.5 text-muted" />
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                    </div>

                    {/* Active Order Stepper Progress Tracker */}
                    {isActive && (
                      <div className="bg-raised rounded-2xl p-3.5">
                        <div className="text-[11px] font-bold text-muted uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-brand-ink" />
                          {t('list.liveTracking')}
                        </div>
                        <div className="grid grid-cols-4 gap-2 relative">
                          {[
                            { stepNum: 1, name: t('list.step.received'), icon: Clock },
                            { stepNum: 2, name: t('list.step.confirmed'), icon: Sparkles },
                            { stepNum: 3, name: t('list.step.cooking'), icon: ChefHat },
                            { stepNum: 4, name: t('list.step.onWay'), icon: Truck },
                          ].map((st) => {
                            const isDone = step >= st.stepNum;
                            const isCurrent = step === st.stepNum;
                            const IconComponent = st.icon;
                            return (
                              <div key={st.stepNum} className="flex flex-col items-center text-center">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                    isCurrent
                                      ? 'bg-brand text-on-brand ring-4 ring-brand/25'
                                      : isDone
                                      ? 'bg-brand-soft text-brand-soft-ink'
                                      : 'bg-line text-muted'
                                  }`}
                                >
                                  <IconComponent className="w-3.5 h-3.5" />
                                </div>
                                <span
                                  className={`text-[11px] font-bold mt-1.5 ${
                                    isCurrent
                                      ? 'text-brand-ink'
                                      : isDone
                                      ? 'text-ink'
                                      : 'text-muted'
                                  }`}
                                >
                                  {st.name}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Middle Section: Dishes preview */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {items.length > 0 ? (
                          <div className="flex flex-wrap items-center gap-2">
                            {items.map((it, iIdx) => (
                              <div
                                key={it.id ?? iIdx}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-raised text-sm font-semibold text-ink"
                              >
                                <span className="text-xs font-extrabold text-brand-ink">
                                  {it.quantity || 1}×
                                </span>
                                <span className="truncate max-w-[180px] sm:max-w-[240px]">
                                  {it.productName || it.product?.name || t('list.dishFallback')}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted font-medium">
                            {itemCount !== 1 ? t('list.itemsInOrder', { count: itemCount }) : t('list.oneItemInOrder')}
                          </div>
                        )}
                      </div>

                      {/* Amount and CTAs */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-line">
                        <div className="text-start sm:text-end">
                          <span className="block text-[11px] font-bold text-muted uppercase tracking-wider">
                            {t('list.orderTotal')}
                          </span>
                          <span className="text-lg sm:text-2xl font-extrabold text-ink tracking-tight">
                            {formatPrice(order.totalAmount)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {['delivered', 'completed'].includes(status) && (
                            <button
                              type="button"
                              onClick={(e) => handleReorder(e, order)}
                              disabled={reorderingId === order.id}
                              className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-bold text-ink border border-line-strong hover:bg-raised transition-colors cursor-pointer"
                              title={t('list.reorderTitle')}
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${reorderingId === order.id ? 'animate-spin' : ''}`} />
                              <span>{t('list.reorder')}</span>
                            </button>
                          )}

                          <Link
                            href={`/orders/${order.id}`}
                            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl text-sm font-extrabold bg-brand hover:bg-brand-500 text-on-brand transition-colors"
                          >
                            <span>{t('list.details')}</span>
                            <ArrowRight className="rtl:-scale-x-100 w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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
      </div>
    </DashboardLayout>
  );
}
