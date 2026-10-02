'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';
import OrderChatModal from '@/components/orders/OrderChatModal';
import SelfHandoverActions from '@/components/orders/SelfHandoverActions';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages, paymentMethodLabel, paymentStatusLabel } from '@/lib/i18n/messages/kitchen-orders';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

// `label` is what the API receives (kept in English for support/admin); `key` is what the kitchen sees.
const REJECTION_REASONS = [
  { id: 'item_unavailable', label: 'Item unavailable', key: 'reason.item_unavailable' },
  { id: 'too_busy', label: 'Too busy / High kitchen load', key: 'reason.too_busy' },
  { id: 'unable_to_prepare', label: 'Unable to prepare in time', key: 'reason.unable_to_prepare' },
  { id: 'temporary_issue', label: 'Temporary kitchen or utility issue', key: 'reason.temporary_issue' },
  { id: 'other', label: 'Other reason', key: 'reason.other' },
] as const;

interface OrderProduct {
  id: string;
  name: string;
  slug?: string;
  preparationTime?: number;
  image?: string | null;
}

interface OrderItemEntry {
  id: string;
  product: OrderProduct | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: string;
}

interface OrderTicket {
  order: {
    id: string;
    orderNumber: string;
    orderStatus: string;
    paymentStatus: string;
    paymentMethod: string;
    totalAmount: number;
    createdAt: string;
    estimatedDeliveryAt?: string;
    deliveryInstructions?: string;
    notes?: string;
    cancellationReason?: string;
    paymentReferenceNumber?: string;
    paymentSenderName?: string;
    paymentSenderAccount?: string;
    paymentProofUrl?: string;
    paymentNotes?: string;
    paymentSubmittedAt?: string;
    deliveryType?: string;
    /** The kitchen hands this order over itself (self-delivery or customer pickup). */
    sellerHandsOver?: boolean;
    customerName?: string;
    customerPhone?: string;
    deliveryAddress?: {
      area?: string;
      city?: string;
      addressLine1?: string;
      label?: string;
    };
  };
  items: OrderItemEntry[];
}

