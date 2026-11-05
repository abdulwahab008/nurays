'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, MessageCircle, RefreshCw, X } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatDateTime } from '@/lib/utils';
import OrderChatModal from '@/components/orders/OrderChatModal';
import SelfHandoverActions from '@/components/orders/SelfHandoverActions';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages, kitchenStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@/lib/i18n/messages/kitchen-orders';
import { ExternalLink } from '@/components/ExternalLink';
import { useShallow } from 'zustand/react/shallow';

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
    customerPhone?: string | null;
    /** Why the phone and door are not shown (PRIV-4), or null when they are. */
    contactHidden?: 'nuray_rider' | 'not_accepted' | 'closed' | null;
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
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const [loading, setLoading] = useState(true);
  // Why the orders could not be read; shown instead of "No orders yet", which a kitchen with orders waiting must never be told.
  const [loadError, setLoadError] = useState<unknown>(null);
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
  // Kept current for loadOrders, which is stable; declared before the effects that load, so it runs first.
  useEffect(() => {
    filterRef.current = filter;
    pageRef.current = page;
  }, [filter, page]);

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
      setLoadError(null);
    } catch (error) {
      console.error('Failed to load orders:', error);
      // A refresh that fails keeps the orders on the screen (and says they may be out of date); a first or chosen load that
      // fails shows the failure, not the orders of the tab before.
      if (!silent) setOrderTickets([]);
      setLoadError(error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
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
    } catch (err) {
      showToast(apiErrorMessage(err, t('list.paymentUpdateFailed')), 'error');
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
    } catch (error) {
      showToast(apiErrorMessage(error, t('acceptFailed')), 'error');
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
    } catch (error) {
      showToast(apiErrorMessage(error, t('list.markReadyFailed')), 'error');
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
    } catch (error) {
      showToast(apiErrorMessage(error, t('rejectFailed')), 'error');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  const statusTone = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-accent-soft text-accent-soft-ink';
      case 'preparing':
        return 'bg-raised text-ink';
      case 'ready':
      case 'delivered':
      case 'completed':
        return 'bg-brand-soft text-brand-soft-ink';
      case 'cancelled':
        return 'bg-red-50 text-red-700';
      default:
        return 'bg-raised text-muted';
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
      <div className="max-w-6xl">
        <div className="mb-6 flex flex-col-reverse sm:flex-row sm:items-end sm:gap-4 sm:border-b sm:border-line">
          <div role="tablist" aria-label={t('list.title')} className="flex-1 min-w-0 flex gap-x-3.5 sm:gap-x-6 overflow-x-auto [scrollbar-width:none] border-b border-line sm:border-b-0">
            {filterTabs.map((tab) => {
              const selected = filter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => {
                    setFilter(tab.id);
                    setPage(1);
                  }}
                  className={`-mb-px min-h-11 pb-1 text-sm sm:text-[15px] whitespace-nowrap border-b-2 rounded-t transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-brand/40 ${
                    selected ? 'border-brand-600 text-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => loadOrders(false)}
            aria-label={t('list.refresh')}
            className="self-end shrink-0 -mt-3 sm:mt-0 sm:mb-1 -me-2 sm:me-0 inline-flex items-center gap-1.5 min-h-11 px-2 rounded-lg text-sm font-medium text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            {t('list.refresh')}
          </button>
        </div>

        {Boolean(loadError) && orderTickets.length > 0 && (
          <LoadError compact error={loadError} onRetry={() => void loadOrders()} title={t('list.loadFailed')} className="mb-4" />
        )}
        {loading ? (
          <div className="py-24 text-center" role="status">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
            <p className="text-sm text-muted">{t('list.syncing')}</p>
          </div>
        ) : loadError && orderTickets.length === 0 ? (
          <LoadError error={loadError} onRetry={() => void loadOrders()} title={t('list.loadFailed')} />
        ) : orderTickets.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            {filter === 'all'
              ? t('list.emptyAll')
              : t('list.emptyFiltered', { filter: filterTabs.find((tab) => tab.id === filter)?.label ?? filter })}
          </p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
            {orderTickets.map((ticket) => {
              const ord = ticket.order;
              const items = ticket.items || [];
              const isActionBusy = actionLoadingId === ord.id;
              const isNew = ord.orderStatus === 'pending';
              const maxPrepTime = Math.max(
                ...items.map((i) => i.product?.preparationTime || 20),
                15
              );
              const area = [ord.deliveryAddress?.area || t('list.communityDelivery'), ord.deliveryAddress?.addressLine1].filter(Boolean).join(', ');

              return (
                <article
                  key={ord.id}
                  id={`order-card-${ord.id}`}
                  className={`rounded-[20px] bg-surface border overflow-hidden pb-5 ${
                    isNew ? 'border-line shadow-[var(--shadow-card)]' : 'border-line'
                  }`}
                >
                  <header className="px-5 pt-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <Link href={`/sellers/orders/${ord.id}`} className="min-w-0 text-[15px] font-semibold text-ink hover:underline">
                        {t('orderLabel')} <span data-ltr className="break-all">#{ord.orderNumber || ord.id.slice(0, 8)}</span>
                      </Link>
                      <p className="shrink-0 text-lg font-semibold text-ink tabular-nums">{formatPrice(ord.totalAmount)}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusTone(ord.orderStatus)}`}>{kitchenStatusLabel(ord.orderStatus, t, tc)}</span>
                      <span>{formatDateTime(ord.createdAt)}</span>
                      {['pending', 'confirmed', 'preparing'].includes(ord.orderStatus) && (
                        <span className="text-ink">{t('list.prep', { min: maxPrepTime })}</span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {paymentMethodLabel(ord.paymentMethod, tc)}, {paymentStatusLabel(ord.paymentStatus, t)}
                    </p>
                  </header>

                  <ul className="px-5 mt-4 space-y-1.5">
                    {items.map((item) => (
                      <li key={item.id} className="flex items-baseline justify-between gap-4 text-[15px]">
                        <span className="text-ink">
                          <span className="font-semibold tabular-nums">{item.quantity} ×</span> {item.product?.name || t('list.foodItem')}
                        </span>
                        <span className="text-sm text-muted tabular-nums shrink-0">{formatPrice(item.totalPrice)}</span>
                      </li>
                    ))}
                  </ul>

                  {(ord.deliveryInstructions || ord.notes) && (
                    <p className="mx-5 mt-3 rounded-lg bg-raised px-3 py-2 text-sm text-ink">
                      <span className="text-muted">{t('list.note')} </span>
                      {ord.deliveryInstructions || ord.notes}
                    </p>
                  )}

                  {ord.orderStatus === 'cancelled' && ord.cancellationReason && (
                    <p className="mx-5 mt-3 text-sm text-red-700">
                      {t('list.reason')} {ord.cancellationReason}
                    </p>
                  )}

                  <div className="px-5 mt-4 pt-4 border-t border-line text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-ink">
                          {ord.customerName || t('customer')}
                          {ord.customerPhone && <span className="text-muted ms-1.5" data-ltr>{ord.customerPhone}</span>}
                        </p>
                        <p className="text-muted">{area}</p>
                      </div>
                      <button
                        type="button"
                        id={`chat-customer-btn-${ord.id}`}
                        onClick={() => setChatTicket(ticket)}
                        title={t('list.chatTitle')}
                        className="shrink-0 -mt-2.5 inline-flex items-center gap-1.5 min-h-11 px-3 -me-3 rounded-lg font-semibold text-brand-ink hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden="true" />
                        {t('list.chat')}
                      </button>
                    </div>
                    {ord.contactHidden && (
                      <p className="mt-1 text-xs text-muted" data-testid="contact-hidden">{t(`contact.${ord.contactHidden}`)}</p>
                    )}
                  </div>

                  {ord.paymentStatus === 'payment_submitted' && (
                    <div className="mx-5 mt-4 rounded-xl bg-accent-soft text-accent-soft-ink p-3.5 text-sm">
                      <p className="font-semibold">{t('list.proofTitle')}</p>
                      <p className="mt-0.5">
                        {t('list.method')} {ord.paymentSenderAccount || ord.paymentMethod || t('list.directWallet')}
                        {ord.paymentReferenceNumber && <>, <span data-ltr>{t('list.ref', { ref: ord.paymentReferenceNumber })}</span></>}
                      </p>
                      {ord.paymentProofUrl && (
                        <ExternalLink href={ord.paymentProofUrl} className="inline-block mt-1 font-semibold underline underline-offset-2">
                          {t('list.viewScreenshot')}
                        </ExternalLink>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="px-4"
                          id={`verify-payment-btn-${ord.id}`}
                          onClick={() => handleConfirmPayment(ord.id, true)}
                          disabled={actionLoadingId === `pay-${ord.id}`}
                        >
                          {t('list.confirmPaid')}
                        </Button>
                        <Button
                          id={`dispute-payment-btn-${ord.id}`}
                          variant="outline"
                          onClick={() => handleConfirmPayment(ord.id, false)}
                          disabled={actionLoadingId === `pay-${ord.id}`}
                          className="px-4 bg-surface border-red-200 text-red-700 hover:bg-red-50"
                        >
                          {t('list.dispute')}
                        </Button>
                      </div>
                    </div>
                  )}

                  {['pending', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivered', 'completed'].includes(ord.orderStatus) && (
                    <div className="px-5 pt-4">
                      {ord.orderStatus === 'pending' && (
                        <div className="flex items-center gap-2">
                          <Button
                            id={`accept-order-btn-${ord.id}`}
                            onClick={() => handleAcceptOrder(ord.id)}
                            disabled={isActionBusy}
                            className="flex-1"
                          >
                            {isActionBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            {t('list.acceptStart')}
                          </Button>
                          <Button
                            id={`reject-order-btn-${ord.id}`}
                            variant="outline"
                            onClick={() => openRejectModal(ticket)}
                            disabled={isActionBusy}
                            className="text-red-700 border-line-strong hover:bg-red-50"
                          >
                            {t('reject')}
                          </Button>
                        </div>
                      )}

                      {ord.orderStatus === 'preparing' && (
                        <Button
                          id={`ready-pickup-btn-${ord.id}`}
                          onClick={() => handleMarkReady(ord.id)}
                          disabled={isActionBusy}
                          className="w-full"
                        >
                          {isActionBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                          {t('list.markReady')}
                        </Button>
                      )}

                      {ord.sellerHandsOver && ['ready', 'dispatched', 'in_transit'].includes(ord.orderStatus) && (
                        <SelfHandoverActions
                          orderId={ord.id}
                          orderStatus={ord.orderStatus}
                          deliveryType={ord.deliveryType}
                          onChanged={() => loadOrders(true)}
                        />
                      )}

                      {ord.orderStatus === 'ready' && !ord.sellerHandsOver && (
                        <p className="text-sm text-brand-ink">{t('list.readyCounter')}</p>
                      )}

                      {(ord.orderStatus === 'dispatched' || ord.orderStatus === 'in_transit') && !ord.sellerHandsOver && (
                        <p className="text-sm text-muted">{t('list.riderOnWay')}</p>
                      )}

                      {(ord.orderStatus === 'delivered' || ord.orderStatus === 'completed') && (
                        <p className="text-sm text-muted">{t('list.deliveredTitle')}</p>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              {t('list.previous')}
            </Button>
            <span className="text-sm text-muted tabular-nums">
              {t('list.pageOf', { page, total: totalPages })}
            </span>
            <Button
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              {tc('next')}
            </Button>
          </div>
        )}

        {rejectingOrder && (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-4">
            <div
              id="reject-order-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-order-title"
              className="bg-surface text-ink rounded-[20px] max-w-md w-full p-5 sm:p-6 shadow-xl border border-line space-y-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 id="reject-order-title" className="text-lg font-semibold text-ink">
                    {t('list.rejectTitle')} <span data-ltr>#{rejectingOrder.order.orderNumber}</span>
                  </h3>
                  <p className="text-sm text-muted mt-0.5">{t('list.rejectHint')}</p>
                </div>
                <button
                  type="button"
                  onClick={closeRejectModal}
                  aria-label={tc('close')}
                  className="-me-2 -mt-1 w-11 h-11 shrink-0 rounded-full text-muted hover:bg-raised flex items-center justify-center focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <fieldset className="space-y-2">
                <legend className="sr-only">{t('list.rejectHint')}</legend>
                {REJECTION_REASONS.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-center gap-3 min-h-11 px-3.5 py-2.5 rounded-xl border cursor-pointer text-sm transition-colors ${
                      selectedReason === r.id
                        ? 'border-red-300 bg-red-50 text-red-700 font-medium'
                        : 'border-line text-ink hover:bg-raised'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rejectReason"
                      value={r.id}
                      checked={selectedReason === r.id}
                      onChange={() => setSelectedReason(r.id)}
                      className="h-4 w-4 accent-red-700"
                    />
                    <span>{t(r.key)}</span>
                  </label>
                ))}
              </fieldset>

              <div>
                <label htmlFor="reject-order-note" className="block text-sm text-muted mb-1.5">
                  {t('list.additionalNote')}
                </label>
                <textarea
                  id="reject-order-note"
                  value={customReasonText}
                  onChange={(e) => setCustomReasonText(e.target.value)}
                  placeholder={t('list.notePlaceholder')}
                  rows={2}
                  className="w-full text-sm p-3 rounded-xl bg-surface text-ink border border-line-strong focus:outline-none focus:ring-3 focus:ring-brand/40"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button
                  id="confirm-reject-btn"
                  variant="destructive"
                  onClick={handleConfirmReject}
                  disabled={isSubmittingReject}
                  className="flex-1"
                >
                  {isSubmittingReject ? t('list.rejecting') : t('list.confirmReject')}
                </Button>
                <Button
                  variant="outline"
                  onClick={closeRejectModal}
                  disabled={isSubmittingReject}
                >
                  {tc('back')}
                </Button>
              </div>
            </div>
          </div>
        )}

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
