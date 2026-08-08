'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

interface PendingRider {
  id: string;
  city: string;
  vehicleType: string | null;
  vehicleNumber: string | null;
  licenseNumber: string | null;
  user: {
    id: string;
    phone: string;
    email: string | null;
    profile: { fullName: string; city: string | null } | null;
  } | null;
  createdAt: string;
}

export default function AdminRidersPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [riders, setRiders] = useState<PendingRider[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    loadRiders();
  }, [isAuthenticated, user, router]);

  const loadRiders = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/admin/pending-riders');
      if (response.data.success) {
        setRiders(response.data.data || []);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to load pending riders', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (riderId: string) => {
    try {
      setBusyId(riderId);
      await apiClient.post(`/admin/riders/${riderId}/approve`, { approved: true });
      showToast('Rider approved', 'success');
      setRiders((prev) => prev.filter((r) => r.id !== riderId));
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to approve rider', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (riderId: string) => {
    const reason = window.prompt('Reason for rejecting this rider application (optional):') || undefined;
    try {
      setBusyId(riderId);
      await apiClient.post(`/admin/riders/${riderId}/reject`, { approved: false, reason });
      showToast('Rider rejected', 'success');
      setRiders((prev) => prev.filter((r) => r.id !== riderId));
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to reject rider', 'error');
    } finally {
      setBusyId(null);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Pending Riders</h1>
            <p className="text-gray-600 mt-1">
              A rider can't see or claim any delivery until approved here.
            </p>
          </div>
          <Button variant="outline" onClick={loadRiders} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading pending riders...</p>
          </div>
        ) : riders.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No riders awaiting approval</h3>
            <p className="text-gray-600">New rider applications will show up here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {riders.map((rider) => (
              <div key={rider.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {rider.user?.profile?.fullName || 'Unknown applicant'}
                      </h3>
                      <span className="px-2 py-1 text-xs font-medium rounded bg-yellow-100 text-yellow-800">
                        Pending
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{rider.user?.phone || '—'}</span></div>
                      <div><span className="text-gray-500">Email:</span> <span className="font-medium">{rider.user?.email || '—'}</span></div>
                      <div><span className="text-gray-500">City:</span> <span className="font-medium">{rider.city}</span></div>
                      <div><span className="text-gray-500">Vehicle:</span> <span className="font-medium">{rider.vehicleType || 'Not provided'} {rider.vehicleNumber || ''}</span></div>
                      <div><span className="text-gray-500">Applied:</span> <span className="font-medium">{new Date(rider.createdAt).toLocaleDateString()}</span></div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleApprove(rider.id)}
                      disabled={busyId === rider.id}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      {busyId === rider.id ? 'Working...' : 'Approve'}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleReject(rider.id)}
                      disabled={busyId === rider.id}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
}
