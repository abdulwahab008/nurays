'use client';

import PushPrompt from '@/components/notifications/PushPrompt';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { OrderStatusPill } from '@/components/ui/StatusPill';
import { OrderNo, ReadyBy, useAge, useNow, useReadyFor } from '@/components/sellers/order-timing';
import { NewOrderAlertSlot } from '@/components/sellers/new-order-alert';
import { useLiveRefresh } from '@/lib/hooks/use-live-refresh';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useT } from '@/lib/i18n';
import { commonMessages } from '@/lib/i18n/messages/common';
import { kitchenOrderMessages, kitchenStatusLabel } from '@/lib/i18n/messages/kitchen-orders';
import { useShallow } from 'zustand/react/shallow';

interface SellerDashboard {
  id: string;
  businessName: string;
  businessNameUrdu?: string;
  verificationStatus: string;
  rejectionReason?: string | null;
  isStoreOpen?: boolean;
  primaryCommunityName?: string | null;
  /** What a pending application still lacks (empty when it is complete and waiting for Nuray). */
  applicationMissing?: string[];
  hasPayoutAccount?: boolean;
  overview: {
    totalProducts: number;
    activeOrders: number;
    pendingOrders: number;
    totalEarnings: number;
    pendingPayout: number;
    todayEarnings?: number;
    todayOrders?: number;
    grossSales?: number;
    platformFees?: number;
    sellerDiscounts?: number;
    deliveryEarned?: number;
    deliveryPaid?: number;
    netEarnings?: number;
    pendingSettlement?: number;
    paidSettlement?: number;
    awaitingRiderCash?: number;
  };
  lowStockProducts: Array<{
    id: string;
    name: string;
    stockQuantity: number;
  }>;
}

/** An order still in the kitchen's hands, as the orders list gives it. */
interface LiveOrder {
  order: {
    id: string;
    orderNumber: string;
    orderStatus: string;
    createdAt: string;
    estimatedDeliveryAt?: string | null;
    readyAt?: string | null;
    /** The server's one rule for an order that waits on the kitchen (the orders list's Now count uses it too). */
    needsKitchen?: boolean;
  };
  items: Array<{ id: string; quantity: number; product: { name: string } | null }>;
}

// New orders first (oldest first: they have waited longest), then what is cooking (soonest due first), then what is ready.
const URGENCY: Record<string, number> = { pending: 0, confirmed: 0, preparing: 1, ready: 2 };
const SHOWN_ORDERS = 3;

function byUrgency(a: LiveOrder, b: LiveOrder): number {
  const rank = (o: LiveOrder) => URGENCY[o.order.orderStatus] ?? 3;
  const due = (o: LiveOrder) => new Date(o.order.estimatedDeliveryAt ?? o.order.createdAt).getTime();
  return rank(a) - rank(b) || due(a) - due(b);
}

// What the server calls each missing part of an application (utils/kitchenApplication.ts), in the kitchen's words.
const GAP_KEYS = {
  community: 'dash.gap.community',
  'kitchen location': 'dash.gap.location',
  'CNIC photos (both sides)': 'dash.gap.cnic',
} as const;

function Spinner({ label }: { label: string }) {
  return (
    <div className="py-24 text-center" role="status">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-line border-t-brand-600 mx-auto mb-4" />
      <p className="text-sm text-muted">{label}</p>
    </div>
  );
}

export default function SellerDashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-page" />}>
      <SellerDashboardContent />
    </Suspense>
  );
}

function SellerDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(kitchenOrderMessages);
  const tc = useT(commonMessages);
  const [loading, setLoading] = useState(true);
  // Why the dashboard could not be read when it was not a 404. A kitchen whose dashboard could not be read is not a kitchen
  // that has to register, which is what the page said.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  // No kitchen yet (the server answered 404): the one application form is where it is made.
  const [noKitchen, setNoKitchen] = useState(false);
  // The orders the kitchen is working on, most urgent first; null until read (or when they could not be).
  const [liveOrders, setLiveOrders] = useState<LiveOrder[] | null>(null);
  const [needYouCount, setNeedYouCount] = useState<number | null>(null);
  const now = useNow();
  const age = useAge();
  const readyFor = useReadyFor();

  const sidebarItems = SELLER_SIDEBAR_ITEMS;

  const loadLiveOrders = useCallback(async () => {
    try {
      const res = await apiClient.get('/seller/orders', { params: { view: 'active', limit: 100 } });
      const data = res.data?.data;
      setLiveOrders(((data?.orders ?? []) as LiveOrder[]).filter((o) => o.order.needsKitchen).sort(byUrgency));
      setNeedYouCount(data?.counts?.needYou ?? null);
    } catch {
      // The dashboard still says how many are waiting, and the orders page lists them.
      setLiveOrders(null);
      setNeedYouCount(null);
    }
  }, []);

  const loadDashboard = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await apiClient.get('/sellers/me/dashboard');
      if (response.data.success) {
        setDashboard(response.data.data);
        setNoKitchen(false);
        if (!silent && response.data.data?.verificationStatus === 'approved') void loadLiveOrders();
      }
      setLoadError(null);
    } catch (error) {
      if (apiErrorStatus(error) === 404) {
        setNoKitchen(true);
        setLoadError(null);
        return;
      }

      if (!silent) setLoadError(error);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // A delivered order changes what the kitchen earned as well as its list: both are read again.
  useLiveRefresh(() => {
    void loadLiveOrders();
    void loadDashboard(true);
  }, {
    events: ['order:new', 'order:status:update', 'order:item:status:update', 'delivery:assigned'],
    enabled: isAuthenticated && dashboard?.verificationStatus === 'approved',
  });

  useEffect(() => {
    window.addEventListener('seller-orders-updated', loadLiveOrders);
    window.addEventListener('seller-order-status-changed', loadLiveOrders);
    return () => {
      window.removeEventListener('seller-orders-updated', loadLiveOrders);
      window.removeEventListener('seller-order-status-changed', loadLiveOrders);
    };
  }, [loadLiveOrders]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }

    // Check if user is a seller or admin
    const role = user?.userType || user?.user_type;
    if (role !== 'seller' && role !== 'admin') {
      router.push('/dashboard');
      showToast(t('accessDenied'), 'error');
      return;
    }

    // Sign-up used to open a second, shorter form here: the kitchen application is the one place a kitchen is set up.
    if (searchParams.get('onboarding') === 'true') {
      router.replace('/sellers/register');
      return;
    }

    loadDashboard();
  }, [isAuthenticated, user, router, searchParams]);

  const [togglingLive, setTogglingLive] = useState(false);

  const handleToggleStoreLive = async () => {
    try {
      setTogglingLive(true);
      const res = await apiClient.post('/sellers/me/toggle-live');
      if (res.data.success) {
        setDashboard((prev) => prev ? {
          ...prev,
          isStoreOpen: res.data.data.isOpen,
          availabilityOverride: res.data.data.availabilityOverride,
        } : prev);
        showToast(res.data.message || (res.data.data.isOpen ? t('dash.storeOpenToast') : t('dash.storeClosedToast')), 'success');
      }
    } catch (err) {
      showToast(apiErrorMessage(err, t('dash.toggleFailed')), 'error');
    } finally {
      setTogglingLive(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  if (loading) {
    return (
      <DashboardLayout title={t('dash.title')} sidebarItems={sidebarItems} userType="seller">
        <Spinner label={tc('loading')} />
      </DashboardLayout>
    );
  }

  if (!dashboard && loadError) {
    return (
      <DashboardLayout title={t('dash.title')} sidebarItems={sidebarItems} userType="seller">
        <LoadError error={loadError} onRetry={() => loadDashboard()} title={t('dash.loadFailed')} />
      </DashboardLayout>
    );
  }

  if (!dashboard) {
    return (
      <DashboardLayout title={t('dash.title')} subtitle={t('dash.registerSubtitle')} sidebarItems={sidebarItems} userType="seller">
        {noKitchen && (
          <div className="max-w-md py-10">
            <h2 className="text-lg font-semibold text-ink">{t('dash.completeProfileTitle')}</h2>
            <p className="text-sm text-muted mt-1 mb-5">{t('dash.completeProfileBody')}</p>
            <Link href="/sellers/register">
              <Button>{t('dash.startRegistration')}</Button>
            </Link>
          </div>
        )}
      </DashboardLayout>
    );
  }

  const { overview } = dashboard;
  // Until the live orders are read, the dashboard's own count of orders to accept or cook.
  const needYou = needYouCount ?? liveOrders?.length ?? overview.pendingOrders ?? 0;
  const shownOrders = (liveOrders ?? []).slice(0, SHOWN_ORDERS);
  const moreOrders = liveOrders ? needYou - shownOrders.length : 0;
  const newCount = (liveOrders ?? []).filter((o) => o.order.orderStatus === 'pending' || o.order.orderStatus === 'confirmed').length;
  const approved = dashboard.verificationStatus === 'approved';
  const missing = dashboard.applicationMissing ?? [];
  const missingWords = missing.map((gap) => (gap in GAP_KEYS ? t(GAP_KEYS[gap as keyof typeof GAP_KEYS]) : gap)).join(', ');
  const awaitingRiderCash = overview.awaitingRiderCash ?? 0;
  const kitchenName = `${dashboard.businessName}${dashboard.businessNameUrdu ? ` (${dashboard.businessNameUrdu})` : ''}`;
  const subtitle = [kitchenName, dashboard.primaryCommunityName].filter(Boolean).join(', ');

  return (
    <>
      <DashboardLayout title={t('dash.title')} subtitle={subtitle} sidebarItems={sidebarItems} userType="seller">
        <div className="max-w-6xl">
          {approved && <PushPrompt text={t('dash.pushText')} />}

          {dashboard.verificationStatus === 'rejected' && (
            <div className="mb-6 rounded-xl bg-red-50 px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-red-700">{t('dash.rejectedTitle')}</p>
                <p className="text-sm text-ink mt-0.5">
                  {t('dash.reasonLabel')} {dashboard.rejectionReason || t('dash.rejectedFallback')}
                </p>
              </div>
              <Link href="/sellers/register" className="shrink-0">
                <Button className="w-full sm:w-auto">{t('dash.fixResubmit')}</Button>
              </Link>
            </div>
          )}

          {dashboard.verificationStatus === 'pending' && missing.length > 0 && (
            <div className="mb-6 rounded-xl bg-accent-soft text-accent-soft-ink px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{t('dash.incompleteTitle')}</p>
                <p className="text-sm mt-0.5">{t('dash.incompleteBody', { items: missingWords })}</p>
              </div>
              <Link href="/sellers/register" className="shrink-0">
                <Button className="w-full sm:w-auto">{t('dash.finishApplication')}</Button>
              </Link>
            </div>
          )}

          {dashboard.verificationStatus === 'pending' && missing.length === 0 && (
            <div className="mb-6 rounded-xl bg-accent-soft text-accent-soft-ink px-4 py-3.5">
              <p className="text-sm font-semibold">{t('dash.reviewTitle')}</p>
              <p className="text-sm mt-0.5">{t('dash.reviewBody')}</p>
            </div>
          )}

          {!approved && (
            <section className="max-w-xl space-y-2 text-sm text-muted">
              <p>{t('dash.notLiveYet')}</p>
              <p>{t('dash.addDishesMeanwhile')}</p>
              <div className="flex flex-wrap gap-x-5 pt-1">
                <Link href="/sellers/products/new" className="inline-flex items-center gap-1.5 min-h-11 font-semibold text-brand-ink hover:underline">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  {t('dash.addFoodItem')}
                </Link>
                <Link href="/sellers/products" className="inline-flex items-center min-h-11 font-semibold text-brand-ink hover:underline">
                  {t('dash.manage')}
                </Link>
              </div>
            </section>
          )}

          {approved && (
            <section className="flex items-center justify-between gap-4 pb-5 mb-6 border-b border-line">
              <div className="min-w-0">
                <p className={`text-[15px] font-semibold ${dashboard.isStoreOpen ? 'text-ink' : 'text-muted'}`}>
                  {dashboard.isStoreOpen ? t('dash.kitchenOpen') : t('dash.kitchenClosed')}
                </p>
                <p className="text-sm text-muted mt-0.5">{dashboard.isStoreOpen ? t('dash.openHint') : t('dash.closedHint')}</p>
              </div>
              <button
                type="button"
                id="store-live-toggle-btn"
                role="switch"
                aria-checked={!!dashboard.isStoreOpen}
                aria-label={dashboard.isStoreOpen ? t('dash.kitchenOpen') : t('dash.kitchenClosed')}
                onClick={handleToggleStoreLive}
                disabled={togglingLive}
                className="shrink-0 flex items-center min-h-11 px-1 rounded-full disabled:opacity-60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
              >
                <span aria-hidden="true" className={`relative w-12 h-7 rounded-full transition-colors ${dashboard.isStoreOpen ? 'bg-brand-600' : 'bg-line-strong'}`}>
                  <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] ${dashboard.isStoreOpen ? 'start-6' : 'start-1'}`} />
                </span>
              </button>
            </section>
          )}

          {approved && <NewOrderAlertSlot />}

          {approved && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-x-10 gap-y-8">
            {/* What needs the cook now: the one raised surface on this screen */}
            <article className="min-w-0 self-start rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] overflow-hidden">
              <header className="px-5 pt-5 pb-4">
                <h2 className="text-lg font-semibold text-ink">
                  {needYou === 0 ? t('dash.nothingToCook') : needYou === 1 ? t('dash.needYouOne') : t('dash.needYou', { count: needYou })}
                </h2>
                {needYou === 0 && <p className="text-sm text-muted mt-0.5">{t('dash.allQuiet')}</p>}
              </header>

              {shownOrders.length > 0 && (
                <ul className="border-t border-line divide-y divide-line">
                  {shownOrders.map(({ order, items }) => {
                    const isNew = order.orderStatus === 'pending' || order.orderStatus === 'confirmed';
                    return (
                      <li key={order.id}>
                        <Link
                          href={`/sellers/orders/${order.id}`}
                          className="flex items-center gap-3 sm:gap-4 px-5 py-3.5 min-h-11 hover:bg-raised focus-visible:outline-none focus-visible:bg-raised"
                        >
                          <div className="min-w-0 flex-1">
                            <p dir="auto" className="text-[15px] text-ink truncate rtl:text-right">
                              {items.map((i, n) => (
                                <span key={i.id}>
                                  {n > 0 && ', '}
                                  <bdi>{i.quantity} × {i.product?.name ?? ''}</bdi>
                                </span>
                              ))}
                            </p>
                            <p className="text-sm text-muted">
                              {order.orderStatus === 'preparing' && order.estimatedDeliveryAt ? (
                                <ReadyBy at={order.estimatedDeliveryAt} now={now} />
                              ) : order.orderStatus === 'ready' && order.readyAt ? (
                                readyFor(order.readyAt, now)
                              ) : (
                                age(order.createdAt, now)
                              )}
                              , <OrderNo number={order.orderNumber} />
                            </p>
                          </div>
                          <OrderStatusPill
                            status={order.orderStatus}
                            label={isNew ? t('statusNew') : kitchenStatusLabel(order.orderStatus, t, tc)}
                            className="shrink-0"
                          />
                          <ChevronRight className="w-4 h-4 text-muted shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}

              <Link
                href="/sellers/orders"
                className={`flex items-center justify-between gap-3 min-h-12 px-5 border-t border-line text-sm font-semibold hover:bg-raised focus-visible:outline-none focus-visible:bg-raised ${
                  newCount > 0 ? 'bg-brand text-on-brand hover:bg-brand-500' : 'text-brand-ink'
                }`}
              >
                <span>
                  {moreOrders > 0 ? t('dash.moreActive', { count: moreOrders }) : t('dash.viewAll')}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </article>

            <aside className="space-y-7 lg:pt-1">
              <section>
                <h3 className="text-sm font-semibold text-ink">{t('dash.today')}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted">{t('dash.todayEarnings')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(overview.todayEarnings ?? 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('dash.ordersToday')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums">{overview.todayOrders ?? 0}</dd>
                  </div>
                </dl>
                <p className="text-sm text-muted mt-2">{t('dash.earnedMeans')}</p>
              </section>

              <section className="pt-6 border-t border-line">
                <h3 className="text-sm font-semibold text-ink">{t('dash.money')}</h3>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted">{t('dash.comingToYouLabel')}</dt>
                    <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice((overview.pendingPayout ?? 0) + awaitingRiderCash)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted">{t('dash.earnedSoFar')}</dt>
                    <dd className="text-[15px] text-ink tabular-nums mt-1.5">{formatPrice(overview.totalEarnings ?? 0)}</dd>
                  </div>
                </dl>
                {awaitingRiderCash > 0 && (
                  <p className="text-sm text-muted mt-1">
                    {awaitingRiderCash >= (overview.pendingPayout ?? 0) + awaitingRiderCash
                      ? t('dash.allAfterRiderCash')
                      : t('dash.afterRiderCash', { amount: formatPrice(awaitingRiderCash) })}
                  </p>
                )}
                {dashboard.hasPayoutAccount === false && (
                  <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-soft-ink">
                    {t('dash.noPayoutAccount')}{' '}
                    <Link href="/sellers/settings#payout-heading" className="font-semibold underline underline-offset-2">
                      {t('dash.addPayoutAccount')}
                    </Link>
                  </p>
                )}
                <Link href="/sellers/earnings" className="inline-flex items-center min-h-11 text-sm font-semibold text-brand-ink hover:underline">
                  {t('dash.earningsLink')}
                </Link>
              </section>

              <section className="pt-6 border-t border-line">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold text-ink">{t('dash.menu')}</h3>
                  <Link href="/sellers/products" className="inline-flex items-center min-h-11 text-sm font-semibold text-brand-ink hover:underline">
                    {t('dash.manage')}
                  </Link>
                </div>
                <p className="text-sm text-muted mt-2">{t('dash.menuDishes', { count: overview.totalProducts ?? 0 })}</p>

                {dashboard.lowStockProducts.length === 0 ? (
                  <p className="text-sm text-muted mt-1">{t('dash.allStocked')}</p>
                ) : (
                  <>
                    <h4 className="text-sm text-muted mt-4">{t('dash.lowStock')}</h4>
                    <ul className="mt-1 divide-y divide-line">
                      {dashboard.lowStockProducts.map((product) => (
                        <li key={product.id}>
                          <Link
                            href={`/sellers/products/${product.id}/edit`}
                            className="flex items-center justify-between gap-3 min-h-11 py-2 text-sm hover:underline"
                          >
                            <span className="text-ink truncate">{product.name}</span>
                            <span className="shrink-0 text-accent-soft-ink font-medium tabular-nums">{t('dash.onlyLeft', { count: product.stockQuantity })}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <Link href="/sellers/products/new" className="mt-2 inline-flex items-center gap-1.5 min-h-11 text-sm font-semibold text-brand-ink hover:underline">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  {t('dash.addFoodItem')}
                </Link>
              </section>
            </aside>
          </div>
          )}
        </div>
      </DashboardLayout>
    </>
  );
}
