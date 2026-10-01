'use client';

import React, { useEffect, useState, useRef, useMemo } from 'react';
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
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  CreditCard,
  Flame,
  Store,
} from 'lucide-react';
import { orderService, Order } from '@/lib/services/order.service';
import { formatPrice, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout, CUSTOMER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { useSocket } from '@/lib/hooks/use-socket';
import { useToast } from '@/components/ui/toast';
import { cartService } from '@/lib/services/cart.service';
import { apiClient } from '@/lib/api-client';

export default function OrdersPage() {
  return (
    <React.Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <OrdersContent />
    </React.Suspense>
  );
}

function OrdersContent() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
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
  const [filter, setFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const sidebarItems = CUSTOMER_SIDEBAR_ITEMS;

  useEffect(() => {
    const token = apiClient.getAccessToken();
    if (!token && !isAuthenticated) {
      router.push('/login');
      return;
    }
    loadOrders();
  }, [isAuthenticated]);

  // Live status updates via socket — no manual page refresh required
  useEffect(() => {
    if (!onOrderStatusUpdate) return;
    mountedRef.current = true;
    const unsubscribe = onOrderStatusUpdate((data: any) => {
      if (!mountedRef.current) return;
      // Keep the whole-history counts in step with the change (the order may not be
      // among the loaded ones, in which case only its old status is unknown).
      const previous = ordersRef.current.find((o) => (o as any).id === data.orderId) as any;
      const previousStatus: string | undefined = previous?.orderStatus ?? previous?.status;
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
          (o as any).id === data.orderId
            ? { ...o, orderStatus: data.status, status: data.status }
            : o
        )
      );
      if (data.status === 'cancelled') {
        showToast(
          `Order #${data.orderNumber ?? data.orderId} has been cancelled.`,
          'error',
          10000
        );
      } else {
        showToast(
          `Order #${data.orderNumber ?? data.orderId} status: ${String(data.status).replace(/_/g, ' ')}`,
          'info'
        );
      }
    });
    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [onOrderStatusUpdate, showToast]);

  const PAGE_SIZE = 20;

  const loadOrders = async (pageToLoad = 1) => {
    const append = pageToLoad > 1;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const response = await orderService.getMyOrders({ page: pageToLoad, limit: PAGE_SIZE });
      const data = (response as any)?.data ?? response;
      const incoming: Order[] = data?.orders ?? [];
      setOrders((prev) => {
        if (!append) return incoming;
        const seen = new Set(prev.map((o) => (o as any).id));
        return [...prev, ...incoming.filter((o) => !seen.has((o as any).id))];
      });
      setPage(data?.pagination?.page ?? pageToLoad);
      setTotalPages(data?.pagination?.totalPages ?? 1);
      if (data?.statusCounts) setStatusCounts(data.statusCounts);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  const handleReorder = async (e: React.MouseEvent, order: Order) => {
    e.preventDefault();
    e.stopPropagation();
    setReorderingId(order.id);
    try {
      showToast('Adding order items to tray...', 'info');
      let items = (order as any).items || [];
      if (!items.length || !items[0]?.productId) {
        try {
          const fullRes = await orderService.getOrder(order.id);
          items = fullRes.data?.items || items;
        } catch {
          // ignore fallback error
        }
      }
      for (const item of items) {
        const pId = item.productId || (item as any).product?.id;
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
      showToast('Items added to your tray! Redirecting...', 'success');
      router.push('/cart');
    } catch {
      router.push(`/orders/${order.id}`);
    } finally {
      setReorderingId(null);
    }
  };

  // Derive effective status
  const getOrderStatus = (o: Order | any): string => {
    const raw = String(o?.orderStatus ?? o?.order_status ?? o?.status ?? 'pending');
    if (raw === 'pending') {
      const items: any[] = o?.items ?? [];
      if (items.length > 0 && items.every((item: any) => item.status === 'cancelled')) {
        return 'cancelled';
      }
    }
    return raw;
  };

  ordersRef.current = orders;

  // Count summaries
  const sumStatuses = (statuses: string[]) =>
    statuses.reduce((sum, st) => sum + (statusCounts?.[st] ?? 0), 0);
  const totalOrdersCount = statusCounts
    ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
    : orders.length;
  const inProgressCount = statusCounts
    ? sumStatuses(['pending', 'confirmed', 'preparing', 'ready'])
    : orders.filter((o) => ['pending', 'confirmed', 'preparing', 'ready'].includes(getOrderStatus(o))).length;
  const onTheWayCount = statusCounts
    ? sumStatuses(['in_transit', 'dispatched'])
    : orders.filter((o) => ['in_transit', 'dispatched'].includes(getOrderStatus(o))).length;
  const deliveredCount = statusCounts
    ? sumStatuses(['delivered', 'completed'])
    : orders.filter((o) => ['delivered', 'completed'].includes(getOrderStatus(o))).length;
  const cancelledCount = statusCounts
    ? sumStatuses(['cancelled'])
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
        const items = (o as any).items || [];
        const hasItemMatch = items.some((i: any) =>
          (i.productName || i.name || '').toLowerCase().includes(q)
        );
        return num.includes(q) || hasItemMatch;
      }

      return true;
    });
  }, [orders, filter, searchQuery]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return {
          label: 'Order Placed',
          color: 'bg-amber-50 text-amber-800 border-amber-200/80',
          dotColor: 'bg-amber-500',
          icon: <Clock className="w-3.5 h-3.5" />,
        };
      case 'confirmed':
        return {
          label: 'Chef Confirmed',
          color: 'bg-blue-50 text-blue-800 border-blue-200/80',
          dotColor: 'bg-blue-500',
          icon: <Sparkles className="w-3.5 h-3.5" />,
        };
      case 'preparing':
        return {
          label: 'Preparing in Kitchen',
          color: 'bg-purple-50 text-purple-800 border-purple-200/80',
          dotColor: 'bg-purple-500',
          icon: <ChefHat className="w-3.5 h-3.5" />,
        };
      case 'ready':
        return {
          label: 'Ready for Dispatch',
          color: 'bg-indigo-50 text-indigo-800 border-indigo-200/80',
          dotColor: 'bg-indigo-500',
          icon: <Package className="w-3.5 h-3.5" />,
        };
      case 'dispatched':
      case 'in_transit':
        return {
          label: 'On the Way',
          color: 'bg-orange-50 text-orange-800 border-orange-200/80',
          dotColor: 'bg-[#FF5500]',
          icon: <Truck className="w-3.5 h-3.5" />,
        };
      case 'delivered':
      case 'completed':
        return {
          label: 'Delivered',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          dotColor: 'bg-emerald-500',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
        };
      case 'cancelled':
        return {
          label: 'Cancelled',
          color: 'bg-rose-50 text-rose-800 border-rose-200/80',
          dotColor: 'bg-rose-500',
          icon: <XCircle className="w-3.5 h-3.5" />,
        };
      default:
        return {
          label: status.replace(/_/g, ' '),
          color: 'bg-slate-50 text-slate-800 border-slate-200',
          dotColor: 'bg-slate-400',
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
      title="My Orders"
      subtitle="Track live preparations, dispatch status & view order receipts"
      sidebarItems={sidebarItems}
      userType="customer"
    >
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* ============================================================ */}
        {/* STATS SUMMARY METRICS (Rich Modern Bento Cards) */}
        {/* ============================================================ */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
          {/* 1. Total Orders */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-slate-900/5 via-white to-slate-50 border border-slate-200/80 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700 shadow-inner">
                <Receipt className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Lifetime
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {totalOrdersCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-slate-500 mt-0.5">
              Total Placed
            </div>
          </div>

          {/* 2. In Progress */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500/10 via-amber-50/30 to-white border border-amber-200/80 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-amber-100/80 flex items-center justify-center text-amber-700 shadow-inner">
                <ChefHat className="w-5 h-5" />
              </div>
              {inProgressCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                  Live Cooking
                </span>
              ) : (
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  Active
                </span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-900 tracking-tight">
              {inProgressCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-amber-700/80 mt-0.5">
              Kitchen Prep
            </div>
          </div>

          {/* 3. On the Way */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-orange-500/10 via-orange-50/30 to-white border border-orange-200/80 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-orange-100/80 flex items-center justify-center text-[#FF5500] shadow-inner">
                <Truck className="w-5 h-5" />
              </div>
              {onTheWayCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-orange-100 text-[#FF5500] text-[10px] font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF5500] animate-ping" />
                  Rider Dispatched
                </span>
              ) : (
                <span className="text-[11px] font-bold text-orange-400 uppercase tracking-wider">
                  Transit
                </span>
              )}
            </div>
            <div className="text-2xl sm:text-3xl font-black text-[#FF5500] tracking-tight">
              {onTheWayCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-orange-700/80 mt-0.5">
              On the Way
            </div>
          </div>

          {/* 4. Delivered */}
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-emerald-500/10 via-emerald-50/30 to-white border border-emerald-200/80 p-4 sm:p-5 shadow-2xs hover:shadow-xs transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-emerald-100/80 flex items-center justify-center text-emerald-700 shadow-inner">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                Fulfilled
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-black text-emerald-900 tracking-tight">
              {deliveredCount}
            </div>
            <div className="text-xs sm:text-sm font-semibold text-emerald-700/80 mt-0.5">
              Delivered Meals
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* FILTER BAR & SEARCH (Modern Segmented Pills) */}
        {/* ============================================================ */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-white rounded-2xl sm:rounded-3xl border border-slate-200/80 shadow-2xs">
          {/* Segmented Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto p-1 scrollbar-none">
            {[
              { id: 'all', label: 'All Orders', count: totalOrdersCount },
              {
                id: 'active',
                label: 'Active Orders',
                count: inProgressCount + onTheWayCount,
                hasDot: inProgressCount + onTheWayCount > 0,
              },
              { id: 'past', label: 'Past Orders', count: deliveredCount },
              { id: 'cancelled', label: 'Cancelled', count: cancelledCount },
            ].map((tab) => {
              const active = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id)}
                  className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-xl sm:rounded-2xl text-xs sm:text-sm font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                    active
                      ? 'bg-[#FF5500] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
                  }`}
                >
                  {tab.hasDot && (
                    <span
                      className={`w-2 h-2 rounded-full ${
                        active ? 'bg-white' : 'bg-[#FF5500] animate-pulse'
                      }`}
                    />
                  )}
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-md text-[11px] font-extrabold ${
                      active
                        ? 'bg-white/25 text-white'
                        : 'bg-slate-100 text-slate-500'
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
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by order # or dish..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs sm:text-sm bg-slate-50 border border-slate-200/90 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#FF5500]/20 focus:border-[#FF5500] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
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
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-xs">
            <div className="w-10 h-10 border-3 border-[#FF5500] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-800">Retrieving your orders...</p>
            <p className="text-xs text-slate-400 mt-1">Connecting to kitchen order ledger</p>
          </div>
        ) : filteredOrders.length === 0 ? (
          /* Empty State */
          <div className="bg-gradient-to-b from-white to-slate-50/60 rounded-3xl p-8 sm:p-14 text-center border border-slate-200/90 shadow-2xs">
            <div className="w-20 h-20 rounded-3xl bg-orange-50 border border-orange-200/70 flex items-center justify-center mx-auto mb-4 text-[#FF5500] shadow-inner">
              <Package className="w-10 h-10" />
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mb-2">
              {searchQuery
                ? 'No matching orders found'
                : filter === 'all'
                ? 'No orders placed yet'
                : `No ${filter.replace(/_/g, ' ')} orders`}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mb-6 leading-relaxed">
              {searchQuery
                ? `No orders matching "${searchQuery}". Try searching for another order number or dish.`
                : filter === 'all'
                ? 'Order authentic generational dishes & sub-zero provisions from verified home chefs.'
                : `You currently have no orders categorized as ${filter}. Check other tabs or explore our kitchens.`}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/dashboard">
                <Button className="bg-[#FF5500] hover:bg-[#e04b00] text-white font-bold px-6 py-2.5 rounded-2xl shadow-sm">
                  <ShoppingBag className="w-4 h-4 mr-2" /> Explore Kitchens &amp; Dishes
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
              const items = (order as any).items ?? [];
              const itemCount = items.length || (order as any).itemsCount || 1;
              const step = getStepProgress(status);

              return (
                <div
                  key={order.id}
                  className="group relative bg-white rounded-3xl border border-slate-200/90 hover:border-[#FF5500]/60 shadow-2xs hover:shadow-md transition-all duration-200 overflow-hidden"
                >
                  {/* Subtle top accent bar for active orders */}
                  {isActive && (
                    <div className="h-1 w-full bg-gradient-to-r from-amber-400 via-[#FF5500] to-orange-500" />
                  )}

                  <div className="p-4 sm:p-6 space-y-4">
                    {/* Top Row: Order ID, Badges, Date */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Link
                          href={`/orders/${order.id}`}
                          className="text-base sm:text-lg font-black text-slate-900 hover:text-[#FF5500] transition-colors flex items-center gap-1.5"
                        >
                          <span>Order #{order.orderNumber}</span>
                          <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-slate-400" />
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
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                              : 'bg-amber-50 text-amber-800 border-amber-200/80'
                          }`}
                        >
                          <CreditCard className="w-3 h-3" />
                          {order.paymentStatus === 'paid' ? 'Paid' : 'Payment: Pending'}
                        </span>
                      </div>

                      {/* Date & Time */}
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span>{formatDate(order.createdAt)}</span>
                      </div>
                    </div>

                    {/* Active Order Stepper Progress Tracker */}
                    {isActive && (
                      <div className="bg-gradient-to-r from-slate-50/80 to-orange-50/40 rounded-2xl p-3.5 border border-slate-100">
                        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <Flame className="w-3.5 h-3.5 text-[#FF5500]" />
                          Live Kitchen Tracking
                        </div>
                        <div className="grid grid-cols-4 gap-2 relative">
                          {[
                            { stepNum: 1, name: 'Received', icon: Clock },
                            { stepNum: 2, name: 'Confirmed', icon: Sparkles },
                            { stepNum: 3, name: 'Cooking', icon: ChefHat },
                            { stepNum: 4, name: 'On Way', icon: Truck },
                          ].map((st, idx) => {
                            const isDone = step >= st.stepNum;
                            const isCurrent = step === st.stepNum;
                            const IconComponent = st.icon;
                            return (
                              <div key={st.stepNum} className="flex flex-col items-center text-center">
                                <div
                                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                                    isCurrent
                                      ? 'bg-[#FF5500] text-white shadow-xs ring-4 ring-orange-100 animate-pulse'
                                      : isDone
                                      ? 'bg-emerald-600 text-white'
                                      : 'bg-slate-200 text-slate-400'
                                  }`}
                                >
                                  <IconComponent className="w-3.5 h-3.5" />
                                </div>
                                <span
                                  className={`text-[11px] font-bold mt-1.5 ${
                                    isCurrent
                                      ? 'text-[#FF5500]'
                                      : isDone
                                      ? 'text-slate-800'
                                      : 'text-slate-400'
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
                            {items.map((it: any, iIdx: number) => (
                              <div
                                key={it.id ?? iIdx}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs font-bold text-slate-800"
                              >
                                <span className="w-5 h-5 rounded-md bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-[#FF5500]">
                                  {it.quantity || 1}×
                                </span>
                                <span className="truncate max-w-[180px] sm:max-w-[240px]">
                                  {it.productName || it.name || (it.product && it.product.name) || 'Delicious Dish'}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 font-medium">
                            {itemCount} item{itemCount !== 1 ? 's' : ''} in this order
                          </div>
                        )}
                      </div>

                      {/* Amount and CTAs */}
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <div className="text-left sm:text-right">
                          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            Order Total
                          </span>
                          <span className="text-lg sm:text-2xl font-black text-slate-950 tracking-tight">
                            {formatPrice(order.totalAmount)}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {['delivered', 'completed'].includes(status) && (
                            <button
                              type="button"
                              onClick={(e) => handleReorder(e, order)}
                              disabled={reorderingId === order.id}
                              className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-2 rounded-xl text-xs font-bold text-[#FF5500] bg-orange-50 hover:bg-[#FF5500] hover:text-white border border-orange-200/80 transition-all cursor-pointer shadow-2xs"
                              title="Reorder this entire meal into your tray"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${reorderingId === order.id ? 'animate-spin' : ''}`} />
                              <span>Reorder</span>
                            </button>
                          )}

                          <Link
                            href={`/orders/${order.id}`}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-all shadow-xs"
                          >
                            <span>Details</span>
                            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
              className="px-6 py-2.5 rounded-xl text-sm font-bold bg-slate-900 hover:bg-slate-800 text-white"
            >
              {loadingMore ? 'Loading…' : `Load more orders (${orders.length} of ${totalOrdersCount})`}
            </Button>
            {filter !== 'all' && (
              <p className="text-xs text-slate-400 mt-2">
                Showing matches among the orders loaded so far.
              </p>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
