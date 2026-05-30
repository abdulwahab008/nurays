'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';

interface OrderDetail {
  id: string;
  orderNumber: string;
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  deliveryType: string;
  createdAt: string;
  estimatedDeliveryAt?: string;
  deliveredAt?: string;
  deliveryAddress?: { addressLine1: string; area: string; city: string };
  customer?: { id: string; email?: string; phone?: string; profile?: { fullName?: string } };
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    seller?: { businessName: string };
  }>;
  statusHistory?: Array<{ status: string; notes?: string; createdAt: string }>;
}

export default function AdminOrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [updating, setUpdating] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string>('');

  const updateStatus = async () => {
    if (!order || !selectedStatus || selectedStatus === order.orderStatus) return;
    try {
      setUpdating(true);
      await apiClient.patch(`/admin/orders/${order.id}/status`, { status: selectedStatus });
      showToast('Order status updated', 'success');
      loadOrder();
      setSelectedStatus('');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update status', 'error');
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }
    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }
    if (id) loadOrder();
  }, [isAuthenticated, user, id, router]);

  const loadOrder = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/orders/${id}`);
      if (response.data.success) {
        setOrder(response.data.data);
      } else {
        setOrder(null);
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        showToast('Order not found', 'error');
      } else {
        showToast('Failed to load order', 'error');
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      confirmed: 'bg-blue-100 text-blue-800',
      preparing: 'bg-purple-100 text-purple-800',
      ready: 'bg-indigo-100 text-indigo-800',
      in_transit: 'bg-orange-100 text-orange-800',
      delivered: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/orders"
            className="text-green-600 hover:text-green-700 text-sm font-medium inline-block"
          >
            ← Back to Orders
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading order...</p>
          </div>
        ) : !order ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Order not found</h3>
            <Link href="/admin/orders">
              <Button variant="outline">Back to Orders</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-200">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900">Order #{order.orderNumber}</h1>
                    <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(order.orderStatus)}`}>
                      {order.orderStatus.replace('_', ' ')}
                    </span>
                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                      order.paymentStatus === 'paid' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {order.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-6 space-y-6">
                {order.customer && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Customer</h2>
                    <p className="text-gray-900">{order.customer.profile?.fullName || '—'}</p>
                    <p className="text-gray-600 text-sm">{order.customer.email || order.customer.phone}</p>
                  </div>
                )}

                {order.deliveryAddress && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Delivery Address</h2>
                    <p className="text-gray-700">
                      {order.deliveryAddress.addressLine1}, {order.deliveryAddress.area}, {order.deliveryAddress.city}
                    </p>
                  </div>
                )}

                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Items</h2>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Product</th>
                          <th className="px-4 py-2 text-left font-medium text-gray-600">Seller</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Qty</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Price</th>
                          <th className="px-4 py-2 text-right font-medium text-gray-600">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {order.items.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 font-medium text-gray-900">{item.productName}</td>
                            <td className="px-4 py-3 text-gray-600">{item.seller?.businessName || '—'}</td>
                            <td className="px-4 py-3 text-right">{item.quantity}</td>
                            <td className="px-4 py-3 text-right">{formatPrice(item.unitPrice)}</td>
                            <td className="px-4 py-3 text-right font-medium">{formatPrice(item.totalPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-1 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal</span>
                    <span>{formatPrice(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Delivery</span>
                      <span>{formatPrice(order.deliveryFee)}</span>
                    </div>
                  )}
                  {order.discountAmount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Discount</span>
                      <span>-{formatPrice(order.discountAmount)}</span>
                    </div>
                  )}
                  {order.taxAmount > 0 && (
                    <div className="flex justify-between text-gray-600">
                      <span>Tax</span>
                      <span>{formatPrice(order.taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-lg text-gray-900 pt-2">
                    <span>Total</span>
                    <span>{formatPrice(order.totalAmount)}</span>
                  </div>
                </div>

                {/* Status Update */}
                {!['delivered', 'completed', 'cancelled', 'refunded'].includes(order.orderStatus) && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Update Status</h2>
                    <div className="flex gap-3 flex-wrap">
                      {[
                        { value: 'confirmed', label: 'Confirmed', color: 'bg-blue-500 hover:bg-blue-600' },
                        { value: 'preparing', label: 'Preparing', color: 'bg-purple-500 hover:bg-purple-600' },
                        { value: 'ready', label: 'Ready', color: 'bg-indigo-500 hover:bg-indigo-600' },
                        { value: 'dispatched', label: 'Dispatched', color: 'bg-pink-500 hover:bg-pink-600' },
                        { value: 'in_transit', label: 'In Transit', color: 'bg-orange-500 hover:bg-orange-600' },
                        { value: 'delivered', label: 'Delivered', color: 'bg-green-500 hover:bg-green-600' },
                        { value: 'cancelled', label: 'Cancel', color: 'bg-red-500 hover:bg-red-600' },
                      ]
                        .filter((s) => s.value !== order.orderStatus)
                        .map((s) => (
                          <button
                            key={s.value}
                            onClick={() => setSelectedStatus((prev) => (prev === s.value ? '' : s.value))}
                            className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-all ${
                              selectedStatus === s.value
                                ? s.color + ' ring-2 ring-offset-2 ring-gray-400 scale-105'
                                : s.color + ' opacity-80'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                    </div>
                    {selectedStatus && (
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-sm text-gray-600">
                          Change status to <strong>{selectedStatus.replace('_', ' ')}</strong>?
                        </span>
                        <button
                          onClick={updateStatus}
                          disabled={updating}
                          className="px-4 py-1.5 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50"
                        >
                          {updating ? 'Updating...' : 'Confirm'}
                        </button>
                        <button
                          onClick={() => setSelectedStatus('')}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {order.statusHistory && order.statusHistory.length > 0 && (
                  <div>
                    <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Status History</h2>
                    <ul className="space-y-2 text-sm text-gray-600">
                      {order.statusHistory.map((h, i) => (
                        <li key={i}>
                          <span className="font-medium text-gray-700">{h.status}</span>
                          {h.notes && ` — ${h.notes}`}
                          <span className="text-gray-400 ml-2">{formatDate(h.createdAt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
