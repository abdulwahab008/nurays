'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useDialogs } from '@/components/ui/Dialogs';
import { ExternalLink } from '@/components/ExternalLink';
import DocumentList from '@/components/admin/DocumentList';
import { RejectReasonModal } from '@/components/admin/RejectReasonModal';
import { Figure, LoadingLine, PhoneText, StatusPill, outlineLinkClass, type PillTone } from '@/components/admin/AdminListParts';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage, apiErrorStatus } from '@/lib/api-client';
import { displayRating, formatDate, formatDateTime, formatPrice } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

interface SellerDetail {
  id: string;
  businessName: string;
  businessNameUrdu?: string | null;
  description?: string | null;
  verificationStatus: string;
  status: string;
  rejectionReason?: string | null;
  createdAt: string;
  productCount: number;
  communityName?: string | null;
  primaryCommunityName?: string | null;
  /** What the application still lacks (the server works it out); empty when it is complete. */
  missing?: string[];
  documents?: Array<{ id: string; type: string; url: string | null }>;
  figures?: { orders30d: number; sales30d: number; ratingAverage: number; totalReviews: number; liveDishes: number; totalDishes: number };
  kitchen?: {
    isOpen: boolean;
    availability: string;
    availabilityNote: string | null;
    hours: string[];
    deliveryModes: string[];
    deliveryProvider: string;
    pickupAddress: string | null;
    pickupLandmark: string | null;
    pickupPhone: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  dishes?: Array<{ id: string; name: string; price: number; isActive: boolean; moderationStatus: string }>;
  recentOrders?: Array<{ id: string; orderNumber: string; orderStatus: string; createdAt: string; kitchenTotal: number }>;
  payoutAccount?: {
    bankName: string | null;
    bankAccountName: string | null;
    bankAccountNumber: string | null;
    jazzcashNumber: string | null;
    easypaisaNumber: string | null;
  };
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    profile?: { fullName?: string | null; city?: string | null; area?: string | null } | null;
  };
}

const MODE_LABEL: Record<string, string> = { delivery: 'Delivery', pickup: 'Pickup', dine_in: 'Dine in' };
const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting for kitchen',
  confirmed: 'Accepted',
  preparing: 'Cooking',
  ready: 'Ready',
  dispatched: 'Picked up',
  in_transit: 'On the way',
  delivered: 'Delivered',
  delivery_failed: 'Delivery failed',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};
const orderTone = (status: string): PillTone =>
  status === 'delivered' ? 'good' : status === 'cancelled' || status === 'delivery_failed' ? 'problem' : status === 'refunded' ? 'neutral' : 'waiting';

function kitchenPill(s: SellerDetail): { tone: PillTone; label: string } {
  if (s.status === 'suspended') return { tone: 'problem', label: 'Suspended' };
  if (s.verificationStatus === 'pending') return { tone: 'waiting', label: 'Waiting for approval' };
  if (s.verificationStatus === 'rejected') return { tone: 'problem', label: 'Rejected' };
  if (s.status !== 'active') return { tone: 'neutral', label: 'Inactive' };
  return s.kitchen?.isOpen === false ? { tone: 'neutral', label: 'Closed now' } : { tone: 'good', label: 'Live, open now' };
}

