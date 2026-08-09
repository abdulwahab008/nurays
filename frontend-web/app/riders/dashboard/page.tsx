'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { riderService, Delivery } from '@/lib/services/rider.service';

const NEXT_STATUS: Record<string, { next: 'picked_up' | 'in_transit' | 'delivered'; label: string }> = {
  assigned: { next: 'picked_up', label: 'Mark Picked Up' },
  picked_up: { next: 'in_transit', label: 'Mark In Transit' },
  in_transit: { next: 'delivered', label: 'Mark Delivered' },
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Unclaimed',
  assigned: 'Assigned',
  picked_up: 'Picked Up',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  delivery_failed: 'Delivery Failed',
};

// A rider holding the goods (picked_up/in_transit) can report a failed
// delivery instead of completing it — admin resolves it from there.
const CAN_REPORT_FAILURE = new Set(['picked_up', 'in_transit']);

export default function RiderDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<Delivery[]>([]);
  const [mine, setMine] = useState<Delivery[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<{ title: string; message: string } | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    if (user?.user_type !== 'rider' && user?.userType !== 'rider') {
      router.push('/products');
      showToast('Access denied. Rider account required.', 'error');
      return;
    }
    loadAll();
  }, [isAuthenticated, user, router]);

  const BLOCKED_REASONS: Record<string, { title: string; message: string }> = {
    RIDER_NOT_APPROVED: {
      title: 'Application under review',
      message: "Your rider account is pending admin approval. You'll be able to see and claim deliveries once it's approved.",
    },
    RIDER_REJECTED: {
      title: 'Application not approved',
      message: 'Your rider application was not approved. Contact support if you think this is a mistake.',
    },
    RIDER_SUSPENDED: {
      title: 'Account suspended',
      message: 'Your rider account has been suspended. Contact support for more information.',
    },
  };

  const loadAll = async () => {
    try {
      setLoading(true);
      setBlockedReason(null);
      const [availableRes, mineRes] = await Promise.all([
        riderService.getAvailableDeliveries(),
        riderService.getMyDeliveries(),
      ]);
      setAvailable(availableRes.data || []);
      setMine(mineRes.data || []);
    } catch (error: any) {
      const code = error.response?.data?.error?.code;
      if (code && BLOCKED_REASONS[code]) {
        setBlockedReason(BLOCKED_REASONS[code]);
      } else {
        showToast(error.response?.data?.error?.message || 'Failed to load deliveries', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async (deliveryId: string) => {
    try {
      setBusyId(deliveryId);
      await riderService.claimDelivery(deliveryId);
      showToast('Delivery claimed', 'success');
      loadAll();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to claim delivery', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleAdvance = async (delivery: Delivery) => {
    const step = NEXT_STATUS[delivery.status];
    if (!step) return;
    try {
      setBusyId(delivery.id);
      await riderService.updateDeliveryStatus(delivery.id, step.next);
      showToast(`Marked as ${STATUS_LABEL[step.next]}`, 'success');
      loadAll();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update status', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReportFailure = async (delivery: Delivery) => {
    const reason = window.prompt("What went wrong? (e.g. customer unreachable, wrong address, refused delivery)");
    if (!reason || !reason.trim()) return;
    try {
      setBusyId(delivery.id);
      await riderService.updateDeliveryStatus(delivery.id, 'delivery_failed', reason.trim());
      showToast('Delivery reported as failed', 'success');
      loadAll();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to report delivery', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'rider' && user?.userType !== 'rider')) {
    return null;
  }

  const activeDeliveries = mine.filter((d) => d.status !== 'delivered' && d.status !== 'delivery_failed');
  const completedDeliveries = mine.filter((d) => d.status === 'delivered');
  const failedDeliveries = mine.filter((d) => d.status === 'delivery_failed');

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Rider Dashboard</h1>
            <p className="text-gray-600 mt-1">Claim deliveries and track your active runs</p>
          </div>
          <Button variant="outline" onClick={loadAll} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading deliveries...</p>
          </div>
        ) : blockedReason ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">⏳</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{blockedReason.title}</h2>
            <p className="text-gray-600 max-w-md mx-auto">{blockedReason.message}</p>
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">My Active Deliveries</h2>
              {activeDeliveries.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-600">
                  No active deliveries. Claim one from the pool below.
                </div>
              ) : (
                <div className="space-y-3">
                  {activeDeliveries.map((d) => (
                    <div key={d.id} className="bg-white border border-gray-200 rounded-lg p-5 flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900">Order #{d.orderNumber}</span>
                          <span className="px-2 py-0.5 text-xs font-medium rounded bg-orange-100 text-orange-800">
                            {STATUS_LABEL[d.status]}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">Pickup: {d.pickupAddress}</p>
                        <p className="text-sm text-gray-600">Deliver to: {d.deliveryAddress}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {CAN_REPORT_FAILURE.has(d.status) && (
                          <Button
                            variant="outline"
                            onClick={() => handleReportFailure(d)}
                            disabled={busyId === d.id}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            Report Failed
                          </Button>
                        )}
                        {NEXT_STATUS[d.status] && (
                          <Button
                            onClick={() => handleAdvance(d)}
                            disabled={busyId === d.id}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {busyId === d.id ? 'Updating...' : NEXT_STATUS[d.status].label}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {failedDeliveries.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Failed Deliveries</h2>
                <div className="space-y-2">
                  {failedDeliveries.map((d) => (
                    <div key={d.id} className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between text-sm">
                      <span>Order #{d.orderNumber} — {d.deliveryAddress}</span>
                      <span className="text-red-700 font-medium">Awaiting admin review</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Available Deliveries</h2>
              {available.length === 0 ? (
                <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-600">
                  No unclaimed deliveries right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {available.map((d) => (
                    <div key={d.id} className="bg-white border border-gray-200 rounded-lg p-5 flex items-start justify-between flex-wrap gap-4">
                      <div>
                        <span className="font-semibold text-gray-900">Order #{d.orderNumber}</span>
                        <p className="text-sm text-gray-600">Pickup: {d.pickupAddress}</p>
                        <p className="text-sm text-gray-600">Deliver to: {d.deliveryAddress}</p>
                      </div>
                      <Button
                        onClick={() => handleClaim(d.id)}
                        disabled={busyId === d.id}
                        className="bg-gray-900 hover:bg-gray-800 text-white"
                      >
                        {busyId === d.id ? 'Claiming...' : 'Claim'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {completedDeliveries.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Completed</h2>
                <div className="space-y-2">
                  {completedDeliveries.map((d) => (
                    <div key={d.id} className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between text-sm text-gray-600">
                      <span>Order #{d.orderNumber} — {d.deliveryAddress}</span>
                      <span className="text-green-700 font-medium">Delivered</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </UserLayout>
  );
}
