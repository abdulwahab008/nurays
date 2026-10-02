'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';

function VerifyEmailPendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const t = useT(authMessages);
  const [loading, setLoading] = useState(false);
  
  // Get the next redirect URL (for sellers going to /sellers/register)
  const nextUrl = searchParams.get('next');
  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller' || nextUrl === '/sellers/register';

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  const handleResendEmail = async () => {
    setLoading(true);
    try {
      await authService.resendVerificationEmail();
      showToast(t('verificationEmailSent'), 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || t('resendEmailFailed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 nuray-bg-cream">
      <div className="nuray-w-card-sm nuray-card p-10 text-center">
        <div
          className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center"
          style={{ background: 'var(--forest-50)', color: 'var(--forest-700)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <h1
          className="font-display italic text-[36px] mb-3 leading-tight"
          style={{ color: 'var(--ink-900)' }}
        >
          {t('checkEmail')}
        </h1>
        <p className="text-[15px] mb-3" style={{ color: 'var(--ink-600)' }}>
          {t('sentLinkPrefix')}{' '}
          <strong style={{ color: 'var(--ink-900)' }} data-ltr={user?.email ? '' : undefined}>{user?.email || t('yourEmail')}</strong>{t('sentLinkSuffix')}
        </p>
        <p className="text-sm mb-7" style={{ color: 'var(--ink-500)' }}>
          {t('clickLink')}
        </p>

        {isSeller && (
          <div
            className="rounded-xl p-4 mb-5 text-start"
            style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-200)' }}
          >
            <p className="eyebrow" style={{ color: 'var(--gold-700)' }}>{t('nextStepsSellers')}</p>
            <ol className="text-sm mt-2 space-y-1 list-decimal list-inside" style={{ color: 'var(--ink-700)' }}>
              <li>{t('pendingStep1')}</li>
              <li>{t('pendingStep2')}</li>
              <li>{t('pendingStep3')}</li>
              <li>{t('pendingStep4')}</li>
            </ol>
          </div>
        )}

        <div
          className="rounded-xl p-4 mb-6 text-start"
          style={{ background: 'var(--cream-100)', border: '1px solid var(--ink-200)' }}
        >
          <p className="eyebrow" style={{ color: 'var(--ink-700)' }}>{t('didntGetEmail')}</p>
          <ul className="text-sm mt-2 space-y-1 list-disc list-inside" style={{ color: 'var(--ink-600)' }}>
            <li>{t('tipSpam')}</li>
            <li>{t('tipAddress')}</li>
            <li>{t('tipWait')}</li>
          </ul>
        </div>

        <div className="space-y-2">
          <Button onClick={handleResendEmail} variant="outline" className="w-full" disabled={loading}>
            {loading ? t('sendingEllipsis') : t('resendVerificationEmail')}
          </Button>
          {isSeller ? (
            <Link href="/sellers/register">
              <Button variant="dark" className="w-full">
                {t('continueKitchenRegistration')}
              </Button>
            </Link>
          ) : (
            <Link href="/products">
              <Button className="w-full">{t('browsePlates')}</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingText() {
  const t = useT(authMessages);
  return <p style={{ color: 'var(--ink-500)' }}>{t('loading')}</p>;
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center nuray-bg-cream">
          <div className="text-center">
            <div
              className="animate-spin rounded-full h-16 w-16 border-b-2 mx-auto mb-4"
              style={{ borderColor: 'var(--forest-500)' }}
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

