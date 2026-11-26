'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LoadingLine, PageHeader } from '@/components/admin/AdminListParts';
import { AdminShell } from '@/components/layout/AdminShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { LoadError } from '@/components/ui/LoadError';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
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
        payoutHolidays: Array.isArray(s.payoutHolidays) ? s.payoutHolidays.join('\n') : '',
        depositBankName: s.nurayDepositAccounts?.bankName ?? '',
        depositBankTitle: s.nurayDepositAccounts?.bankAccountTitle ?? '',
        depositBankNumber: s.nurayDepositAccounts?.bankAccountNumber ?? '',
        depositJazzcashTitle: s.nurayDepositAccounts?.jazzcashTitle ?? '',
        depositJazzcashNumber: s.nurayDepositAccounts?.jazzcashNumber ?? '',
        depositEasypaisaTitle: s.nurayDepositAccounts?.easypaisaTitle ?? '',
        depositEasypaisaNumber: s.nurayDepositAccounts?.easypaisaNumber ?? '',
      });
    } catch (error) {
      setLoadError(error);
    }
  };

  // Only the super admin may change these (settings.write); everyone else with access reads them.
  const canEdit = !!user?.permissions?.includes('settings.write');

  useEffect(() => {
    if (isAuthenticated) loadSettings();
  }, [isAuthenticated]);

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
    } catch (error) {
      showToast(apiErrorMessage(error, 'Failed to update settings'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!formData) {
    return (
      <AdminShell>
        <div className="max-w-4xl">
          <PageHeader title="Settings" subtitle="Platform details, commission and Nuray delivery prices." />
          {loadError ? (
            <LoadError error={loadError} onRetry={loadSettings} title="We couldn't load the settings" />
          ) : (
            <LoadingLine text="Loading the settings" />
          )}
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="max-w-4xl">
        <PageHeader title="Settings" subtitle="Platform details, commission and Nuray delivery prices." />

        {!canEdit && (
          <p className="mb-4 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-soft-ink" data-testid="settings-read-only">
            Only the super admin can change these settings.
          </p>
        )}
        <form onSubmit={handleSubmit} onChange={() => problem && setProblem(null)} noValidate className="bg-surface border border-line rounded-2xl p-4 sm:p-6 space-y-6">
          <fieldset disabled={!canEdit} className="space-y-6 min-w-0">
          {/* Platform Settings */}
          <div>
            <h2 className="text-base font-semibold text-ink mb-4">Platform</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="platformName" className="block text-sm font-medium text-ink mb-2">
                  Platform name
                </label>
                <input
                  id="platformName"
                  type="text"
                  value={formData.platformName}
                  onChange={(e) => setFormData({ ...formData, platformName: e.target.value })}
                  className="nuray-input w-full"
                />
              </div>
              <div>
                <label htmlFor="supportEmail" className="block text-sm font-medium text-ink mb-2">
                  Support email
                </label>
                <input
                  id="supportEmail"
                  type="email"
                  value={formData.supportEmail}
                  onChange={(e) => setFormData({ ...formData, supportEmail: e.target.value })}
                  className="nuray-input w-full"
                />
              </div>
              <div>
                <label htmlFor="supportPhone" className="block text-sm font-medium text-ink mb-2">
                  Support phone
                </label>
                <input
                  id="supportPhone"
                  type="text"
                  value={formData.supportPhone}
                  onChange={(e) => setFormData({ ...formData, supportPhone: e.target.value })}
                  className="nuray-input w-full"
                />
              </div>
            </div>
          </div>

          {/* Commission Settings */}
          <div>
            <h2 className="text-base font-semibold text-ink mb-4">Commission and payouts</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="commissionRate" className="block text-sm font-medium text-ink mb-2">
                  Commission rate (%)
                </label>
                <input
                  id="commissionRate"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.commissionRate}
                  onChange={(e) => setFormData({ ...formData, commissionRate: e.target.value })}
                  className="nuray-input w-full"
                />
                <p className="mt-1 text-xs text-muted">
                  Applies to kitchens that join after you save. A kitchen already on Nuray keeps the rate it started with.
                </p>
              </div>
              <div>
                <label htmlFor="minPayoutAmount" className="block text-sm font-medium text-ink mb-2">
                  Minimum payout (Rs)
                </label>
                <input
                  id="minPayoutAmount"
                  type="number"
                  min="0"
                  value={formData.minPayoutAmount}
                  onChange={(e) => setFormData({ ...formData, minPayoutAmount: e.target.value })}
                  className="nuray-input w-full"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="payoutHolidays" className="block text-sm font-medium text-ink mb-2">
                  Payout holidays
                </label>
                <textarea
                  id="payoutHolidays"
                  rows={3}
                  value={formData.payoutHolidays}
                  onChange={(e) => setFormData({ ...formData, payoutHolidays: e.target.value })}
                  placeholder={'2026-12-25\n2027-02-05'}
                  aria-describedby="payoutHolidays-hint"
                  className="nuray-input w-full"
                />
                <p id="payoutHolidays-hint" className="mt-1 text-xs text-muted">
                  Kitchens are paid every working day, Monday to Friday, for their orders up to the day before. List public holidays here,
                  one date per line (YYYY-MM-DD): no payouts are made that day, and the next working day covers it.
                </p>
              </div>
            </div>
          </div>

          {/* Nuray's accounts for rider deposits */}
          <div data-testid="deposit-accounts">
            <h2 className="text-base font-semibold text-ink mb-1">Nuray&apos;s accounts for deposits</h2>
            <p className="text-sm text-muted mb-4">
              Riders deposit the customer cash they collect into these accounts and send the receipt, which you check under Cash deposits.
              Leave a number empty to not offer that method.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="depositJazzcashNumber" className="block text-sm font-medium text-ink mb-2">JazzCash number</label>
                <input id="depositJazzcashNumber" value={formData.depositJazzcashNumber} onChange={(e) => setFormData({ ...formData, depositJazzcashNumber: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
              <div>
                <label htmlFor="depositJazzcashTitle" className="block text-sm font-medium text-ink mb-2">JazzCash account title</label>
                <input id="depositJazzcashTitle" value={formData.depositJazzcashTitle} onChange={(e) => setFormData({ ...formData, depositJazzcashTitle: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
              <div>
                <label htmlFor="depositEasypaisaNumber" className="block text-sm font-medium text-ink mb-2">EasyPaisa number</label>
                <input id="depositEasypaisaNumber" value={formData.depositEasypaisaNumber} onChange={(e) => setFormData({ ...formData, depositEasypaisaNumber: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
              <div>
                <label htmlFor="depositEasypaisaTitle" className="block text-sm font-medium text-ink mb-2">EasyPaisa account title</label>
                <input id="depositEasypaisaTitle" value={formData.depositEasypaisaTitle} onChange={(e) => setFormData({ ...formData, depositEasypaisaTitle: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
              <div>
                <label htmlFor="depositBankName" className="block text-sm font-medium text-ink mb-2">Bank name</label>
                <input id="depositBankName" value={formData.depositBankName} onChange={(e) => setFormData({ ...formData, depositBankName: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
              <div>
                <label htmlFor="depositBankTitle" className="block text-sm font-medium text-ink mb-2">Bank account title</label>
                <input id="depositBankTitle" value={formData.depositBankTitle} onChange={(e) => setFormData({ ...formData, depositBankTitle: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
              <div>
                <label htmlFor="depositBankNumber" className="block text-sm font-medium text-ink mb-2">Bank account number or IBAN</label>
                <input id="depositBankNumber" value={formData.depositBankNumber} onChange={(e) => setFormData({ ...formData, depositBankNumber: e.target.value })} className="nuray-input w-full" dir="ltr" />
              </div>
            </div>
          </div>

          {/* Nuray delivery prices */}
          <div data-testid="delivery-pricing">
            <h2 className="text-base font-semibold text-ink mb-1">Nuray delivery prices</h2>
            <p className="text-sm text-muted">
              Charged when a Nuray rider delivers. Within a community the fee is fixed and set for each community. To another
              community it&apos;s that community&apos;s &quot;to other communities&quot; base fee plus the rate below for every km beyond
              the included distance, rounded up to Rs 10. Kitchens that deliver themselves charge their own fees.
            </p>
            <Link href="/admin/communities" className="mb-2 inline-flex min-h-11 items-center text-sm font-medium text-brand-ink hover:underline">
              Set the fee inside each community
            </Link>
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
                  <label htmlFor={key} className="block text-sm font-medium text-ink mb-2">{label}</label>
                  <input
                    id={key}
                    type="number"
                    min="0"
                    step={step}
                    value={formData[key]}
                    onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                    className="nuray-input w-full"
                  />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-3">
              Example: base Rs 150, Rs {formData.deliveryPerKm || 0}/km after {formData.deliveryIncludedKm || 0} km, a 6 km trip ={' '}
              Rs {Math.ceil((150 + Math.max(0, 6 - (parseFloat(formData.deliveryIncludedKm) || 0)) * (parseFloat(formData.deliveryPerKm) || 0)) / 10) * 10}.
            </p>
          </div>

          </fieldset>
          {problem && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {problem}
            </p>
          )}
          {canEdit && (
            <div className="flex justify-end gap-3 pt-4 border-t border-line">
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          )}
        </form>
      </div>
    </AdminShell>
  );
}

