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
import { AuthLogo, authColumn, authHeading, authLede, authLinkButton, authShell, authSubmit } from '@/components/auth/AuthLayout';

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
        setError(t('verificationFailedMsg'));
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

  return (
    <main className={authShell}>
      <div className={authColumn} aria-live="polite">
        <AuthLogo />
        {status === 'verifying' && (
          <>
            <div className="mt-8 flex items-center gap-3">
              <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-line-strong border-t-brand" aria-hidden="true" />
              <h1 className={authHeading}>{t('verifyingEmail')}</h1>
            </div>
            <p className={authLede}>{t('oneMoment')}</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className={`mt-8 ${authHeading}`}>{t('welcomeToNuray')}</h1>
            <p className={authLede}>{isSeller ? t('verifiedSeller') : t('verifiedCustomer')}</p>
            <div className="mt-8">
              {isSeller ? (
                <Link href="/sellers/register" className={authLinkButton}>
                  {t('completeKitchenProfile')}
                </Link>
              ) : (
                <Link href="/products" className={authLinkButton}>
                  {t('browsePlates')}
                </Link>
              )}
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className={`mt-8 ${authHeading}`}>{t('verificationFailed')}</h1>
            <p className={authLede}>{error}</p>
            <div className="mt-8 space-y-3">
              {isAuthenticated ? (
                <>
                  <Link href="/products" className={authLinkButton}>
                    {t('continueToNuray')}
                  </Link>
                  <Button onClick={handleResendEmail} variant="outline" className="h-12 w-full">
                    {t('resendVerificationEmail')}
                  </Button>
                </>
              ) : (
                <Link href="/login" className={authLinkButton}>
                  {t('signIn')}
                </Link>
              )}
            </div>
          </>
        )}

        {status === 'expired' && (
          <>
            <h1 className={`mt-8 ${authHeading}`}>{t('linkExpired')}</h1>
            <p className={authLede}>{t('linkExpiredBody')}</p>
            <div className="mt-8">
              {isAuthenticated ? (
                <Button onClick={handleResendEmail} className={authSubmit}>
                  {t('resendVerificationEmail')}
                </Button>
              ) : (
                <Link href="/login" className={authLinkButton}>
                  {t('signInToResend')}
                </Link>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function LoadingText() {
  const t = useT(authMessages);
  return <p className="text-sm text-muted">{t('loading')}</p>;
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center gap-3 bg-page">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-brand" />
        <LoadingText />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