function dishPill(d: { moderationStatus: string; isActive: boolean }): { tone: PillTone; label: string } {
  if (d.moderationStatus === 'pending') return { tone: 'waiting', label: 'Waiting' };
  if (d.moderationStatus === 'rejected') return { tone: 'problem', label: 'Rejected' };
  return d.isActive ? { tone: 'good', label: 'Live' } : { tone: 'neutral', label: 'Hidden' };
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="grid grid-cols-[minmax(0,8rem)_1fr] gap-x-4 gap-y-2 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="min-w-0 break-words text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminSellerDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const isAdmin = user?.user_type === 'admin' || user?.userType === 'admin';
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  // A kitchen that could not be read is not a kitchen that does not exist: only a 404 says "not found".
  const [loadError, setLoadError] = useState<unknown>(null);
  const [seller, setSeller] = useState<SellerDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const loadSeller = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/sellers/${id}`);
      setSeller(response.data.success ? response.data.data : null);
      setLoadError(null);
    } catch (error) {
      setSeller(null);
      setLoadError(apiErrorStatus(error) === 404 ? null : error);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthenticated && isAdmin && id) void loadSeller();
  }, [isAuthenticated, isAdmin, id, loadSeller]);

  const handleApprove = async () => {
    if (!seller) return;
    const ok = await confirmDialog({
      title: `Approve ${seller.businessName}?`,
      message: 'It can start listing dishes and taking orders.',
      confirmText: 'Approve',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/sellers/${id}/approve`, { approved: true });
      showToast(`${seller.businessName} is approved`, 'success');
      void loadSeller();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (reason: string) => {
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/sellers/${id}/reject`, { approved: false, notes: reason });
      showToast('Application rejected', 'success');
      setRejecting(false);
      void loadSeller();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async () => {
    if (!seller) return;
    const nextStatus = seller.status === 'suspended' ? 'active' : 'suspended';
    if (
      nextStatus === 'suspended' &&
      !(await confirmDialog({
        title: `Suspend ${seller.businessName}?`,
        message: 'Its page and dishes are hidden from customers and it cannot take orders until you reactivate it.',
        confirmText: 'Suspend',
        variant: 'danger',
      }))
    ) {
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/sellers/${id}/status`, { status: nextStatus });
      showToast(nextStatus === 'suspended' ? 'Kitchen suspended' : 'Kitchen reactivated', 'success');
      void loadSeller();
    } catch (error) {
      showToast(apiErrorMessage(error, 'That did not go through'), 'error');
    } finally {
      setActionLoading(false);
    }
  };

  if (!isAuthenticated || !isAdmin) return null;

  const missing = seller?.missing ?? [];
  const pill = seller ? kitchenPill(seller) : null;
  const f = seller?.figures;
  const k = seller?.kitchen;
  const pay = seller?.payoutAccount;
  const payoutRows: Array<[string, ReactNode]> = pay
    ? ([
        pay.bankAccountNumber ? ['Bank', `${pay.bankName ?? 'Bank'} ${pay.bankAccountNumber}${pay.bankAccountName ? `, ${pay.bankAccountName}` : ''}`] : null,
        pay.jazzcashNumber ? ['JazzCash', pay.jazzcashNumber] : null,
        pay.easypaisaNumber ? ['Easypaisa', pay.easypaisaNumber] : null,
      ].filter(Boolean) as Array<[string, ReactNode]>)
    : [];

  return (
    <DashboardLayout title={seller?.businessName ?? 'Kitchen'} sidebarItems={adminSidebarFor(user?.permissions)} userType="admin">
      <div className="max-w-5xl">
        <Link href="/admin/sellers" className="-mt-4 mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-ink hover:underline">
          <ChevronLeft aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />
          All kitchens
        </Link>

        {loading && !seller ? (
          <LoadingLine text="Loading the kitchen" />
        ) : loadError ? (
          <LoadError error={loadError} onRetry={() => void loadSeller()} title="We couldn't load this kitchen" />
        ) : !seller ? (
          <p className="text-sm text-muted">This kitchen does not exist, or it was deleted.</p>
        ) : (
          <div className="space-y-6">
            {/* Who it is, where it stands, and the one thing to do with it */}
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {pill && <StatusPill tone={pill.tone}>{pill.label}</StatusPill>}
                  {k?.availabilityNote && <span className="text-sm text-muted">{k.availabilityNote}</span>}
                </div>
                {seller.businessNameUrdu && <p className="mt-1 text-sm text-muted" dir="rtl">{seller.businessNameUrdu}</p>}
                {seller.description && <p className="mt-2 max-w-2xl text-sm text-ink">{seller.description}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:shrink-0">
                {seller.verificationStatus === 'approved' && seller.status === 'active' && (
                  <Link href={`/kitchens/${seller.id}`} className={outlineLinkClass}>
                    Open on site
                  </Link>
                )}
                {seller.verificationStatus === 'pending' && (
                  <>
                    <Button variant="outline" className="min-h-11 border-red-200 text-red-700 hover:bg-red-50" onClick={() => setRejecting(true)} disabled={actionLoading}>
                      Reject
                    </Button>
                    <Button className="min-h-11" onClick={handleApprove} disabled={actionLoading || missing.length > 0}>
                      Approve
                    </Button>
                  </>
                )}
                {seller.verificationStatus === 'approved' && (
                  <Button
                    variant="outline"
                    onClick={handleToggleSuspend}
                    disabled={actionLoading}
                    className={`min-h-11 ${seller.status === 'suspended' ? '' : 'border-red-200 text-red-700 hover:bg-red-50'}`}
                  >
                    {seller.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                  </Button>
                )}
              </div>
            </div>

            {seller.verificationStatus === 'pending' && missing.length > 0 && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700" data-testid="application-incomplete">
                Missing: {missing.join(', ')}. The kitchen can still add these to its application, or you can reject it and say what is missing.
              </p>
            )}
            {seller.rejectionReason && seller.verificationStatus === 'rejected' && (
              <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Rejected: {seller.rejectionReason}</p>
            )}

            {f && (
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4" data-testid="kitchen-figures">
                <Figure label="Orders, 30 days" value={f.orders30d} />
                <Figure label="Sales, 30 days" value={formatPrice(f.sales30d)} />
                <Figure
                  label="Rating"
                  value={displayRating(f.ratingAverage, f.totalReviews) ?? 'New'}
                  sub={f.totalReviews > 0 ? `${f.totalReviews} ${f.totalReviews === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
                />
                <Figure label="Dishes live" value={`${f.liveDishes} of ${f.totalDishes}`} />
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
              <Section title="Kitchen">
                <Facts
                  rows={[
                    ['Community', seller.communityName || seller.primaryCommunityName || <span className="text-muted">Not set</span>],
                    [
                      'Pickup address',
                      k?.pickupAddress ? (
                        <>
                          {k.pickupAddress}
                          {k.pickupLandmark ? <span className="text-muted">, {k.pickupLandmark}</span> : null}
                        </>
                      ) : (
                        <span className="text-muted">Not given</span>
                      ),
                    ],
                    [
                      'Map pin',
                      k?.latitude != null && k.longitude != null ? (
                        <ExternalLink href={`https://www.google.com/maps?q=${k.latitude},${k.longitude}`} className="font-medium text-brand-ink hover:underline">
                          Open in Maps
                        </ExternalLink>
                      ) : (
                        <span className="text-muted">Not set</span>
                      ),
                    ],
                    [
                      'Hours',
                      <ul key="hours" className="space-y-0.5">
                        {(k?.hours ?? []).map((h) => (
                          <li key={h}>{h}</li>
                        ))}
                      </ul>,
                    ],
                    [
                      'Orders by',
                      (k?.deliveryModes ?? []).map((m) => MODE_LABEL[m] ?? m).join(', ') +
                        (k?.deliveryModes?.includes('delivery') ? (k.deliveryProvider === 'self' ? ' (kitchen delivers)' : ' (Nuray riders)') : ''),
                    ],
                  ]}
                />
              </Section>

              <Section title="Owner">
                <Facts
                  rows={[
                    ['Name', seller.user.profile?.fullName || <span className="text-muted">Not given</span>],
                    ['Phone', <PhoneText key="phone" phone={seller.user.phone} />],
                    ...(k?.pickupPhone && k.pickupPhone !== seller.user.phone ? ([['Kitchen phone', <PhoneText key="kphone" phone={k.pickupPhone} />]] as Array<[string, ReactNode]>) : []),
                    [
                      'Email',
                      seller.user.email ? (
                        <a href={`mailto:${seller.user.email}`} className="text-brand-ink hover:underline break-all">
                          {seller.user.email}
                        </a>
                      ) : (
                        <span className="text-muted">Not given</span>
                      ),
                    ],
                    ['City', [seller.user.profile?.area, seller.user.profile?.city].filter(Boolean).join(', ') || <span className="text-muted">Not given</span>],
                    ['Joined', formatDate(seller.createdAt)],
                  ]}
                />
              </Section>
            </div>

            <Section
              title="Dishes"
              action={
                seller.productCount > 0 ? (
                  <Link href={`/admin/products?status=all&seller=${seller.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-brand-ink hover:underline">
                    All {seller.productCount} dishes
                  </Link>
                ) : undefined
              }
            >
              {(seller.dishes ?? []).length === 0 ? (
                <p className="text-sm text-muted">No dishes yet. They show up here once the kitchen adds them.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {seller.dishes!.map((d) => {
                    const p = dishPill(d);
                    return (
                      <li key={d.id} className="flex items-center gap-3 py-2">
                        <span className="min-w-0 flex-1 truncate text-ink">{d.name}</span>
                        <span className="tabular-nums text-muted">{formatPrice(d.price)}</span>
                        <StatusPill tone={p.tone}>{p.label}</StatusPill>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Section title="Recent orders">
              {(seller.recentOrders ?? []).length === 0 ? (
                <p className="text-sm text-muted">No orders yet.</p>
              ) : (
                <ul className="divide-y divide-line text-sm">
                  {seller.recentOrders!.map((o) => (
                    <li key={o.id}>
                      <Link href={`/admin/orders/${o.id}`} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-raised">
                        <span className="font-medium text-ink">#{o.orderNumber}</span>
                        <span className="text-muted">{formatDateTime(o.createdAt)}</span>
                        <span className="ms-auto flex items-center gap-3">
                          <span className="tabular-nums text-ink">{formatPrice(o.kitchenTotal)}</span>
                          <StatusPill tone={orderTone(o.orderStatus)}>{ORDER_STATUS_LABEL[o.orderStatus] ?? o.orderStatus}</StatusPill>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-2">
              <Section title="Documents">
                <DocumentList documents={seller.documents ?? []} />
              </Section>
              <Section title="Payout account">
                {payoutRows.length === 0 ? (
                  <p className="text-sm text-muted">No payout account added yet.</p>
                ) : (
                  <Facts rows={payoutRows} />
                )}
              </Section>
            </div>
          </div>
        )}
      </div>
      <RejectReasonModal
        isOpen={rejecting}
        title={`Reject ${seller?.businessName ?? 'this kitchen'}?`}
        description="The kitchen is told the reason. It can fix the application and send it again."
        suggestions={['The photos of the CNIC are unclear', 'The kitchen photos are missing', 'The kitchen location does not match the address', 'The application is incomplete']}
        confirmLabel="Reject application"
        busy={actionLoading}
        onConfirm={handleReject}
        onCancel={() => setRejecting(false)}
      />
    </DashboardLayout>
  );
}
