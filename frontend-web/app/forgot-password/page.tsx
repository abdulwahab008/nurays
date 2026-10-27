'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { BrandLockup } from '@/components/ui/Mark';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const t = useT(authMessages);
  const requestError = useRequestErrorMessage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() });
      // The server answers the same whether or not the account exists.
      setSent(true);
    } catch (err) {
      showToast(requestError(err, t('errResetEmail')), 'error');
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
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight text-ink mb-1">{t('forgotTitle')}</h1>
        {sent ? (
          <>
            <p className="text-sm text-muted mt-3">
              {t('forgotSentPrefix')} <strong data-ltr>{email}</strong>{t('forgotSentSuffix')}
            </p>
            <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-brand-soft-ink underline">
              {t('backToLogin')}
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 mt-3">
            <p className="text-sm text-muted">{t('forgotIntro')}</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              dir="ltr"
              required
              className="nuray-input"
            />
            <Button variant="primary" type="submit" className="w-full h-12 text-[15px] font-extrabold" disabled={loading}>
              {loading ? t('sendingEllipsis') : t('sendResetLink')}
            </Button>
            <Link href="/login" className="block text-center text-sm text-muted underline">
              {t('backToLogin')}
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
