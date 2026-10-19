'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { checkSettingsForm, type SettingsForm } from '@/lib/admin-settings';
import { useShallow } from 'zustand/react/shallow';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  // The settings as the server holds them. Nothing is shown (and so nothing can be saved) until they have been read: a form
  // that showed made-up values while the read failed would put those values over the real commission and delivery prices.
  const [formData, setFormData] = useState<SettingsForm | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [problem, setProblem] = useState<string | null>(null);

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
      setLoadError(null);
      const response = await apiClient.get('/admin/settings');
      if (!response.data.success || !response.data.data) throw new Error('The settings came back empty');
      const s = response.data.data;
      setFormData({
        platformName: s.platformName ?? 'Nuray',
        supportEmail: s.supportEmail ?? '',
        supportPhone: s.supportPhone ?? '',
        commissionRate: String(s.commissionRate ?? 15),
        minPayoutAmount: String(s.minPayoutAmount ?? 1000),
        deliveryPerKm: String(s.deliveryPerKm ?? 20),
        deliveryIncludedKm: String(s.deliveryIncludedKm ?? 3),
        deliveryMaxKm: String(s.deliveryMaxKm ?? 20),
        deliveryFallbackFee: String(s.deliveryFallbackFee ?? 150),
      });
    } catch (error) {
      setLoadError(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    // Every box is checked before anything is sent: an empty one used to be saved as 0 (a blank commission box meant 0%).
    const checked = checkSettingsForm(formData);
    if (!checked.ok) {
      setProblem(checked.message);
      return;
    }
    try {
      setLoading(true);
      await apiClient.patch('/admin/settings', checked.body);
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

  if (!formData) {
    return (
      <AdminShell>
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
            <p className="text-gray-600 mt-1">Manage platform settings and configuration</p>
          </div>
          {loadError ? (
            <LoadError error={loadError} onRetry={loadSettings} title="We couldn't load the settings" />
          ) : (
            <p className="text-gray-500">Loading…</p>
          )}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Admin Settings</h1>
          <p className="text-gray-600 mt-1">Manage platform settings and configuration</p>
        </div>

        <form onSubmit={handleSubmit} onChange={() => problem && setProblem(null)} noValidate className="bg-white rounded-lg shadow-sm p-6 space-y-6">
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
                <p className="mt-1 text-xs text-gray-500">
                  Applies to kitchens that join after you save. A kitchen already on Nuray keeps the rate it started with.
                </p>
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

          {/* Nuray delivery prices */}
          <div data-testid="delivery-pricing">
            <h2 className="text-xl font-bold text-gray-900 mb-1">Nuray delivery prices</h2>
            <p className="text-sm text-gray-500 mb-4">
              Charged when a Nuray rider delivers. Within a community the fee is fixed: set it for each community on the{' '}
              <Link href="/admin/communities" className="underline">Communities</Link> page. To another community it&apos;s
              that community&apos;s &quot;to other communities&quot; base fee plus the rate below for every km beyond the included
              distance, rounded up to Rs 10. Kitchens that deliver themselves charge their own fees.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  ['deliveryPerKm', 'Per km to another community (Rs)', '1'],
                  ['deliveryIncludedKm', 'Km included in the base fee', '0.5'],
                  ['deliveryMaxKm', 'Farthest a Nuray rider delivers (km)', '1'],
                  ['deliveryFallbackFee', "Base fee when a kitchen's community isn't known (Rs)", '1'],
                ] as const
              ).map(([key, label, step]) => (
                <div key={key}>
                  <label htmlFor={key} className="block text-sm font-medium text-gray-700 mb-2">{label}</label>
                  <input
                    id={key}
                    type="number"
                    min="0"
                    step={step}
                    value={formData[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Example: base Rs 150, Rs {formData.deliveryPerKm || 0}/km after {formData.deliveryIncludedKm || 0} km, a 6 km trip ={' '}
              Rs {Math.ceil((150 + Math.max(0, 6 - (parseFloat(formData.deliveryIncludedKm) || 0)) * (parseFloat(formData.deliveryPerKm) || 0)) / 10) * 10}.
            </p>
          </div>

          {problem && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              {problem}
            </p>
          )}
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
    </AdminShell>
  );
}

