'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { orderService, Order } from '@/lib/services/order.service';
import { formatPrice, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/store/auth-store';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { useSocket } from '@/lib/hooks/use-socket';
import { useToast } from '@/components/ui/toast';
import { Dot, ArrowRight, RotateCcw } from 'lucide-react';

// SVG icons (no emojis)
const Icons = {
  list: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
    </svg>
  ),
  clock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  check: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  ),
  preparing: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
    </svg>
  ),
  package: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  truck: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1h9M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4-4v.5m0-3V6m0 3v.5" />
    </svg>
  ),
  checkCircle: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  x: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  calendar: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  ),
  box: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  ),
  cart: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
};

export default function OrdersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const { onOrderStatusUpdate } = useSocket();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const handleReorder = async (orderId: string) => {
    setReorderingId(orderId);
    try {
      const res = await orderService.reorder(orderId);
      showToast(res.message || 'Added to cart', 'success');
      if (res.data?.added?.length) router.push('/cart');
    } catch {
      showToast('Could not reorder', 'error');
    } finally {
      setReorderingId(null);
    }
  };

  const sidebarItems = [
    { name: 'Dashboard', href: '/dashboard', icon: '' },
    { name: 'Browse Products', href: '/products', icon: '' },
    { name: 'My Orders', href: '/orders', icon: '' },
    { name: 'My Cart', href: '/cart', icon: '' },
    { name: 'My Profile', href: '/profile', icon: '' },
    { name: 'Addresses', href: '/profile/addresses', icon: '' },
    { name: 'Help & Support', href: '/support', icon: '' },
  ];

  const filterOptions = [
    { value: 'all', label: 'All Orders', icon: Icons.list, color: 'gray' },
    { value: 'pending', label: 'Pending', icon: Icons.clock, color: 'yellow' },
    { value: 'confirmed', label: 'Confirmed', icon: Icons.check, color: 'blue' },
    { value: 'preparing', label: 'Preparing', icon: Icons.preparing, color: 'purple' },
    { value: 'ready', label: 'Ready', icon: Icons.package, color: 'indigo' },
    { value: 'in_transit', label: 'In Transit', icon: Icons.truck, color: 'orange' },
    { value: 'delivered', label: 'Delivered', icon: Icons.checkCircle, color: 'green' },
    { value: 'cancelled', label: 'Cancelled', icon: Icons.x, color: 'red' },
  ];

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    loadOrders();
  }, [isAuthenticated]);

  // Live status updates via socket — no page refresh needed
  useEffect(() => {
    if (!onOrderStatusUpdate) return;
    mountedRef.current = true;
    const unsubscribe = onOrderStatusUpdate((data: any) => {
      if (!mountedRef.current) return;
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
      }
    });
    return () => {
      mountedRef.current = false;
      unsubscribe?.();
    };
  }, [onOrderStatusUpdate, showToast]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const response = await orderService.getMyOrders({});
      const data = (response as any)?.data ?? response;
      setOrders(data?.orders ?? []);
    } catch (error) {
      console.error('Failed to load orders:', error);
    } finally {
      setLoading(false);
    }
  };

  // Derive effective status — if backend still says 'pending' but every item is cancelled,
  // treat the order as cancelled (mirrors the detail-page effectiveStatus logic).
  const getOrderStatus = (o: Order | any): string => {
    const raw = (o?.orderStatus ?? o?.status ?? '') as string;
    if (raw === 'pending') {
      const items: any[] = o?.items ?? [];
      if (items.length > 0 && items.every((item: any) => item.status === 'cancelled')) {
        return 'cancelled';
      }
    }
    return raw;
  };
  const filteredOrders = filter === 'all'
    ? orders
    : orders.filter((o) => getOrderStatus(o) === filter);

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      confirmed: 'bg-blue-100 text-blue-800 border-blue-200',
      preparing: 'bg-purple-100 text-purple-800 border-purple-200',
      ready: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      dispatched: 'bg-pink-100 text-pink-800 border-pink-200',
      in_transit: 'bg-orange-100 text-orange-800 border-orange-200',
      delivered: 'bg-green-100 text-green-800 border-green-200',
      completed: 'bg-green-100 text-green-800 border-green-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusIcon = (status: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      pending: Icons.clock,
      confirmed: Icons.check,
      preparing: Icons.preparing,
      ready: Icons.package,
      dispatched: Icons.truck,
      in_transit: Icons.truck,
      delivered: Icons.checkCircle,
      completed: Icons.checkCircle,
      cancelled: Icons.x,
    };
    return iconMap[status] ?? Icons.list;
  };

  return (
    <DashboardLayout
      title="My Orders"
      subtitle={`Track and manage all your orders`}
      sidebarItems={sidebarItems}
      userType="customer"
    >
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <div className="text-2xl font-bold text-gray-900">{orders.length}</div>
          <div className="text-sm text-gray-500">Total Orders</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-yellow-100">
          <div className="text-2xl font-bold text-yellow-600">
            {orders.filter(o => ['pending', 'confirmed', 'preparing', 'ready'].includes(getOrderStatus(o))).length}
          </div>
          <div className="text-sm text-gray-500">In Progress</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-orange-100">
          <div className="text-2xl font-bold text-orange-600">
            {orders.filter(o => ['in_transit', 'dispatched'].includes(getOrderStatus(o))).length}
          </div>
          <div className="text-sm text-gray-500">On the Way</div>
        </div>
        <div className="bg-white rounded-xl p-4 border border-green-100">
          <div className="text-2xl font-bold text-green-600">
            {orders.filter(o => ['delivered', 'completed'].includes(getOrderStatus(o))).length}
          </div>
          <div className="text-sm text-gray-500">Delivered</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
        <div className="p-4 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all ${
                  filter === option.value
                    ? 'bg-green-600 text-white shadow-md'
                    : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span className="flex-shrink-0">{option.icon}</span>
                <span>{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your orders...</p>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm p-12 text-center border border-gray-100">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
            {Icons.package}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {filter === 'all' ? 'No orders yet' : `No ${filter.replace(/_/g, ' ')} orders`}
          </h2>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            {filter === 'all'
              ? 'Start shopping and your orders will appear here!'
              : `You don't have any orders with "${filter.replace(/_/g, ' ')}" status`
            }
          </p>
          <Link href="/products">
            <Button className="bg-green-600 hover:bg-green-700">
              <span className="mr-2">{Icons.cart}</span> Browse Products
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredOrders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block group"
            >
              <div className="bg-white rounded-2xl shadow-sm p-4 md:p-6 border border-gray-100 hover:border-green-200 hover:shadow-md transition-all overflow-hidden">
                <div className="flex items-center justify-between gap-3">
                  {/* Left Side - Order Info */}
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {(() => {
                      const orderStatus = getOrderStatus(order);
                      const itemCount = (order as any).items?.length ?? (order as any).itemsCount ?? 0;
                      const items = (order as any).items ?? [];
                      return (
                        <>
                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center ${getStatusColor(orderStatus)} border flex-shrink-0 text-current`}>
                      {getStatusIcon(orderStatus)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-base md:text-lg font-bold text-gray-900 truncate">
                          Order #{order.orderNumber}
                        </h3>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(orderStatus)} border flex-shrink-0`}>
                          {(orderStatus as string).replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 flex-wrap">
                        <span className="flex items-center gap-1">
                          {Icons.calendar}
                          {formatDate(order.createdAt)}
                        </span>
                        <Dot className="w-4 h-4 text-gray-400" />
                        <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                        <Dot className="w-4 h-4 text-gray-400" />
                        <span className={order.paymentStatus === 'paid' ? 'text-green-600' : 'text-amber-600'} title="Payment status">
                          {order.paymentStatus === 'paid' ? 'Payment: Paid' : `Payment: ${(order.paymentStatus ?? 'pending').replace(/_/g, ' ')}`}
                        </span>
                      </div>
                      {items.length > 0 && (
                        <div className="mt-3 flex items-center gap-2">
                          <div className="flex -space-x-2">
                            {items.slice(0, 3).map((item: any, idx: number) => (
                              <div
                                key={item?.id ?? idx}
                                className="w-8 h-8 rounded-lg bg-gray-100 border-2 border-white flex items-center justify-center text-gray-500"
                              >
                                {Icons.box}
                              </div>
                            ))}
                            {items.length > 3 && (
                              <div className="w-8 h-8 rounded-lg bg-gray-200 border-2 border-white flex items-center justify-center text-xs font-medium text-gray-600">
                                +{items.length - 3}
                              </div>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 truncate max-w-[160px] md:max-w-xs">
                            {items.slice(0, 2).map((i: any) => i.productName).join(', ')}
                            {items.length > 2 && ` +${items.length - 2} more`}
                          </span>
                        </div>
                      )}
                    </div>
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Right Side - Amount */}
                  <div className="text-right flex-shrink-0 pl-2">
                    <p className="text-lg md:text-2xl font-bold text-green-600 whitespace-nowrap">
                      {formatPrice(order.totalAmount)}
                    </p>
                    <p className="text-xs md:text-sm text-gray-400 group-hover:text-green-600 transition-colors mt-1 whitespace-nowrap inline-flex items-center gap-1 justify-end">
                      View Details <ArrowRight className="w-3.5 h-3.5" />
                    </p>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReorder(order.id); }}
                      disabled={reorderingId === order.id}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-forest-600 hover:text-forest-700 disabled:opacity-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> {reorderingId === order.id ? 'Adding…' : 'Reorder'}
                    </button>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}

