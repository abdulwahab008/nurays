'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { formatPrice, formatTime } from '@/lib/utils';
import OrderChatModal from '@/components/orders/OrderChatModal';
import SelfHandoverActions from '@/components/orders/SelfHandoverActions';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { cancelReasonText, kitchenOrderMessages, kitchenStatusLabel, paymentMethodLabel, paymentStatusLabel } from '@/lib/i18n/messages/kitchen-orders';
import { ExternalLink } from '@/components/ExternalLink';
import { RejectOrderDialog } from '@/components/sellers/RejectOrderDialog';
import { markNewOrdersSeen, setNowTabOpen } from '@/components/sellers/new-order-alert';
import {
  KitchenOrderRider,
  OrderNo,
  PrepTimePicker,
  fitPrepMinutes,
  ReadyBy,
  RiderStatus,
  useAge,
  useDayLabel,
  useNow,
  useReadyFor,
} from '@/components/sellers/order-timing';
import { useShallow } from 'zustand/react/shallow';

const sidebarItems = SELLER_SIDEBAR_ITEMS;

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
    /** This kitchen's dishes in the order, before Nuray's fee. */
    dishesTotal?: number;
    /** What the kitchen keeps of the order: its dishes less Nuray's fee and any rider fee it pays. */
    kitchenEarns?: number;
    createdAt: string;
    /** Once accepted: when the kitchen said the food would be ready. */
    estimatedDeliveryAt?: string | null;
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
    /** When it was last marked ready (ready orders only). */
    readyAt?: string | null;
    customerName?: string;
    customerPhone?: string | null;
    deliveryAddress?: {
      area?: string;
      city?: string;
      addressLine1?: string;
      label?: string;
    };
    rider?: KitchenOrderRider | null;
    /** The minutes accepting without a choice would give (the slowest dish). */
    suggestedPrepMinutes?: number;
  };
  items: OrderItemEntry[];
}

type View = 'active' | 'delivered' | 'cancelled' | 'all';
type Counts = { active: number; needYou: number; new: number; delivered: number; cancelled: number };

// The statuses each history tab is named after: a row there only shows its status when it is a different one.
const TAB_STATUSES: Partial<Record<View, string[]>> = { delivered: ['delivered', 'completed'], cancelled: ['cancelled'] };

// The orders still being worked on, in the order a kitchen deals with them.
const SECTIONS = [
  { key: 'new', title: 'tab.pending', statuses: ['pending', 'confirmed'] },
  { key: 'cooking', title: 'tab.preparing', statuses: ['preparing'] },
  { key: 'ready', title: 'tab.ready', statuses: ['ready'] },
  { key: 'onTheWay', title: 'list.section.onTheWay', statuses: ['dispatched', 'in_transit'] },
] as const;

