'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage, apiErrorCode } from '@/lib/api-client';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { useShallow } from 'zustand/react/shallow';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, setUser } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user, setUser: s.setUser })));
  const { showToast } = useToast();
  const t = useT(authMessages);
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller';

  const verifyEmail = async (token: string) => {
    try {
      await authService.verifyEmail(token);
      setStatus('success');
      // Update user in store if authenticated
      if (isAuthenticated) {
        // Refresh user data to update emailVerified status
        try {
          const userResponse = await apiClient.get('/auth/me');
          if (userResponse.data?.data) {
            setUser(userResponse.data.data);
          }
        } catch (e) {
          // Ignore error refreshing user
        }
      }
    } catch (err) {
      const errorCode = apiErrorCode(err);
      if (errorCode === 'TOKEN_EXPIRED') {
        setStatus('expired');
      } else {
        setStatus('error');
        setError(apiErrorMessage(err, t('verificationFailedMsg')));
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError(t('noToken'));
      setLoading(false);
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

  const handleResendEmail = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    try {
      await apiClient.post('/auth/resend-verification');
      showToast(t('verificationEmailSent'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, t('resendEmailFailed')), 'error');
    }
  };

  const headingClass = 'text-[28px] font-extrabold tracking-tight mb-2 leading-tight text-ink';
  const bodyClass = 'text-[15px] mb-6 text-muted';

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-page">
      <div className="nuray-w-card-sm sm:bg-surface sm:border sm:border-line sm:rounded-[24px] p-2 sm:p-10 text-center">
        {status === 'verifying' && (
          <>
            <div
              className="animate-spin rounded-full h-14 w-14 border-b-2 border-brand mx-auto mb-6"
            />
            <h1 className={headingClass}>
              {t('verifyingEmail')}
            </h1>
            <p className={bodyClass}>
              {t('oneMoment')}
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center bg-brand-soft text-brand-soft-ink"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className={headingClass}>
              {t('welcomeToNuray')}
            </h1>
            <p className={bodyClass}>
              {isSeller
                ? t('verifiedSeller')
                : t('verifiedCustomer')}
            </p>
            {isSeller ? (
              <Link href="/sellers/register">
                <Button size="lg" className="w-full" variant="dark">
                  {t('completeKitchenProfile')}
                </Button>
              </Link>
            ) : (
              <Link href="/products">
                <Button variant="primary" size="lg" className="w-full">
                  {t('browsePlates')}
                </Button>
              </Link>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center bg-red-50 text-red-700"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className={headingClass}>
              {t('verificationFailed')}
            </h1>
            <p className={bodyClass}>
              {error}
            </p>
            {isAuthenticated ? (
              <div className="space-y-2">
                <Button onClick={handleResendEmail} variant="outline" className="w-full">
                  {t('resendVerificationEmail')}
                </Button>
                <Link href="/products">
                  <Button variant="primary" className="w-full">{t('continueToNuray')}</Button>
                </Link>
              </div>
            ) : (
              <Link href="/login">
                <Button variant="primary" className="w-full">{t('signIn')}</Button>
              </Link>
            )}
          </>
        )}

        {status === 'expired' && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center bg-accent-soft text-accent-soft-ink"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h1 className={headingClass}>
              {t('linkExpired')}
            </h1>
            <p className={bodyClass}>
              {t('linkExpiredBody')}
            </p>
            {isAuthenticated ? (
              <Button variant="primary" onClick={handleResendEmail} className="w-full" size="lg">
                {t('resendVerificationEmail')}
              </Button>
            ) : (
              <Link href="/login">
                <Button variant="primary" className="w-full" size="lg">
                  {t('signInToResend')}
                </Button>
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function LoadingText() {
  const t = useT(authMessages);
  return <p className="text-muted">{t('loadingDots')}</p>;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-raised">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-brand mx-auto mb-4"></div>
          <LoadingText />
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

