'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore, hasSession } from '@/lib/store/auth-store';
import { apiErrorMessage } from '@/lib/api-client';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { useShallow } from 'zustand/react/shallow';
import { AuthLogo, authColumn, authHeading, authLede, authLink, authLinkButton, authShell } from '@/components/auth/AuthLayout';

function VerifyEmailPendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, logout } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, logout: s.logout })));
  const { showToast } = useToast();
  const t = useT(authMessages);
  const [loading, setLoading] = useState(false);
  // Signing out to fix a mistyped email goes to sign-up, not to the sign-in page the guard below would pick.
  const leaving = useRef(false);
  
  // Get the next redirect URL (for sellers going to /sellers/register)
  const nextUrl = searchParams.get('next');
  const isRider = user?.userType === 'rider' || user?.user_type === 'rider' || nextUrl === '/riders/dashboard';
  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller' || nextUrl === '/sellers/register';

  useEffect(() => {
    // The first render still sees the signed-out state the server drew: a stored token means the person is signed in and the store
    // has not caught up yet, so only someone with neither is sent to sign in (a reload of this page used to bounce to /login).
    if (!leaving.current && !hasSession()) {
      router.replace('/login');
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

  const steps = isSeller
    ? [t('pendingStep2'), t('pendingStep3'), t('pendingStep4')]
    : isRider
      ? [t('riderNext2'), t('riderNext3'), t('riderNext4')]
      : null;

  return (
    <main className={authShell}>
      <div className={authColumn}>
        <AuthLogo />
        <h1 className={`mt-8 ${authHeading}`}>{t('checkEmail')}</h1>
        <p className={authLede}>
          {t('sentLinkPrefix')}{' '}
          <strong className="font-semibold text-ink break-all" data-ltr={user?.email ? '' : undefined}>
            {user?.email || t('yourEmail')}
          </strong>
          {t('sentLinkSuffix')}
        </p>

        {steps && (
          <div className="mt-7">
            <h2 className="text-sm font-semibold text-ink">{t('nextSteps')}</h2>
            <ol className="mt-3 space-y-2.5">
              {steps.map((step, n) => (
                <li key={step} className="flex gap-3 text-sm text-muted">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-raised text-[11px] font-semibold text-ink tabular-nums">
                    {n + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="mt-8">
          {isRider ? (
            <Link href="/riders/dashboard" className={authLinkButton}>
              {t('continueRiderApplication')}
            </Link>
          ) : isSeller ? (
            <Link href="/sellers/register" className={authLinkButton}>
              {t('continueKitchenRegistration')}
            </Link>
          ) : (
            <Link href="/products" className={authLinkButton}>
              {t('browsePlates')}
            </Link>
          )}
        </div>

        <p className="mt-6 text-sm text-muted">
          {t('didntGetEmail')}{' '}
          <button type="button" onClick={handleResendEmail} disabled={loading} className={`${authLink} -my-2.5 inline-block py-2.5 disabled:opacity-50`}>
            {loading ? t('sendingEllipsis') : t('sendAgainLink')}
          </button>
        </p>
        <p className="mt-3 text-sm text-muted">
          {t('wrongEmail')}{' '}
          <button
            type="button"
            onClick={() => {
              leaving.current = true;
              logout();
              router.push('/register');
            }}
            className={`${authLink} -my-2.5 inline-block py-2.5`}
          >
            {t('signOut')}
          </button>
        </p>
      </div>
    </main>
  );
}

function LoadingText() {
  const t = useT(authMessages);
  return <p className="text-sm text-muted">{t('loading')}</p>;
}

export default function VerifyEmailPendingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center gap-3 bg-page">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
          <LoadingText />
        </div>
      }
    >
      <VerifyEmailPendingContent />
    </Suspense>
  );
}

