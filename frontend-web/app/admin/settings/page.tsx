'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    platformName: 'Nuray',
    supportEmail: 'support@nuray.pk',
    supportPhone: '+92-300-1234567',
    commissionRate: '15',
    minPayoutAmount: '1000',
  });

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

    loadSettings();
  }, [isAuthenticated, user, router]);

  const loadSettings = async () => {
    try {
      const response = await apiClient.get('/admin/settings');
      if (response.data.success) {
        const s = response.data.data;
        setFormData({
          platformName: s.platformName ?? 'Nuray',
          supportEmail: s.supportEmail ?? '',
          supportPhone: s.supportPhone ?? '',
          commissionRate: String(s.commissionRate ?? 15),
          minPayoutAmount: String(s.minPayoutAmount ?? 1000),
        });
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to load settings', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await apiClient.patch('/admin/settings', {
        platformName: formData.platformName,
        supportEmail: formData.supportEmail,
        supportPhone: formData.supportPhone,
        commissionRate: parseFloat(formData.commissionRate) || 0,
        minPayoutAmount: parseFloat(formData.minPayoutAmount) || 0,
      });
      showToast('Settings updated successfully', 'success');
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
          <p className="text-gray-600 mt-1">Manage platform settings and configuration</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm p-6 space-y-6">
          {/* Platform Settings */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Platform Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Platform Name
                </label>
                <input
                  type="text"
                  value={formData.platformName}
                  onChange={(e) => setFormData({ ...formData, platformName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Support Email
                </label>
                <input
                  type="email"
                  value={formData.supportEmail}
                  onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Support Phone
                </label>
                <input
                  type="text"
                  value={formData.supportPhone}
                  onChange={(e) => setFormData({ ...formData, supportPhone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Commission Settings */}
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-4">Commission Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Commission Rate (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.commissionRate}
                  onChange={(e) => setFormData({ ...formData, commissionRate: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Minimum Payout Amount (PKR)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.minPayoutAmount}
                  onChange={(e) => setFormData({ ...formData, minPayoutAmount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-4 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </UserLayout>
  );
}

