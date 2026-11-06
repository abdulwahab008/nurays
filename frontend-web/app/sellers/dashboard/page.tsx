'use client';

import PushPrompt from '@/components/notifications/PushPrompt';
import { loginUrlHere } from '@/lib/auth-redirect';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Plus } from 'lucide-react';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';
import { useLocale, useT } from '@/lib/i18n';
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
  recentOrders: Array<{
    orderId: string;
    orderNumber: string;
    /** "1 × Biryani, 2 × Samosa": the kitchen's dishes in the order. */
    productName: string;
    quantity: number;
    /** The kitchen's dishes in the order, not the whole order. */
    totalPrice: number;
    orderStatus: string;
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    stockQuantity: number;
  }>;
}

function statusTone(status: string): string {
  if (status === 'pending') return 'bg-accent-soft text-accent-soft-ink';
  if (status === 'ready' || status === 'delivered' || status === 'completed') return 'bg-brand-soft text-brand-soft-ink';
  if (status === 'cancelled' || status === 'refunded' || status === 'delivery_failed') return 'bg-red-50 text-red-700';
  return 'bg-raised text-muted';
}

/** "8:20 pm" today, "Yesterday 8:20 pm", else "6 Nov": short enough to sit on one line beside the dish. */
function shortWhen(iso: string, locale: string, yesterday: (time: string) => string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const loc = locale === 'ur' ? 'ur-PK-u-nu-latn' : 'en-PK';
  const time = new Intl.DateTimeFormat(loc, { hour: 'numeric', minute: '2-digit' }).format(d);
  const today = new Date();
  const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  if (d.getTime() >= dayStart) return time;
  if (d.getTime() >= dayStart - 86_400_000) return yesterday(time);
  return new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(d);
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
  const { locale } = useLocale();
  const [loading, setLoading] = useState(true);
  // Why the dashboard could not be read when it was not a 404. A kitchen whose dashboard could not be read is not a kitchen
  // that has to register, which is what the page said.
  const [loadError, setLoadError] = useState<unknown>(null);
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  // No kitchen yet (the server answered 404): the one application form is where it is made.
  const [noKitchen, setNoKitchen] = useState(false);

  const sidebarItems = SELLER_SIDEBAR_ITEMS;

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/sellers/me/dashboard');
      if (response.data.success) {
        setDashboard(response.data.data);
        setNoKitchen(false);
      }
      setLoadError(null);
    } catch (error) {
      console.error('Failed to load seller dashboard:', error);

      if (apiErrorStatus(error) === 404) {
        setNoKitchen(true);
        setLoadError(null);
        return;
      }

      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

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
        <LoadError error={loadError} onRetry={loadDashboard} title={t('dash.loadFailed')} />
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
  const waitingCount = overview.pendingOrders ?? 0;
  const activeCount = overview.activeOrders ?? 0;
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
                <p className="text-sm text-red-700 mt-0.5">
                  {t('dash.reasonLabel')} {dashboard.rejectionReason || t('dash.rejectedFallback')}
                </p>
              </div>
              <Link
                href="/sellers/register"
                className="shrink-0 inline-flex items-center justify-center h-11 px-5 rounded-xl border border-red-200 text-sm font-semibold text-red-700 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-red-300"
              >
                {t('dash.fixResubmit')}
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

          {approved && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-x-10 gap-y-8">
            {/* What needs the cook now: the one raised surface on this screen */}
            <article className="min-w-0 self-start rounded-[20px] bg-surface border border-line shadow-[var(--shadow-card)] overflow-hidden">
              <header className="px-5 pt-5 pb-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-ink">
                    {waitingCount === 0
                      ? t('dash.nothingWaiting')
                      : waitingCount === 1
                        ? t('dash.waitingOne')
                        : t('dash.waiting', { count: waitingCount })}
                  </h2>
                  <p className="text-sm text-muted mt-0.5">{waitingCount > 0 ? t('dash.waitingHint') : t('dash.allQuiet')}</p>
                  {activeCount > waitingCount && (
                    <p className="text-sm text-muted mt-0.5">{t('dash.inProgress', { count: activeCount - waitingCount })}</p>
                  )}
                </div>
                <Link
                  href="/sellers/orders"
                  className={`shrink-0 inline-flex items-center justify-center h-11 px-6 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40 ${
                    waitingCount > 0 ? 'bg-brand text-on-brand hover:bg-brand-500' : 'border border-line-strong text-ink hover:bg-raised'
                  }`}
                >
                  {t('dash.openOrders')}
                </Link>
              </header>

              <div className="border-t border-line">
                <h3 className="px-5 pt-4 pb-1 text-sm text-muted">{t('dash.latestOrders')}</h3>
                {dashboard.recentOrders.length === 0 ? (
                  <p className="px-5 pt-2 pb-6 text-sm text-muted">{t('dash.noOrders')}</p>
                ) : (
                  <ul className="divide-y divide-line">
                    {dashboard.recentOrders.map((order) => (
                      <li key={order.orderId}>
                        <Link
                          href={`/sellers/orders/${order.orderId}`}
                          className="flex items-center gap-3 sm:gap-4 px-5 py-3.5 min-h-11 hover:bg-raised focus-visible:outline-none focus-visible:bg-raised"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] text-ink truncate">{order.productName}</p>
                            <p className="text-sm text-muted truncate">
                              {shortWhen(order.createdAt, locale, (time) => t('dash.yesterday', { time }))}, <span data-ltr>#{order.orderNumber}</span>
                            </p>
                          </div>
                          <div className="text-end shrink-0">
                            <p className="text-[15px] font-semibold text-ink tabular-nums">{formatPrice(order.totalPrice)}</p>
                            <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${statusTone(order.orderStatus)}`}>
                              {kitchenStatusLabel(order.orderStatus, t, tc)}
                            </span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted shrink-0 rtl:-scale-x-100" aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
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
              </section>

              <section className="pt-6 border-t border-line">
                <h3 className="text-sm font-semibold text-ink">{t('dash.money')}</h3>
                <dl className="mt-3">
                  <dt className="text-sm text-muted">{t('dash.totalEarnings')}</dt>
                  <dd className="text-2xl font-semibold text-ink tabular-nums">{formatPrice(overview.totalEarnings ?? 0)}</dd>
                </dl>
                <p className="text-sm text-muted mt-2">
                  {t('dash.comingToYou', { amount: formatPrice((overview.pendingPayout ?? 0) + awaitingRiderCash) })}
                </p>
                {awaitingRiderCash > 0 && (
                  <p className="text-sm text-muted">{t('dash.afterRiderCash', { amount: formatPrice(awaitingRiderCash) })}</p>
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
