'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { useShallow } from 'zustand/react/shallow';

function VerifyEmailPendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const t = useT(authMessages);
  const [loading, setLoading] = useState(false);
  
  // Get the next redirect URL (for sellers going to /sellers/register)
  const nextUrl = searchParams.get('next');
  const isRider = user?.userType === 'rider' || user?.user_type === 'rider' || nextUrl === '/riders/dashboard';
  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller' || nextUrl === '/sellers/register';

  useEffect(() => {
    // The first render still sees the signed-out state the server drew: a stored token means the person is signed in and the store
    // has not caught up yet, so only someone with neither is sent to sign in (a reload of this page used to bounce to /login).
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleResendEmail = async () => {
    setLoading(true);
    try {
      await authService.resendVerificationEmail();
      showToast(t('verificationEmailSent'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, t('resendEmailFailed')), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-page">
      <div className="nuray-w-card-sm sm:bg-surface sm:border sm:border-line sm:rounded-[24px] p-2 sm:p-10 text-center">
        <div
          className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center bg-brand-soft text-brand-soft-ink"
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h1
          className="text-[28px] font-extrabold tracking-tight mb-2 leading-tight text-ink"
         
        >
          {t('checkEmail')}
        </h1>
        <p className="text-[15px] mb-3 text-muted">
          {t('sentLinkPrefix')}{' '}
          <strong data-ltr={user?.email ? '' : undefined}>{user?.email || t('yourEmail')}</strong>{t('sentLinkSuffix')}
        </p>
        <p className="text-sm mb-7">
          {t('clickLink')}
        </p>

        {isSeller && (
          <div
            className="rounded-2xl p-4 mb-5 text-start bg-accent-soft"
          >
            <p className="text-sm font-extrabold text-accent-soft-ink">{t('nextStepsSellers')}</p>
            <ol className="text-sm mt-2 space-y-1 list-decimal list-inside text-accent-soft-ink">
              <li>{t('pendingStep1')}</li>
              <li>{t('pendingStep2')}</li>
              <li>{t('pendingStep3')}</li>
              <li>{t('pendingStep4')}</li>
            </ol>
          </div>
        )}

        {isRider && (
          <div
            className="rounded-2xl p-4 mb-5 text-start bg-accent-soft"
          >
            <p className="text-sm font-extrabold text-accent-soft-ink">{t('nextStepsRiders')}</p>
            <ol className="text-sm mt-2 space-y-1 list-decimal list-inside text-accent-soft-ink">
              <li>{t('riderNext1')}</li>
              <li>{t('riderNext2')}</li>
              <li>{t('riderNext3')}</li>
              <li>{t('riderNext4')}</li>
            </ol>
          </div>
        )}

        <div
          className="rounded-2xl p-4 mb-6 text-start bg-raised"
        >
          <p className="text-sm font-extrabold text-ink">{t('didntGetEmail')}</p>
          <ul className="text-sm mt-2 space-y-1 list-disc list-inside text-muted">
            <li>{t('tipSpam')}</li>
            <li>{t('tipAddress')}</li>
            <li>{t('tipWait')}</li>
          </ul>
        </div>

        <div className="space-y-2">
          <Button onClick={handleResendEmail} variant="outline" className="w-full" disabled={loading}>
            {loading ? t('sendingEllipsis') : t('resendVerificationEmail')}
          </Button>
          {isRider ? (
            <Link href="/riders/dashboard">
              <Button variant="dark" className="w-full">
                {t('continueRiderApplication')}
              </Button>
            </Link>
          ) : isSeller ? (
            <Link href="/sellers/register">
              <Button variant="dark" className="w-full">
                {t('continueKitchenRegistration')}
              </Button>
            </Link>
          ) : (
            <Link href="/products">
              <Button variant="primary" className="w-full">{t('browsePlates')}</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingText() {
  const t = useT(authMessages);
  return <p>{t('loading')}</p>;
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-page">
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-16 w-16 border-b-2 border-brand mx-auto mb-4"
            />
            <LoadingText />
          </div>
        </div>
      }
    >
      <VerifyEmailPendingContent />
    </Suspense>
  );
}

