'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';

interface SellerDetail {
  id: string;
  businessName: string;
  businessNameUrdu?: string;
  description?: string;
  kitchenVideoUrl?: string;
  coverImageUrl?: string;
  verificationStatus: string;
  status: string;
  rejectionReason?: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  productCount: number;
  user: {
    id: string;
    email: string;
    phone: string;
    profile?: {
      fullName: string;
      city?: string;
      area?: string;
    } | null;
  };
}

export default function AdminSellerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<SellerDetail | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

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
    if (id) loadSeller();
  }, [isAuthenticated, user, id, router]);

  const loadSeller = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/sellers/${id}`);
      if (response.data.success) {
        setSeller(response.data.data);
      } else {
        setSeller(null);
      }
    } catch (error: any) {
      console.error('Failed to load seller:', error);
      if (error.response?.status === 404) {
        showToast('Seller not found', 'error');
      } else {
        showToast('Failed to load seller details', 'error');
      }
      setSeller(null);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/sellers/${id}/approve`, { approved: true });
      showToast('Seller approved successfully', 'success');
      loadSeller();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to approve', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    const reason = window.prompt('Rejection reason (optional):');
    if (reason === null) return; // user cancelled
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/sellers/${id}/reject`, { approved: false, notes: reason || undefined });
      showToast('Seller rejected', 'success');
      loadSeller();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to reject', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleSuspend = async () => {
    if (!seller) return;
    const nextStatus = seller.status === 'suspended' ? 'active' : 'suspended';
    if (nextStatus === 'suspended' && !window.confirm('Suspend this seller? Their storefront will be hidden from customers.')) {
      return;
    }
    try {
      setActionLoading(true);
      await apiClient.post(`/admin/sellers/${id}/status`, { status: nextStatus });
      showToast(nextStatus === 'suspended' ? 'Seller suspended' : 'Seller reactivated', 'success');
      loadSeller();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update seller status', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    const map: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
      active: 'bg-blue-100 text-blue-800',
      inactive: 'bg-gray-100 text-gray-800',
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <Link
            href="/admin/sellers"
            className="text-green-600 hover:text-green-700 text-sm font-medium mb-2 inline-block"
          >
            ← Back to All Sellers
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading seller...</p>
          </div>
        ) : !seller ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Seller not found</h3>
            <Link href="/admin/sellers">
              <Button variant="outline">Back to Sellers</Button>
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{seller.businessName}</h1>
                  {seller.businessNameUrdu && (
                    <p className="text-gray-500 mt-1">{seller.businessNameUrdu}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(seller.verificationStatus)}`}>
                      {seller.verificationStatus}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(seller.status)}`}>
                      {seller.status}
                    </span>
                  </div>
                </div>
                {seller.verificationStatus === 'pending' && (
                  <div className="flex gap-2">
                    <Button
                      onClick={handleApprove}
                      disabled={actionLoading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleReject}
                      disabled={actionLoading}
                      className="border-red-300 text-red-700 hover:bg-red-50"
                    >
                      Reject
                    </Button>
                  </div>
                )}
                {seller.verificationStatus === 'approved' && (
                  <Button
                    variant="outline"
                    onClick={handleToggleSuspend}
                    disabled={actionLoading}
                    className={seller.status === 'suspended'
                      ? 'border-green-300 text-green-700 hover:bg-green-50'
                      : 'border-red-300 text-red-700 hover:bg-red-50'}
                  >
                    {seller.status === 'suspended' ? 'Reactivate Seller' : 'Suspend Seller'}
                  </Button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Contact</h2>
                <p className="text-gray-900">Email: {seller.user.email}</p>
                <p className="text-gray-900">Phone: {seller.user.phone}</p>
                {seller.user.profile?.fullName && (
                  <p className="text-gray-900">Name: {seller.user.profile.fullName}</p>
                )}
                {(seller.user.profile?.city || seller.user.profile?.area) && (
                  <p className="text-gray-900">
                    Location: {[seller.user.profile.city, seller.user.profile.area].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>

              {seller.description && (
                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Description</h2>
                  <p className="text-gray-700 whitespace-pre-wrap">{seller.description}</p>
                </div>
              )}

              {seller.rejectionReason && (
                <div>
                  <h2 className="text-sm font-medium text-gray-500 uppercase mb-2">Rejection reason</h2>
                  <p className="text-red-700">{seller.rejectionReason}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Products</span>
                  <p className="font-medium text-gray-900">{seller.productCount}</p>
                </div>
                <div>
                  <span className="text-gray-500">Joined</span>
                  <p className="font-medium text-gray-900">{formatDate(seller.createdAt)}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </UserLayout>
  );
}
