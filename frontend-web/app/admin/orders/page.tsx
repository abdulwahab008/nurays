'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, ReceiptText } from 'lucide-react';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';
import { methodLabel, paymentState, statusLabel, statusTag } from './order-labels';

interface AdminOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod?: string | null;
  customer: {
    email: string;
    phone?: string;
    profile?: { fullName?: string };
  };
  items?: Array<{ seller?: { businessName?: string } | null }>;
  createdAt: string;
}

// Delivery failed comes first: those orders wait for an admin to retry or cancel them.
const STATUS_FILTERS = ['all', 'delivery_failed', 'pending', 'confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'completed', 'cancelled'] as const;

const PAYMENT_FILTERS = [
  ['', 'Any payment'],
  ['disputed', 'Transfers the kitchen disputed'],
  ['payment_submitted', 'Receipts waiting for the kitchen'],
  ['refund_pending', 'Refund being sent'],
] as const;

const kitchenOf = (order: AdminOrder) => {
  const names = Array.from(new Set((order.items ?? []).map((i) => i.seller?.businessName).filter(Boolean)));
  return names.length ? names.join(', ') : null;
};

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={null}>
      <AdminOrdersContent />
    </Suspense>
  );
}

function AdminOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // The filters live in the address, so Back, reload and a shared link all keep the view.
  // `orderStatus` is the API's name for the same filter; links from the approvals queue use it.
  const filter = searchParams.get('status') ?? searchParams.get('orderStatus') ?? 'all';
  const sellerId = searchParams.get('sellerId') ?? '';
  const paymentFilter = searchParams.get('paymentStatus') ?? '';
  const query = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [loading, setLoading] = useState(true);
  // Why the orders could not be read; shown instead of "No orders found", which would be untrue.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState(query);
  const [kitchenName, setKitchenName] = useState<string | null>(null);
  // Only the newest request may fill the list: an older, slower one would show the previous filter's orders.
  const latest = useRef(0);

  const setView = (changes: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    if ('status' in changes) params.delete('orderStatus');
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '' || value === 'all' || (key === 'page' && value === 1)) params.delete(key);
      else params.set(key, String(value));
    }
    const qs = params.toString();
    router.replace(qs ? `/admin/orders?${qs}` : '/admin/orders', { scroll: false });
  };

  const loadOrders = useCallback(async () => {
    const request = ++latest.current;
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get('/admin/orders', {
        params: {
          page,
          limit: 20,
          orderStatus: filter !== 'all' ? filter : undefined,
          paymentStatus: paymentFilter || undefined,
          sellerId: sellerId || undefined,
          orderNumber: query || undefined,
        },
      });
      if (request !== latest.current) return;
      if (response.data.success) {
        setOrders(response.data.data.orders || []);
        setTotalPages(response.data.data.pagination?.totalPages || 1);
      }
    } catch (error) {
      if (request === latest.current) setLoadError(error);
    } finally {
      if (request === latest.current) setLoading(false);
    }
  }, [filter, paymentFilter, sellerId, query, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setKitchenName(null);
    if (!sellerId) return;
    let cancelled = false;
    apiClient
      .get(`/admin/sellers/${sellerId}`)
      .then((res) => {
        if (!cancelled) setKitchenName(res.data?.data?.businessName ?? null);
      })
      .catch(() => {
        // The orders still filter by the kitchen; only its name is missing from the chip.
      });
    return () => {
      cancelled = true;
    };
  }, [sellerId]);

  return (
    <AdminShell>
      <div className="max-w-7xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Orders</h1>
          <p className="text-sm text-muted mt-1">Every order on Nuray. Delivery failed orders need you to retry or cancel them.</p>
        </div>

        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setView({ q: search.trim(), page: 1 });
          }}
        >
          <label htmlFor="order-search" className="sr-only">Order number</label>
          <div className="min-w-0 flex-1 sm:flex-none sm:w-80">
          <input
            id="order-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Order number, e.g. FN2026…"
            className="nuray-input text-sm"
            inputMode="search"
          />
          </div>
          <Button type="submit" variant="outline">Find</Button>
          {query && (
            <Button type="button" variant="ghost" onClick={() => { setSearch(''); setView({ q: null, page: 1 }); }}>
              Clear
            </Button>
          )}
        </form>

        <div className="-mx-4 px-4 flex gap-2 overflow-x-auto no-scrollbar sm:mx-0 sm:px-0 sm:flex-wrap" aria-label="Order status">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={filter === status}
              onClick={() => setView({ status, page: 1 })}
              className={`shrink-0 min-h-11 px-4 rounded-full text-sm font-medium border transition-colors ${
                filter === status
                  ? 'border-ink bg-ink text-page'
                  : status === 'delivery_failed'
                    ? 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100'
                    : 'border-line bg-surface text-ink hover:bg-raised'
              }`}
            >
              {status === 'all' ? 'All' : statusLabel(status)}
            </button>
          ))}
        </div>

        {sellerId && (
          <div className="flex flex-wrap items-center gap-2" data-testid="kitchen-filter">
            <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-medium text-brand-soft-ink">
              {kitchenName ? `Kitchen: ${kitchenName}` : 'One kitchen'}
            </span>
            <Button type="button" variant="ghost" onClick={() => setView({ sellerId: null, page: 1 })}>
              Show every kitchen
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <label htmlFor="payment-filter" className="text-sm text-muted shrink-0">Payment</label>
          {/* .nuray-input is full width, so the box around it sets the size. */}
          <div className="min-w-0 flex-1 sm:flex-none sm:w-72">
            <select
              id="payment-filter"
              value={paymentFilter}
              onChange={(e) => setView({ paymentStatus: e.target.value, page: 1 })}
              className="nuray-input text-sm"
            >
              {PAYMENT_FILTERS.map(([value, label]) => (
                <option key={value || 'any'} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && orders.length === 0 ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-muted" role="status">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand-ink" aria-hidden="true" />
            Loading orders…
          </div>
        ) : loadError && orders.length === 0 ? (
          <LoadError error={loadError} onRetry={loadOrders} title="We couldn't load the orders" />
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-ink">
              <ReceiptText className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-sm text-muted">No orders match these filters.</p>
          </div>
        ) : (
          <>
            {/* Phones: one tappable card per order, three lines. */}
            <ul aria-busy={loading} className={`sm:hidden divide-y divide-line rounded-2xl border border-line bg-surface transition-opacity ${loading ? 'opacity-60' : ''}`} data-testid="admin-orders-cards">
              {orders.map((order) => {
                const payment = paymentState(order);
                const kitchen = kitchenOf(order) ?? kitchenName;
                return (
                  <li key={order.id}>
                    <Link href={`/admin/orders/${order.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-raised">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-ink break-all">#{order.orderNumber}</span>
                          <span className="text-sm font-semibold text-ink tabular-nums shrink-0">{formatPrice(order.totalAmount)}</span>
                        </div>
                        <p className="text-sm text-muted truncate">
                          {order.customer.profile?.fullName || order.customer.email}
                          {kitchen ? ` · ${kitchen}` : ''}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className={statusTag(order.orderStatus)}>{statusLabel(order.orderStatus)}</span>
                          <span className={payment.tag}>{payment.label}</span>
                          <span className="text-xs text-muted">{formatDateTime(order.createdAt)}</span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted shrink-0 rtl:rotate-180" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div aria-busy={loading} className={`hidden sm:block bg-surface border border-line rounded-2xl overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`}>
              <table className="w-full text-sm">
                <thead className="bg-raised">
                  <tr className="text-start text-xs font-medium text-muted">
                    <th className="px-4 py-3 text-start">Order</th>
                    <th className="px-4 py-3 text-start">Customer</th>
                    <th className="px-4 py-3 text-start">Kitchen</th>
                    <th className="px-4 py-3 text-start">Amount</th>
                    <th className="px-4 py-3 text-start">Status</th>
                    <th className="px-4 py-3 text-start">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {orders.map((order) => {
                    const payment = paymentState(order);
                    return (
                      <tr key={order.id} className="hover:bg-raised">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <Link href={`/admin/orders/${order.id}`} className="inline-flex min-h-11 items-center font-semibold text-brand-ink hover:underline">
                            #{order.orderNumber}
                          </Link>
                          <p className="text-xs text-muted">{formatDateTime(order.createdAt)}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-ink">{order.customer.profile?.fullName || order.customer.email}</p>
                          <p className="text-xs text-muted break-all">{order.customer.email}</p>
                        </td>
                        <td className="px-4 py-3 text-ink">{kitchenOf(order) ?? kitchenName ?? <span className="text-muted">Not known</span>}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-ink tabular-nums">{formatPrice(order.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={statusTag(order.orderStatus)}>{statusLabel(order.orderStatus)}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={payment.tag}>{payment.label}</span>
                          <p className="text-xs text-muted mt-1">{methodLabel(order.paymentMethod)}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" onClick={() => setView({ page: Math.max(1, page - 1) })} disabled={page <= 1}>
                  Previous
                </Button>
                <span className="text-sm text-muted">
                  Page {page} of {totalPages}
                </span>
                <Button variant="outline" onClick={() => setView({ page: Math.min(totalPages, page + 1) })} disabled={page >= totalPages}>
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </AdminShell>
  );
}
