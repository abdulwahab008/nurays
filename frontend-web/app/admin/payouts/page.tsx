'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice, formatDate } from '@/lib/utils';

interface Payout {
  id: string;
  seller: { id: string; businessName: string };
  amount: number;
  netAmount: number;
  payoutMethod: string;
  accountDetails: { accountNumber?: string } | null;
  status: string;
  failedReason?: string;
  requestedAt: string;
  processedAt?: string;
}

const FILTERS = ['pending', 'completed', 'failed', 'all'] as const;

export default function AdminPayoutsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [failReasonFor, setFailReasonFor] = useState<string | null>(null);
  const [failReason, setFailReason] = useState('');

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
    loadPayouts();
  }, [isAuthenticated, user, router, filter]);

  const loadPayouts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/payouts${filter !== 'all' ? `?status=${filter}` : ''}`);
      if (response.data.success) {
        setPayouts(response.data.data.payouts || []);
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to load payouts', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (payoutId: string) => {
    try {
      setProcessingId(payoutId);
      await apiClient.post(`/admin/payouts/${payoutId}/complete`, {});
      showToast('Payout marked as completed', 'success');
      loadPayouts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to complete payout', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleFail = async (payoutId: string) => {
    if (failReason.trim().length < 1) {
      showToast('Please enter a reason', 'warning');
      return;
    }
    try {
      setProcessingId(payoutId);
      await apiClient.post(`/admin/payouts/${payoutId}/fail`, { reason: failReason.trim() });
      showToast('Payout marked as failed', 'success');
      setFailReasonFor(null);
      setFailReason('');
      loadPayouts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update payout', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const statusColor = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Seller Payouts</h1>
            <p className="text-gray-600 mt-1">Review and process seller payout requests</p>
          </div>
          <Button variant="outline" onClick={loadPayouts} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        <div className="flex gap-2 mb-6">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading payouts...</p>
          </div>
        ) : payouts.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No {filter !== 'all' ? filter : ''} payouts</h3>
            <p className="text-gray-600">Nothing to show here right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {payouts.map((payout) => (
              <div key={payout.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="flex-1 min-w-[240px]">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{payout.seller.businessName}</h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${statusColor(payout.status)}`}>
                        {payout.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                      <div><span className="text-gray-500">Requested:</span> <span className="font-medium">{formatPrice(payout.amount)}</span></div>
                      <div><span className="text-gray-500">Net payout:</span> <span className="font-medium">{formatPrice(payout.netAmount)}</span></div>
                      <div><span className="text-gray-500">Method:</span> <span className="font-medium capitalize">{payout.payoutMethod.replace('_', ' ')}</span></div>
                      <div><span className="text-gray-500">Account:</span> <span className="font-medium">{payout.accountDetails?.accountNumber || '—'}</span></div>
                      <div><span className="text-gray-500">Requested at:</span> <span className="font-medium">{formatDate(payout.requestedAt)}</span></div>
                      {payout.processedAt && (
                        <div><span className="text-gray-500">Processed at:</span> <span className="font-medium">{formatDate(payout.processedAt)}</span></div>
                      )}
                      {payout.failedReason && (
                        <div className="md:col-span-2"><span className="text-gray-500">Failure reason:</span> <span className="font-medium text-red-600">{payout.failedReason}</span></div>
                      )}
                    </div>
                  </div>

                  {payout.status === 'pending' && (
                    <div className="flex flex-col gap-2 items-end">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleComplete(payout.id)}
                          disabled={processingId === payout.id}
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          {processingId === payout.id ? 'Processing...' : 'Mark Completed'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setFailReasonFor(failReasonFor === payout.id ? null : payout.id)}
                          disabled={processingId === payout.id}
                          className="border-red-300 text-red-600 hover:bg-red-50"
                        >
                          Mark Failed
                        </Button>
                      </div>
                      {failReasonFor === payout.id && (
                        <div className="flex gap-2 items-center mt-1">
                          <input
                            type="text"
                            value={failReason}
                            onChange={(e) => setFailReason(e.target.value)}
                            placeholder="Reason for failure"
                            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                          />
                          <button
                            onClick={() => handleFail(payout.id)}
                            className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700"
                          >
                            Confirm
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
}
