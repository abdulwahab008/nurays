'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

interface CategoryRequest {
  id: string;
  sellerId: string;
  productType: string;
  name: string;
  nameUrdu?: string;
  description?: string;
  parentCategoryId?: string;
  status: string;
  adminNotes?: string;
  createdAt: string;
  updatedAt: string;
  seller?: {
    id: string;
    businessName: string;
    user?: {
      name: string;
      email: string;
    };
  };
  parentCategory?: {
    id: string;
    name: string;
  };
}

const sidebarItems = [
  { name: 'Dashboard', href: '/admin/dashboard', icon: '' },
  { name: 'Orders', href: '/admin/orders', icon: '' },
  { name: 'Products', href: '/admin/products', icon: '' },
  { name: 'Categories', href: '/admin/categories', icon: '' },
  { name: 'Category Requests', href: '/admin/category-requests', icon: '' },
  { name: 'Sellers', href: '/admin/sellers', icon: '' },
  { name: 'Pending Sellers', href: '/admin/pending-sellers', icon: '' },
  { name: 'Analytics', href: '/admin/analytics', icon: '' },
  { name: 'Settings', href: '/admin/settings', icon: '' },
];

const productTypeLabels: Record<string, { label: string; icon: string; color: string }> = {
  frozen: { label: 'Frozen', icon: '❄️', color: 'blue' },
  fresh: { label: 'Fresh', icon: '🥬', color: 'green' },
  ready_to_eat: { label: 'Ready to Eat', icon: '🍽️', color: 'orange' },
  ready_to_cook: { label: 'Ready to Cook', icon: '🍳', color: 'purple' },
};

const statusStyles: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  category_created: 'bg-blue-100 text-blue-800',
};

export default function CategoryRequestsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();

  const [requests, setRequests] = useState<CategoryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [selectedRequest, setSelectedRequest] = useState<CategoryRequest | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    if (user?.userType !== 'admin' && user?.user_type !== 'admin') {
      router.push('/dashboard');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }

    loadRequests();
  }, [isAuthenticated, user, router, filter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const response = await apiClient.get(`/category-requests${params}`);
      if (response.data.success) {
        setRequests(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load requests:', error);
      showToast('Failed to load category requests', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (request: CategoryRequest) => {
    setActionLoading(true);
    try {
      const response = await apiClient.post(`/category-requests/${request.id}/approve`);
      if (response.data.success) {
        showToast('Category request approved and category created!', 'success');
        loadRequests();
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Failed to approve request';
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !rejectReason.trim()) {
      showToast('Please provide a rejection reason', 'error');
      return;
    }

    setActionLoading(true);
    try {
      const response = await apiClient.post(`/category-requests/${selectedRequest.id}/reject`, {
        reason: rejectReason.trim(),
      });
      if (response.data.success) {
        showToast('Category request rejected', 'success');
        setShowRejectModal(false);
        setSelectedRequest(null);
        setRejectReason('');
        loadRequests();
      }
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Failed to reject request';
      showToast(message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const openRejectModal = (request: CategoryRequest) => {
    setSelectedRequest(request);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <DashboardLayout sidebarItems={sidebarItems} title="Category Requests" userType="admin">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Category Requests</h1>
          <p className="text-gray-500 mt-1">Review and manage category requests from sellers</p>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
          {[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'all', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                filter === tab.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Requests List */}
        {loading ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading requests...</span>
            </div>
          </div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
            <div className="text-5xl mb-4">📭</div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No requests found</h3>
            <p className="text-gray-500">
              {filter === 'pending'
                ? 'No pending category requests at the moment'
                : `No ${filter} requests to show`}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((request) => {
              const typeInfo = productTypeLabels[request.productType] || {
                label: request.productType,
                icon: '📦',
                color: 'gray',
              };

              return (
                <div
                  key={request.id}
                  className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    {/* Left: Request Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-2xl">{typeInfo.icon}</span>
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900">{request.name}</h3>
                          {request.nameUrdu && (
                            <p className="text-gray-500 text-sm" dir="rtl">
                              {request.nameUrdu}
                            </p>
                          )}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusStyles[request.status] || 'bg-gray-100 text-gray-800'}`}>
                          {request.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Product Type</span>
                          <p className="font-medium text-gray-900">{typeInfo.label}</p>
                        </div>
                        <div>
                          <span className="text-gray-500">Category Type</span>
                          <p className="font-medium text-gray-900">
                            {request.parentCategoryId ? 'Subcategory' : 'Main Category'}
                          </p>
                        </div>
                        {request.parentCategory && (
                          <div>
                            <span className="text-gray-500">Parent Category</span>
                            <p className="font-medium text-gray-900">{request.parentCategory.name}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Requested</span>
                          <p className="font-medium text-gray-900">{formatDate(request.createdAt)}</p>
                        </div>
                      </div>

                      {request.description && (
                        <div className="mt-3 p-3 bg-gray-50 rounded-xl">
                          <span className="text-xs text-gray-500 block mb-1">Description</span>
                          <p className="text-sm text-gray-700">{request.description}</p>
                        </div>
                      )}

                      {/* Seller Info */}
                      <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
                        <span>👨‍🍳</span>
                        <span>
                          Requested by{' '}
                          <span className="font-medium text-gray-700">
                            {request.seller?.businessName || 'Unknown Seller'}
                          </span>
                          {request.seller?.user?.email && (
                            <span className="text-gray-400"> ({request.seller.user.email})</span>
                          )}
                        </span>
                      </div>

                      {/* Admin Notes (if rejected) */}
                      {request.status === 'rejected' && request.adminNotes && (
                        <div className="mt-3 p-3 bg-red-50 rounded-xl border border-red-100">
                          <span className="text-xs text-red-600 block mb-1">Rejection Reason</span>
                          <p className="text-sm text-red-700">{request.adminNotes}</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    {request.status === 'pending' && (
                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          onClick={() => handleApprove(request)}
                          disabled={actionLoading}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2"
                        >
                          ✓ Approve
                        </Button>
                        <Button
                          onClick={() => openRejectModal(request)}
                          disabled={actionLoading}
                          variant="outline"
                          className="border-red-300 text-red-600 hover:bg-red-50 px-4 py-2"
                        >
                          ✕ Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Reject Modal */}
        {showRejectModal && selectedRequest && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-xl font-bold text-gray-900">Reject Category Request</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Rejecting: <span className="font-medium">{selectedRequest.name}</span>
                </p>
              </div>

              <div className="p-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Rejection Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this category request is being rejected..."
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
                />
                <p className="text-xs text-gray-400 mt-2">
                  This message will be visible to the seller.
                </p>
              </div>

              <div className="p-6 border-t border-gray-100 flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowRejectModal(false);
                    setSelectedRequest(null);
                    setRejectReason('');
                  }}
                  className="flex-1"
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleReject}
                  disabled={actionLoading || !rejectReason.trim()}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                >
                  {actionLoading ? 'Rejecting...' : 'Reject Request'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