export default function SellerOrdersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const now = useNow();
  const age = useAge();
  const readyFor = useReadyFor();
  const dayLabel = useDayLabel();
  const [loading, setLoading] = useState(true);
  // Why the orders could not be read; shown instead of "No orders yet", which a kitchen with orders waiting must never be told.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [orderTickets, setOrderTickets] = useState<OrderTicket[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [filter, setFilter] = useState<View>('active');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  // The "Ready in" minutes the kitchen picked on each new order, until it accepts.
  const [prepChoice, setPrepChoice] = useState<Record<string, number>>({});

  const [rejectingOrder, setRejectingOrder] = useState<OrderTicket | null>(null);
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
      const view = filterRef.current;
      const params = new URLSearchParams({
        page: pageRef.current.toString(),
        // Every order in progress on one screen: a kitchen never has to page to find one it is cooking.
        limit: view === 'active' ? '100' : '20',
      });
      if (view !== 'all') params.append('view', view);
      const response = await apiClient.get(`/seller/orders?${params.toString()}`);
      if (response.data.success) {
        const raw = response.data.data;
        setOrderTickets(raw?.orders || []);
        setCounts(raw?.counts ?? null);
        setTotalPages(raw?.pagination?.totalPages ?? 1);
      }
      setLoadError(null);
    } catch (error) {
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

  // The Now tab shows every new order with Accept and Reject: the new-order bell stays quiet while it is open, and has done
  // its job for the orders it showed.
  // Not when the orders could not be read: then the bell is the kitchen's only news of a new one.
  const nowTabShowing = filter === 'active' && !loadError;
  useEffect(() => {
    if (!nowTabShowing) return;
    setNowTabOpen(true);
    return () => setNowTabOpen(false);
  }, [nowTabShowing]);
  useEffect(() => {
    if (filter !== 'active' || loading) return;
    markNewOrdersSeen(orderTickets.filter((ticket) => ['pending', 'confirmed'].includes(ticket.order.orderStatus)).map((ticket) => ticket.order.id));
  }, [filter, loading, orderTickets]);

  // Sync when the new-order alert accepts or rejects an order
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
        showToast(confirmed ? t('list.paymentVerified') : t('list.paymentDisputed'), confirmed ? 'success' : 'info');
        loadOrders(true);
      }
    } catch (err) {
      showToast(apiErrorMessage(err, t('list.paymentUpdateFailed')), 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleAcceptOrder = async (orderId: string, preparationTime: number) => {
    try {
      setActionLoadingId(orderId);
      const res = await apiClient.post<{ success: boolean; data: { estimatedReadyAt?: string } }>(`/seller/orders/${orderId}/accept`, {
        preparationTime,
      });
      if (res.data.success) {
        const readyAt = res.data.data?.estimatedReadyAt;
        showToast(readyAt ? t('list.acceptedReadyBy', { time: formatTime(readyAt) }) : t('list.accepted'), 'success');
        window.dispatchEvent(new CustomEvent('seller-order-status-changed', { detail: { orderId, status: 'accepted' } }));
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

  const filterTabs: Array<{ id: View; label: string; count?: number }> = [
    { id: 'active', label: t('tab.now'), count: counts?.needYou },
    { id: 'delivered', label: t('tab.delivered') },
    { id: 'cancelled', label: t('tab.cancelled') },
    { id: 'all', label: t('tab.all') },
  ];

  if (!isAuthenticated) return null;

  const paymentProof = (ord: OrderTicket['order']) =>
    ord.paymentStatus === 'payment_submitted' && (
      <div className="mx-5 mt-4 rounded-xl bg-accent-soft text-accent-soft-ink p-3.5 text-sm">
        <p className="font-semibold">{t('list.proofTitle')}</p>
        <p className="mt-0.5">
          {t('list.method')} {ord.paymentSenderAccount || ord.paymentMethod || t('list.directWallet')}
          {ord.paymentReferenceNumber && <>, <span data-ltr>{t('list.ref', { ref: ord.paymentReferenceNumber })}</span></>}
        </p>
        {ord.paymentProofUrl && (
          <ExternalLink href={ord.paymentProofUrl} className="inline-flex items-center min-h-11 font-semibold underline underline-offset-2">
            {t('list.viewScreenshot')}
          </ExternalLink>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
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
    );

  /** An order still being worked on: what to cook, for whom, by when, and the one next step. */
  const renderCard = (ticket: OrderTicket) => {
    const ord = ticket.order;
    const items = ticket.items || [];
    const isActionBusy = actionLoadingId === ord.id;
    const isNew = ord.orderStatus === 'pending' || ord.orderStatus === 'confirmed';
    const since = ord.orderStatus === 'ready' && ord.readyAt ? readyFor(ord.readyAt, now) : age(ord.createdAt, now);
    const suggested = fitPrepMinutes(ord.suggestedPrepMinutes ?? 20);
    const prep = prepChoice[ord.id] ?? suggested;
    const area = [ord.deliveryAddress?.addressLine1, ord.deliveryAddress?.area].filter(Boolean).join(', ');

    return (
      <article
        key={ord.id}
        id={`order-card-${ord.id}`}
        className={`rounded-[20px] bg-surface border overflow-hidden pb-5 ${
          isNew ? 'border-accent-soft-ink/30 shadow-[var(--shadow-card)]' : 'border-line'
        }`}
      >
        <header className={`px-5 pt-4 ${isNew ? 'bg-accent-soft pb-3' : ''}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {isNew ? (
                <p className="text-[15px] font-semibold text-accent-soft-ink">
                  {t('statusNew')}
                  <span className="font-normal"> · {since}</span>
                </p>
              ) : (
                <p className="text-sm text-muted">{since}</p>
              )}
              <Link
                href={`/sellers/orders/${ord.id}`}
                className={`inline-flex items-center min-h-11 -my-2 hover:underline ${isNew ? 'text-sm text-accent-soft-ink' : 'text-[15px] font-semibold text-ink'}`}
              >
                <span data-ltr>#{ord.orderNumber || ord.id.slice(0, 8)}</span>
              </Link>
            </div>
            <div className="shrink-0 text-end">
              <p className="text-lg font-semibold text-ink tabular-nums">{formatPrice(ord.dishesTotal ?? ord.totalAmount)}</p>
              {ord.kitchenEarns != null && (
                <p className={`text-sm tabular-nums ${isNew ? 'text-accent-soft-ink' : 'text-muted'}`}>{t('list.youEarn', { amount: formatPrice(ord.kitchenEarns) })}</p>
              )}
            </div>
          </div>
        </header>

        <ul className="px-5 mt-4 space-y-1.5">
          {items.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-4 text-[15px]">
              <span className="text-ink min-w-0">
                <span className="font-semibold tabular-nums">{item.quantity} ×</span> <bdi>{item.product?.name || t('list.foodItem')}</bdi>
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

        <div className="px-5 mt-3 flex items-center justify-between gap-3 text-sm">
          <p className="min-w-0 text-muted truncate">
            <span className="text-ink">{ord.customerName || t('customer')}</span>
            {ord.customerPhone && (
              <a href={`tel:${ord.customerPhone}`} className="ms-1.5 text-brand-ink hover:underline" data-ltr>{ord.customerPhone}</a>
            )}
            {area && <>, {area}</>}
          </p>
          <button
            type="button"
            id={`chat-customer-btn-${ord.id}`}
            onClick={() => setChatTicket(ticket)}
            aria-label={t('list.chatTitle')}
            className="shrink-0 -me-3 inline-flex items-center gap-1.5 min-h-11 px-3 rounded-lg font-semibold text-brand-ink hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" />
            {t('list.chat')}
          </button>
        </div>
        <p className="px-5 text-xs text-muted">
          {paymentMethodLabel(ord.paymentMethod, tc, ord.deliveryType === 'self_pickup' ? t : undefined)}, {paymentStatusLabel(ord.paymentStatus, t)}
        </p>

        {paymentProof(ord)}

        <div className="px-5 pt-4 mt-4 border-t border-line">
          {isNew && (
            <div className="space-y-3">
              <PrepTimePicker
                idPrefix={ord.id}
                suggested={suggested}
                value={prep}
                onChange={(min) => setPrepChoice((c) => ({ ...c, [ord.id]: min }))}
                disabled={isActionBusy}
              />
              <div className="flex items-center gap-2">
                <Button id={`accept-order-btn-${ord.id}`} onClick={() => handleAcceptOrder(ord.id, prep)} disabled={isActionBusy} className="flex-1">
                  {isActionBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                  {t('list.acceptStart')}
                </Button>
                <Button
                  id={`reject-order-btn-${ord.id}`}
                  variant="outline"
                  onClick={() => setRejectingOrder(ticket)}
                  disabled={isActionBusy}
                  className="text-red-700 border-line-strong hover:bg-red-50"
                >
                  {t('reject')}
                </Button>
              </div>
            </div>
          )}

          {ord.orderStatus === 'preparing' && (
            <div className="space-y-3">
              {ord.estimatedDeliveryAt && (
                <p className="text-sm">
                  <ReadyBy at={ord.estimatedDeliveryAt} now={now} />
                </p>
              )}
              <Button id={`ready-pickup-btn-${ord.id}`} onClick={() => handleMarkReady(ord.id)} disabled={isActionBusy} className="w-full">
                {isActionBusy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                {t('list.markReady')}
              </Button>
            </div>
          )}

          {ord.sellerHandsOver && ['ready', 'dispatched', 'in_transit'].includes(ord.orderStatus) && (
            <SelfHandoverActions orderId={ord.id} orderStatus={ord.orderStatus} deliveryType={ord.deliveryType} onChanged={() => loadOrders(true)} />
          )}

        </div>
      </article>
    );
  };

  /** An order the kitchen only follows (a Nuray rider has it), or any order in the history tabs: one line, the details one tap away. */
  const renderRow = (ticket: OrderTicket) => {
    const ord = ticket.order;
    const status = ord.orderStatus;
    const tabStatuses = TAB_STATUSES[filter];
    // History rows name the status only when it is not what the tab already says (on All, delivered is the norm).
    const shownTabStatuses = filter === 'all' ? TAB_STATUSES.delivered : tabStatuses;
    const statusNote = filter !== 'active' && shownTabStatuses && !shownTabStatuses.includes(status) ? kitchenStatusLabel(status, t, tc) : null;
    const when =
      filter !== 'active' ? formatTime(ord.createdAt) : status === 'ready' && ord.readyAt ? readyFor(ord.readyAt, now) : age(ord.createdAt, now);
    const firstName = filter === 'active' ? null : ord.customerName?.trim().split(/\s+/)[0];
    const ended = ['cancelled', 'refunded', 'delivery_failed'].includes(status);
    const reason = ord.cancellationReason && ['cancelled', 'refunded'].includes(status) ? cancelReasonText(ord.cancellationReason, t) : null;
    const statusTag = statusNote && <span className={`font-medium ${ended ? 'text-red-700' : 'text-ink'}`}>{statusNote}</span>;
    const meta = [!reason && statusTag, when, firstName && <bdi key="name">{firstName}</bdi>, <OrderNo key="no" number={ord.orderNumber} />].filter(Boolean);
    return (
      <li key={ord.id}>
        <Link
          href={`/sellers/orders/${ord.id}`}
          className="flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 min-h-11 hover:bg-raised focus-visible:outline-none focus-visible:bg-raised"
        >
          <div className="min-w-0 flex-1">
            <p dir="auto" className="text-base font-semibold text-ink line-clamp-2 break-words rtl:text-right">
              {(ticket.items || []).map((i, n) => (
                <span key={i.id}>
                  {n > 0 && ', '}
                  <bdi>{i.quantity} × {i.product?.name || t('list.foodItem')}</bdi>
                </span>
              ))}
            </p>
            <p className="mt-0.5 text-[13px] text-muted">
              {meta.map((part, n) => (
                <span key={n}>
                  {n > 0 && ' '}
                  <span className="whitespace-nowrap">
                    {n > 0 && '· '}
                    {part}
                  </span>
                </span>
              ))}
            </p>
            {['ready', 'dispatched', 'in_transit'].includes(status) &&
              (ord.rider ? (
                <RiderStatus rider={ord.rider} className="mt-0.5 text-[13px]" />
              ) : (
                <p className="mt-0.5 text-[13px] text-ink">{status === 'ready' ? t('rider.comingNoName') : t('list.riderOnWay')}</p>
              ))}
            {reason && (
              <p className="mt-0.5 text-[13px] text-muted truncate">
                {statusTag && <>{statusTag} · </>}
                {reason}
              </p>
            )}
          </div>
          <div className="text-end shrink-0">
            <p className={`text-base font-semibold tabular-nums ${ended ? 'text-muted' : 'text-ink'}`}>{formatPrice(ord.dishesTotal ?? ord.totalAmount)}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted shrink-0 rtl:-scale-x-100" aria-hidden="true" />
        </Link>
      </li>
    );
  };

  /** The history: a list card for each day under its date. */
  const renderHistory = () => {
    const days: { key: string; tickets: OrderTicket[] }[] = [];
    for (const ticket of orderTickets) {
      const key = new Date(ticket.order.createdAt).toDateString().replace(/ /g, '-');
      const last = days[days.length - 1];
      if (last?.key === key) last.tickets.push(ticket);
      else days.push({ key, tickets: [ticket] });
    }
    return (
      <div className="space-y-6">
        {days.map((day) => {
          return (
            <section key={day.key} aria-labelledby={`day-${day.key}`}>
              {/* No day count or total here: the list is paged, so a day can run onto the next page. */}
              <h2 id={`day-${day.key}`} className="mb-2 px-1 text-sm font-semibold text-ink">
                {dayLabel(day.tickets[0].order.createdAt, now)}
              </h2>
              <ul className="rounded-[20px] bg-surface border border-line divide-y divide-line overflow-hidden">{day.tickets.map(renderRow)}</ul>
            </section>
          );
        })}
      </div>
    );
  };

  const byAge = (a: OrderTicket, b: OrderTicket) => new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime();
  const byReadyTime = (a: OrderTicket, b: OrderTicket) =>
    new Date(a.order.estimatedDeliveryAt ?? a.order.createdAt).getTime() - new Date(b.order.estimatedDeliveryAt ?? b.order.createdAt).getTime();

  const emptyText =
    filter === 'active'
      ? t('list.emptyNow')
      : filter === 'all'
        ? t('list.emptyAll')
        : t('list.emptyFiltered', { filter: filterTabs.find((tab) => tab.id === filter)?.label ?? filter });

  return (
    <DashboardLayout title={t('list.title')} sidebarItems={sidebarItems} userType="seller">
      <div className="max-w-6xl">
        <div className="mb-6 flex items-center gap-1.5 sm:gap-2">
          <div
            role="tablist"
            aria-label={t('list.title')}
            className="flex-1 sm:flex-none min-w-0 grid grid-cols-4 sm:inline-grid sm:grid-flow-col sm:auto-cols-max sm:gap-1 p-1 rounded-2xl bg-raised"
          >
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
                  className={`inline-flex items-center justify-center gap-1 min-w-0 h-11 px-1 sm:px-4 rounded-xl text-[13px] tracking-tight rtl:text-[15px] rtl:tracking-normal sm:text-[15px] sm:tracking-normal whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                    selected ? 'bg-surface text-ink font-semibold shadow-[var(--shadow-card)] ring-1 ring-line' : 'text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                  {tab.count ? (
                    <span className={`min-w-5 px-1.5 rounded-full text-xs font-semibold tabular-nums ${counts?.new ? 'bg-accent text-on-accent' : 'bg-line text-ink'}`}>
                      {tab.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => loadOrders(false)}
            aria-label={t('list.refresh')}
            title={t('list.refresh')}
            className="shrink-0 sm:ms-auto inline-flex items-center justify-center w-11 h-11 rounded-xl text-muted hover:text-ink hover:bg-raised focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {filter !== 'active' && !!counts?.new && (
          <button
            type="button"
            onClick={() => {
              setFilter('active');
              setPage(1);
            }}
            className="mb-4 w-full flex items-center justify-between gap-3 min-h-11 px-4 rounded-xl bg-accent-soft text-accent-soft-ink text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <span className="font-semibold">{counts.new === 1 ? t('list.newOrdersOne') : t('list.newOrders', { count: counts.new })}</span>
            <span className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              {t('list.showNow')}
              <ChevronRight className="w-4 h-4 rtl:-scale-x-100" aria-hidden="true" />
            </span>
          </button>
        )}

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
          <p className="py-16 text-center text-sm text-muted">{emptyText}</p>
        ) : filter === 'active' ? (
          <div className="space-y-8">
            {SECTIONS.map((section) => {
              const tickets = orderTickets
                .filter((ticket) => (section.statuses as readonly string[]).includes(ticket.order.orderStatus))
                .sort(section.key === 'cooking' ? byReadyTime : byAge);
              if (tickets.length === 0) return null;
              return (
                <section key={section.key} aria-labelledby={`orders-${section.key}`}>
                  <h2 id={`orders-${section.key}`} className="mb-3 text-sm font-semibold text-ink">
                    {t(section.title)} <span className="font-normal text-muted tabular-nums">{tickets.length}</span>
                  </h2>
                  {section.key === 'ready' || section.key === 'onTheWay' ? (
                    <div className="space-y-4">
                      {tickets.some((ticket) => ticket.order.sellerHandsOver) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">{tickets.filter((ticket) => ticket.order.sellerHandsOver).map(renderCard)}</div>
                      )}
                      {tickets.some((ticket) => !ticket.order.sellerHandsOver) && (
                        <ul className="rounded-[20px] bg-surface border border-line divide-y divide-line overflow-hidden">
                          {tickets.filter((ticket) => !ticket.order.sellerHandsOver).map(renderRow)}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">{tickets.map(renderCard)}</div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          renderHistory()
        )}

        {filter !== 'active' && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between">
            <Button variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              {t('list.previous')}
            </Button>
            <span className="text-sm text-muted tabular-nums">{t('list.pageOf', { page, total: totalPages })}</span>
            <Button variant="outline" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              {tc('next')}
            </Button>
          </div>
        )}

        {rejectingOrder && (
          <RejectOrderDialog
            orderId={rejectingOrder.order.id}
            orderNumber={rejectingOrder.order.orderNumber}
            onClose={() => setRejectingOrder(null)}
            onRejected={() => loadOrders(true)}
          />
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
