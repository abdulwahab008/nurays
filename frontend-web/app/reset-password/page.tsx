'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';
import { weakPasswordMessage } from '@/lib/password-errors';

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { showToast } = useToast();
  const t = useT(authMessages);
  const requestError = useRequestErrorMessage();
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
    } catch (err) {
      showToast(weakPasswordMessage(err, t) || requestError(err, t('resetLinkInvalid')), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-md sm:bg-surface sm:rounded-[24px] sm:border sm:border-line p-2 sm:p-10">
        <div className="mb-6 flex justify-center">
          <BrandLockup />
        </div>
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink mb-1">{t('resetTitle')}</h1>
        {!token ? (
          <p className="text-sm text-muted mt-3">
            {t('resetMissingToken')}{' '}
            <Link href="/forgot-password" className="underline text-brand-soft-ink">
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
              className="nuray-input"
            />
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={t('confirmNewPassword')}
              required
              className="nuray-input"
            />
            <Button variant="primary" type="submit" className="w-full h-12 text-[15px] font-extrabold" disabled={loading}>
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
