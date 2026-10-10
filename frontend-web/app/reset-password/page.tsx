'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { weakPasswordMessage } from '@/lib/password-errors';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { showToast } = useToast();
  const t = useT(authMessages);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      showToast(t('passwordMin6'), 'warning');
      return;
    }
    if (password !== confirm) {
      showToast(t('passwordsNoMatch'), 'warning');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      showToast(t('passwordUpdated'), 'success');
      router.push('/login');
    } catch (err: any) {
      showToast(weakPasswordMessage(err, t) || err?.response?.data?.error?.message || t('resetLinkInvalid'), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-6 flex justify-center">
          <BrandLockup />
        </div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">{t('resetTitle')}</h1>
        {!token ? (
          <p className="text-sm text-slate-600 mt-3">
            {t('resetMissingToken')}{' '}
            <Link href="/forgot-password" className="underline text-emerald-700">
              {t('requestNewOne')}
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('newPassword')}
              required
              className="w-full h-12 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('confirmNewPassword')}
              required
              className="w-full h-12 rounded-lg border border-slate-300 px-3 text-sm"
            />
            <Button type="submit" className="w-full h-12 text-sm font-bold" disabled={loading}>
              {loading ? t('saving') : t('updatePassword')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
