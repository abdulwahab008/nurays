'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useSocket } from '@/lib/hooks/use-socket';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';

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
  package: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  check: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  x: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  cooking: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013-1.35M15.362 5.214A8.252 8.252 0 0112 21a8.25 8.25 0 01-6.038-7.048" />
    </svg>
  ),
};

interface SellerOrder {
  id: string;
  orderId: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
  orderStatus: string;
  createdAt: string;
  customerName?: string;
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const { onNewOrder } = useSocket();
  const mountedRef = useRef(false);

  // Stable loadOrders reference so socket callback can call it without stale closure
  const filterRef = useRef(filter);
  const pageRef = useRef(page);
  filterRef.current = filter;
  pageRef.current = page;

  const loadOrders = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({
        page: pageRef.current.toString(),
        limit: '20',
      });
      if (filterRef.current !== 'all') {
        params.append('orderStatus', filterRef.current);
      }
      const response = await apiClient.get(`/seller/orders?${params.toString()}`);
      if (response.data.success) {
        const raw = response.data.data;
        const rawOrders = raw?.orders || [];
        const flat: SellerOrder[] = [];
        rawOrders.forEach((o: any) => {
          const ord = o.order || o;
          const items = o.items || [];
          const orderId = ord.id;
          const orderNumber = ord.orderNumber ?? '';
          const orderStatus = ord.orderStatus ?? 'pending';
          const createdAt = ord.createdAt;
          items.forEach((item: any) => {
            flat.push({
              id: item.id,
              orderId,
              orderNumber,
              productName: item.product?.name ?? item.productName ?? '—',
              quantity: item.quantity ?? 0,
              unitPrice: Number(item.unitPrice ?? 0),
              totalPrice: Number(item.totalPrice ?? 0),
              status: item.status ?? orderStatus,
              orderStatus,
              createdAt: createdAt ?? item.createdAt,
              customerName: item.customerName ?? ord.customerName,
            });
          });
          if (items.length === 0) {
            flat.push({
              id: orderId,
              orderId,
              orderNumber,
              productName: '—',
              quantity: 0,
              unitPrice: 0,
              totalPrice: Number(ord.totalAmount ?? 0),
              status: orderStatus,
              orderStatus,
              createdAt: createdAt ?? '',
              customerName: ord.customerName,
            });
          }
        });
        setOrders(flat);
        setTotalPages(raw?.pagination?.totalPages ?? 1);
      }
    } catch (error: any) {
      console.error('Failed to load orders:', error);
      if (!silent) showToast('Failed to load orders', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  // Auth guard + initial load
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
    loadOrders();
  }, [isAuthenticated, user, filter, page, router]);

  // Auto-refresh when a new order arrives via socket
  useEffect(() => {
    if (!onNewOrder) return;
    mountedRef.current = true;
    const unsubscribe = onNewOrder(() => {
      if (mountedRef.current) loadOrders(true);
    });
    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [onNewOrder, loadOrders]);

  const handleUpdateStatus = async (orderItemId: string, status: string, reason?: string) => {
    try {
      await apiClient.patch(`/seller/orders/items/${orderItemId}/status`, { status, reason });
      showToast('Order status updated successfully', 'success');
      loadOrders(true);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update status', 'error');
    }
  };

  const handleReportFailure = async (orderItemId: string) => {
    const reason = window.prompt('What went wrong? (e.g. customer unreachable, wrong address, refused delivery)');
    if (!reason || !reason.trim()) return;
    await handleUpdateStatus(orderItemId, 'delivery_failed', reason.trim());
  };

  const getStatusConfig = (status: string) => {
    const statusMap: Record<string, { bg: string; text: string; dot: string }> = {
      pending: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
      confirmed: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
      preparing: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
      ready: { bg: 'bg-indigo-50', text: 'text-indigo-700', dot: 'bg-indigo-500' },
      dispatched: { bg: 'bg-pink-50', text: 'text-pink-700', dot: 'bg-pink-500' },
      in_transit: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
      delivered: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
      delivery_failed: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
      cancelled: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    };
    return statusMap[status] || { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' };
  };

  const filterTabs = [
    { id: 'all', label: 'All', color: 'bg-gray-900' },
    { id: 'pending', label: 'Pending', color: 'bg-amber-500' },
    { id: 'confirmed', label: 'Confirmed', color: 'bg-blue-500' },
    { id: 'preparing', label: 'Preparing', color: 'bg-purple-500' },
    { id: 'ready', label: 'Ready', color: 'bg-indigo-500' },
    { id: 'dispatched', label: 'Dispatched', color: 'bg-pink-500' },
    { id: 'delivered', label: 'Delivered', color: 'bg-emerald-500' },
    { id: 'cancelled', label: 'Cancelled', color: 'bg-red-500' },
  ];

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="My Orders"
      subtitle="Manage and track your orders"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto">

        {/* Filter Tabs - Enhanced */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-2 mb-6">
          <div className="flex gap-1 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilter(tab.id);
                  setPage(1);
                }}
                className={`px-4 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 flex items-center gap-2 ${
                  filter === tab.id
                    ? `${tab.color} text-white shadow-lg`
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading orders...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.package}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No orders found</h2>
            <p className="text-gray-500">No orders match your current filter</p>
          </div>
        ) : (
          <>
            {/* Orders Table - Enhanced */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Order #</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Qty</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.map((order) => {
                      // Note: in_transit is NOT terminal — a self-delivering seller still
                      // needs to mark it delivered (or report a failure) from there.
                      const TERMINAL_ORDER_STATUSES = ['cancelled', 'delivered', 'completed', 'refunded', 'delivery_failed'];
                      const parentStatus = order.orderStatus ?? 'pending';
                      const itemStatus = order.status ?? parentStatus;
                      const isTerminal = TERMINAL_ORDER_STATUSES.includes(parentStatus);
                      const status = isTerminal ? parentStatus : itemStatus;
                      const statusConfig = getStatusConfig(status);
                      const statusLabel = status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
                      return (
                        <tr key={order.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <Link href={`/sellers/orders/${order.orderId}`} className="text-emerald-600 hover:text-emerald-700 font-semibold">
                              #{order.orderNumber}
                            </Link>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900">{order.productName}</div>
                            {order.customerName && (
                              <div className="text-xs text-gray-500 mt-0.5">Customer: {order.customerName}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="text-sm font-medium text-gray-900 bg-gray-100 px-2 py-1 rounded-lg">{order.quantity}</span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">
                            {formatPrice(order.totalPrice)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${statusConfig.bg} ${statusConfig.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dot}`}></span>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(order.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isTerminal ? (
                              <span className="text-xs text-gray-400">—</span>
                            ) : (
                              <>
                                {itemStatus === 'pending' && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdateStatus(order.id, 'confirmed')}
                                      className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                                    >
                                      {Icons.check}
                                      <span className="ml-1">Accept</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleUpdateStatus(order.id, 'cancelled')}
                                      className="border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                      {Icons.x}
                                    </Button>
                                  </div>
                                )}
                                {itemStatus === 'confirmed' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(order.id, 'preparing')}
                                    className="bg-purple-500 hover:bg-purple-600 text-white shadow-sm"
                                  >
                                    {Icons.cooking}
                                    <span className="ml-1">Preparing</span>
                                  </Button>
                                )}
                                {itemStatus === 'preparing' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(order.id, 'ready')}
                                    className="bg-indigo-500 hover:bg-indigo-600 text-white shadow-sm"
                                  >
                                    {Icons.check}
                                    <span className="ml-1">Ready</span>
                                  </Button>
                                )}
                                {itemStatus === 'ready' && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleUpdateStatus(order.id, 'dispatched')}
                                    className="bg-pink-500 hover:bg-pink-600 text-white shadow-sm"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                                    </svg>
                                    <span className="ml-1">Dispatch</span>
                                  </Button>
                                )}
                                {/* Once a rider claims the delivery, the rider dashboard drives these
                                    transitions instead — these buttons are for self-delivery only, and
                                    are harmless no-ops (rejected by the backend) once a rider has taken over. */}
                                {itemStatus === 'dispatched' && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdateStatus(order.id, 'in_transit')}
                                      className="bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
                                    >
                                      In Transit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReportFailure(order.id)}
                                      className="border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                      Report Failed
                                    </Button>
                                  </div>
                                )}
                                {itemStatus === 'in_transit' && (
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => handleUpdateStatus(order.id, 'delivered')}
                                      className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                                    >
                                      {Icons.check}
                                      <span className="ml-1">Delivered</span>
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleReportFailure(order.id)}
                                      className="border-red-200 text-red-600 hover:bg-red-50"
                                    >
                                      Report Failed
                                    </Button>
                                  </div>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination - Enhanced */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-between bg-white rounded-xl p-4 border border-gray-100">
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Previous
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">Page</span>
                  <span className="bg-gray-100 px-3 py-1 rounded-lg text-sm font-semibold text-gray-900">{page}</span>
                  <span className="text-sm text-gray-500">of {totalPages}</span>
                </div>
                <Button
                  variant="outline"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-2"
                >
                  Next
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

