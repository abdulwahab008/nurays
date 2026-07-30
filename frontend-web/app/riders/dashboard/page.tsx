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
};

export default function RiderDashboardPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState<Delivery[]>([]);
  const [mine, setMine] = useState<Delivery[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const loadAll = async () => {
    try {
      setLoading(true);
      const [availableRes, mineRes] = await Promise.all([
        riderService.getAvailableDeliveries(),
        riderService.getMyDeliveries(),
      ]);
      setAvailable(availableRes.data || []);
      setMine(mineRes.data || []);
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to load deliveries', 'error');
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

  if (!isAuthenticated || (user?.user_type !== 'rider' && user?.userType !== 'rider')) {
    return null;
  }

  const activeDeliveries = mine.filter((d) => d.status !== 'delivered');
  const completedDeliveries = mine.filter((d) => d.status === 'delivered');

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
                  ))}
                </div>
              )}
            </section>

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