export default function SellerOrdersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const [loading, setLoading] = useState(true);
  const [orderTickets, setOrderTickets] = useState<OrderTicket[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Reject Modal State
  const [rejectingOrder, setRejectingOrder] = useState<OrderTicket | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(REJECTION_REASONS[0].id);
  const [customReasonText, setCustomReasonText] = useState('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  // Chat with Customer Modal State
  const [chatTicket, setChatTicket] = useState<OrderTicket | null>(null);


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
        setOrderTickets(rawOrders);
        setTotalPages(raw?.pagination?.totalPages ?? 1);
      }
    } catch (error: any) {
      console.error('Failed to load orders:', error);
      if (!silent) showToast(t('list.loadFailed'), 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast, t]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    const role = user?.userType || user?.user_type;
    if (role !== 'seller' && role !== 'admin') {
      router.push('/dashboard');
      showToast(t('accessDenied'), 'error');
      return;
    }
    loadOrders();
  }, [isAuthenticated, user, filter, page, router, loadOrders]);

  // New orders, status and payment changes, and riders taking jobs arrive as live events;
  // a slow timer covers anything that sends none.
  useLiveRefresh(() => loadOrders(true), {
    events: ['order:new', 'order:status:update', 'order:item:status:update', 'delivery:assigned'],
    enabled: isAuthenticated,
  });

  // Sync when notifications modal accepts/rejects order
  useEffect(() => {
    const handleRemoteUpdate = () => loadOrders(true);
    window.addEventListener('seller-orders-updated', handleRemoteUpdate);
    return () => window.removeEventListener('seller-orders-updated', handleRemoteUpdate);
  }, [loadOrders]);


  const handleConfirmPayment = async (orderId: string, confirmed: boolean) => {
    try {
      setActionLoadingId(`pay-${orderId}`);
      const res = await apiClient.post(`/orders/${orderId}/confirm-payment`, {
        confirmed,
        disputeReason: confirmed ? undefined : 'Payment transfer not found in kitchen account',
      });
      if (res.data?.success) {
        showToast(
          confirmed
            ? t('list.paymentVerified')
            : t('list.paymentDisputed'),
          confirmed ? 'success' : 'info'
        );
        loadOrders(true);
      }
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('list.paymentUpdateFailed'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptOrder = async (orderId: string) => {
    try {
      setActionLoadingId(orderId);
      const res = await apiClient.post(`/seller/orders/${orderId}/accept`);
      if (res.data.success) {
        showToast(t('list.accepted'), 'success');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId, status: 'accepted' } }));
        }
        loadOrders(true);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('acceptFailed'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleMarkReady = async (orderId: string) => {
    try {
      setActionLoadingId(orderId);
      const res = await apiClient.post(`/seller/orders/${orderId}/ready`);
      if (res.data.success) {
        showToast(t('list.markedReady'), 'success');
        loadOrders(true);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('list.markReadyFailed'), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const openRejectModal = (ticket: OrderTicket) => {
    setRejectingOrder(ticket);
    setSelectedReason(REJECTION_REASONS[0].id);
    setCustomReasonText('');
  };

  const closeRejectModal = () => {
    setRejectingOrder(null);
    setSelectedReason(REJECTION_REASONS[0].id);
    setCustomReasonText('');
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;
    const targetOrderId = rejectingOrder.order.id;
    try {
      setIsSubmittingReject(true);
      const reasonObj = REJECTION_REASONS.find(r => r.id === selectedReason);
      const finalReason = selectedReason === 'other'
        ? (customReasonText.trim() || 'Other reason')
        : (reasonObj ? reasonObj.label : selectedReason) + (customReasonText.trim() ? `: ${customReasonText.trim()}` : '');

      const res = await apiClient.post(`/seller/orders/${targetOrderId}/reject`, {
        reason: finalReason,
      });
      if (res.data.success) {
        showToast(t('list.rejected'), 'info');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId: targetOrderId, status: 'rejected' } }));
        }
        closeRejectModal();
        loadOrders(true);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || t('rejectFailed'), 'error');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case 'pending':
        return { bg: 'bg-amber-100 text-amber-900 border-amber-300', dot: 'bg-amber-500', label: t('badge.pending') };
      case 'confirmed':
        return { bg: 'bg-blue-100 text-blue-900 border-blue-300', dot: 'bg-blue-500', label: t('badge.confirmed') };
      case 'preparing':
        return { bg: 'bg-purple-100 text-purple-900 border-purple-300', dot: 'bg-purple-500', label: t('badge.preparing') };
      case 'ready':
        return { bg: 'bg-indigo-100 text-indigo-900 border-indigo-300', dot: 'bg-indigo-500', label: t('badge.ready') };
      case 'dispatched':
      case 'in_transit':
        return { bg: 'bg-orange-100 text-orange-900 border-orange-300', dot: 'bg-orange-500', label: t('badge.onTheWay') };
      case 'delivered':
      case 'completed':
        return { bg: 'bg-emerald-100 text-emerald-900 border-emerald-300', dot: 'bg-emerald-500', label: t('badge.completed') };
      case 'cancelled':
        return { bg: 'bg-red-100 text-red-900 border-red-300', dot: 'bg-red-500', label: t('badge.cancelled') };
      default:
        return { bg: 'bg-gray-100 text-gray-800 border-gray-300', dot: 'bg-gray-500', label: status };
    }
  };

  const filterTabs = [
    { id: 'all', label: t('tab.all') },
    { id: 'pending', label: t('tab.pending') },
    { id: 'preparing', label: t('tab.preparing') },
    { id: 'ready', label: t('tab.ready') },
    { id: 'delivered', label: t('tab.delivered') },
    { id: 'cancelled', label: t('tab.cancelled') },
  ];

  if (!isAuthenticated) return null;

  return (
    <DashboardLayout
      title={t('list.title')}
      subtitle={t('list.subtitle')}
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Top Filter Bar */}
        <div className="bg-white rounded-2xl p-2 shadow-sm border border-gray-100 flex gap-2 flex-wrap items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {filterTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setFilter(tab.id);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  filter === tab.id
                    ? 'bg-gray-900 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadOrders(false)}
            className="text-xs text-gray-600 flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {t('list.refresh')}
          </Button>
        </div>

        {/* Orders Listing */}
        {loading ? (
          <div className="text-center py-20 bg-white rounded-3xl border border-gray-100">
            <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">{t('list.syncing')}</p>
          </div>
        ) : orderTickets.length === 0 ? (
          <div className="bg-white rounded-3xl p-16 text-center border border-gray-100 shadow-sm">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
              🍳
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-1">{t('list.emptyTitle')}</h3>
            <p className="text-gray-500 text-sm max-w-md mx-auto">
              {filter === 'all'
                ? t('list.emptyAll')
                : t('list.emptyFiltered', { filter: filterTabs.find((tab) => tab.id === filter)?.label ?? filter })}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {orderTickets.map((ticket) => {
              const ord = ticket.order;
              const items = ticket.items || [];
              const badge = getStatusBadge(ord.orderStatus);
              const isActionBusy = actionLoadingId === ord.id;
              const maxPrepTime = Math.max(
                ...items.map((i) => i.product?.preparationTime || 20),
                15
              );

              return (
                <div
                  key={ord.id}
                  id={`order-card-${ord.id}`}
                  className="bg-white rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
                >
                  {/* Ticket Header */}
                  <div>
                    <div className="p-5 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-lg text-gray-900 tracking-tight">
                            <Link href={`/sellers/orders/${ord.id}`} className="hover:underline">
                              {t('orderLabel')} <span data-ltr>#{ord.orderNumber || ord.id.slice(0, 8)}</span>
                            </Link>
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${badge.bg}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
                            {badge.label}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                          <span>🕒 {formatDate(ord.createdAt)}</span>
                          <span>•</span>
                          <span className="font-medium text-gray-700">{t('list.prep', { min: maxPrepTime })}</span>
                        </div>
                      </div>

                      <div className="text-end">
                        <span className="text-lg font-black text-emerald-600 block">
                          {formatPrice(ord.totalAmount)}
                        </span>
                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                          {paymentMethodLabel(ord.paymentMethod, tc)} • {paymentStatusLabel(ord.paymentStatus, t)}
                        </span>
                      </div>
                    </div>

                    {/* Customer & Location Context + Chat Button */}
                    <div className="px-5 py-3 bg-gray-50/70 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                          👤
                        </span>
                        <span className="font-semibold text-gray-900">{ord.customerName || t('customer')}</span>
                        {ord.customerPhone && (
                          <span className="text-gray-500" data-ltr>({ord.customerPhone})</span>
                        )}

                        {/* Two-Way Chat Button */}
                        <button
                          id={`chat-customer-btn-${ord.id}`}
                          onClick={() => setChatTicket(ticket)}
                          className="ms-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black transition-all shadow-xs"
                          title={t('list.chatTitle')}
                        >
                          <span>💬</span>
                          <span>{t('list.chat')}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 text-gray-700 font-medium">
                        <span className="text-emerald-600">📍</span>
                        <span>
                          {ord.deliveryAddress?.area || t('list.communityDelivery')}
                          {ord.deliveryAddress?.addressLine1 ? `, ${ord.deliveryAddress.addressLine1}` : ''}
                        </span>
                      </div>
                    </div>

                    {/* Customer Payment Proof Verification Card */}
                    {ord.paymentStatus === 'payment_submitted' && (
                      <div className="px-5 py-3.5 bg-amber-50/90 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="flex items-start gap-2.5">
                          <span className="text-xl">💸</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-amber-950">{t('list.proofTitle')}</span>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-200 text-amber-900">
                                {t('list.actionRequired')}
                              </span>
                            </div>
                            <p className="text-[11px] text-amber-800 mt-0.5">
                              {t('list.method')} <strong className="text-amber-950 font-bold">{ord.paymentSenderAccount || ord.paymentMethod || t('list.directWallet')}</strong>
                              {ord.paymentReferenceNumber && ` • ${t('list.ref', { ref: ord.paymentReferenceNumber })}`}
                            </p>
                            {ord.paymentProofUrl && (
                              <a
                                href={ord.paymentProofUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-emerald-700 hover:underline font-bold text-[11px] inline-flex items-center gap-1 mt-1"
                              >
                                <span>{t('list.viewScreenshot')}</span>
                              </a>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            id={`verify-payment-btn-${ord.id}`}
                            onClick={() => handleConfirmPayment(ord.id, true)}
                            disabled={actionLoadingId === `pay-${ord.id}`}
                            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1"
                          >
                            <span>✓</span>
                            <span>{t('list.confirmPaid')}</span>
                          </button>
                          <button
                            id={`dispute-payment-btn-${ord.id}`}
                            onClick={() => handleConfirmPayment(ord.id, false)}
                            disabled={actionLoadingId === `pay-${ord.id}`}
                            className="px-3 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-bold text-xs rounded-xl transition-all"
                          >
                            <span>{t('list.dispute')}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Special Delivery Instructions / Notes */}
                    {(ord.deliveryInstructions || ord.notes) && (
                      <div className="px-5 py-2.5 bg-amber-50/70 border-b border-amber-100 text-xs text-amber-900 flex items-start gap-2">
                        <span className="font-bold">{t('list.note')}</span>
                        <span>{ord.deliveryInstructions || ord.notes}</span>
                      </div>
                    )}

                    {/* Rejection / Cancellation Banner */}
                    {ord.orderStatus === 'cancelled' && ord.cancellationReason && (
                      <div className="px-5 py-2.5 bg-red-50 border-b border-red-100 text-xs text-red-800 flex items-start gap-2">
                        <span className="font-bold">{t('list.reason')}</span>
                        <span>{ord.cancellationReason}</span>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="p-5 divide-y divide-gray-100">
                      {items.map((item) => (
                        <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center flex-shrink-0 text-sm">
                              {item.product?.image ? (
                                <img
                                  src={item.product.image}
                                  alt={item.product.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                '🍔'
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-gray-900">
                                {item.quantity} × {item.product?.name || t('list.foodItem')}
                              </p>
                              <p className="text-xs text-gray-500">
                                {t('list.itemPrep', { min: item.product?.preparationTime || 15, price: formatPrice(item.unitPrice) })}
                              </p>
                            </div>
                          </div>
                          <span className="font-semibold text-sm text-gray-900">
                            {formatPrice(item.totalPrice)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Kitchen Status Card & Operational Actions */}
                  <div className="p-5 bg-gray-50/50 border-t border-gray-100">
                    {/* State: Pending */}
                    {ord.orderStatus === 'pending' && (
                      <div className="space-y-3">
                        <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                          <span className="font-medium">{t('list.awaiting')}</span>
                          <span className="font-bold">{t('list.estPrep', { min: maxPrepTime })}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            id={`accept-order-btn-${ord.id}`}
                            onClick={() => handleAcceptOrder(ord.id)}
                            disabled={isActionBusy}
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-2xl shadow-md flex items-center justify-center gap-2"
                          >
                            {isActionBusy ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <span>✓</span>
                            )}
                            {t('list.acceptStart')}
                          </Button>

                          <Button
                            id={`reject-order-btn-${ord.id}`}
                            variant="outline"
                            onClick={() => openRejectModal(ticket)}
                            disabled={isActionBusy}
                            className="border-red-200 text-red-600 hover:bg-red-50 font-bold px-4 py-3 rounded-2xl"
                          >
                            {t('reject')}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* State: Preparing */}
                    {ord.orderStatus === 'preparing' && (
                      <div className="space-y-3">
                        <div className="p-3.5 bg-purple-50 rounded-2xl border border-purple-200 text-xs text-purple-900 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="animate-pulse text-base">👨‍🍳</span>
                            <span className="font-semibold">{t('list.cooking')}</span>
                          </div>
                          <span className="font-extrabold bg-purple-200/80 px-2.5 py-1 rounded-lg">
                            {t('list.target', { min: maxPrepTime })}
                          </span>
                        </div>

                        <Button
                          id={`ready-pickup-btn-${ord.id}`}
                          onClick={() => handleMarkReady(ord.id)}
                          disabled={isActionBusy}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-2xl shadow-md flex items-center justify-center gap-2"
                        >
                          {isActionBusy ? (
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <span className="text-base">🛎️</span>
                          )}
                          {t('list.markReady')}
                        </Button>
                      </div>
                    )}

                    {/* Self-delivery / pickup: the kitchen completes the handover itself */}
                    {ord.sellerHandsOver && ['ready', 'dispatched', 'in_transit'].includes(ord.orderStatus) && (
                      <SelfHandoverActions
                        orderId={ord.id}
                        orderStatus={ord.orderStatus}
                        deliveryType={ord.deliveryType}
                        onChanged={() => loadOrders(true)}
                      />
                    )}

                    {/* State: Ready (a Nuray rider is coming) */}
                    {ord.orderStatus === 'ready' && !ord.sellerHandsOver && (
                      <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-200 text-center">
                        <p className="text-sm font-bold text-indigo-900 mb-1 flex items-center justify-center gap-2">
                          <span>📦</span> {t('list.readyCounter')}
                        </p>
                        <p className="text-xs text-indigo-700">
                          {t('list.riderAssigned')}
                        </p>
                      </div>
                    )}

                    {/* State: Dispatched or In Transit (with a Nuray rider) */}
                    {(ord.orderStatus === 'dispatched' || ord.orderStatus === 'in_transit') && !ord.sellerHandsOver && (
                      <div className="p-4 bg-orange-50 rounded-2xl border border-orange-200 text-center">
                        <p className="text-sm font-bold text-orange-900 mb-1 flex items-center justify-center gap-2">
                          <span>🛵</span> {t('list.riderOnWay')}
                        </p>
                        <p className="text-xs text-orange-700">
                          {t('list.enRoute')}
                        </p>
                      </div>
                    )}

                    {/* State: Delivered / Completed */}
                    {(ord.orderStatus === 'delivered' || ord.orderStatus === 'completed') && (
                      <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-bold text-emerald-900">{t('list.deliveredTitle')}</p>
                          <p className="text-xs text-emerald-700">{t('list.settlement')}</p>
                        </div>
                        <span className="text-emerald-700 font-extrabold text-sm">{t('list.completedCheck')}</span>
                      </div>
                    )}

                    {/* State: Cancelled */}
                    {ord.orderStatus === 'cancelled' && (
                      <div className="p-3.5 bg-red-50 rounded-2xl border border-red-200 text-center">
                        <p className="text-xs font-bold text-red-900">{t('list.closed')}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              size="sm"
            >
              {t('list.previous')}
            </Button>
            <span className="text-xs font-semibold text-gray-600">
              {t('list.pageOf', { page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              size="sm"
            >
              {tc('next')}
            </Button>
          </div>
        )}

        {/* Reject Reason Modal */}
        {rejectingOrder && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div
              id="reject-order-modal"
              className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-gray-100 animate-in fade-in zoom-in duration-200 space-y-5"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{t('list.rejectTitle')} <span data-ltr>#{rejectingOrder.order.orderNumber}</span></h3>
                  <p className="text-xs text-gray-500 mt-0.5">{t('list.rejectHint')}</p>
                </div>
                <button
                  onClick={closeRejectModal}
                  aria-label={tc('close')}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Reasons List */}
              <div className="space-y-2.5">
                {REJECTION_REASONS.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      selectedReason === r.id
                        ? 'border-red-500 bg-red-50/50 text-red-900 font-semibold'
                        : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rejectReason"
                      value={r.id}
                      checked={selectedReason === r.id}
                      onChange={() => setSelectedReason(r.id)}
                      className="text-red-600 focus:ring-red-500 h-4 w-4"
                    />
                    <span className="text-sm">{t(r.key)}</span>
                  </label>
                ))}
              </div>

              {/* Optional Custom Note */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  {t('list.additionalNote')}
                </label>
                <textarea
                  value={customReasonText}
                  onChange={(e) => setCustomReasonText(e.target.value)}
                  placeholder={t('list.notePlaceholder')}
                  rows={2}
                  className="w-full text-xs p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  id="confirm-reject-btn"
                  onClick={handleConfirmReject}
                  disabled={isSubmittingReject}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-md"
                >
                  {isSubmittingReject ? t('list.rejecting') : t('list.confirmReject')}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeRejectModal}
                  disabled={isSubmittingReject}
                  className="py-3 px-5 rounded-xl border-gray-300"
                >
                  {tc('back')}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Live Customer Chat Modal */}
        {chatTicket && (
          <OrderChatModal
            orderId={chatTicket.order.id}
            orderNumber={chatTicket.order.orderNumber}
            customerName={chatTicket.order.customerName}
            sellerName={t('list.yourKitchen')}
            currentRole="seller"
            isOpen={!!chatTicket}
            onClose={() => setChatTicket(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
