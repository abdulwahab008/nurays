'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user, setUser } = useAuthStore();
  const { showToast } = useToast();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error' | 'expired'>('verifying');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  
  const isSeller = user?.userType === 'seller' || user?.user_type === 'seller';

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setError('No verification token provided');
      setLoading(false);
      return;
    }

    verifyEmail(token);
  }, [searchParams]);

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
    } catch (err: any) {
      const errorCode = err.response?.data?.error?.code;
      if (errorCode === 'TOKEN_EXPIRED') {
        setStatus('expired');
      } else {
        setStatus('error');
        setError(err.response?.data?.error?.message || 'Verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendEmail = async () => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    try {
      await apiClient.post('/auth/resend-verification');
      showToast('Verification email sent! Please check your inbox.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to resend email', 'error');
    }
  };

  const headingClass = 'font-display italic text-[36px] mb-3 leading-tight';
  const bodyClass = 'text-[15px] mb-6';

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 nuray-bg-cream">
      <div className="nuray-w-card-sm nuray-card p-10 text-center">
        {status === 'verifying' && (
          <>
            <div
              className="animate-spin rounded-full h-14 w-14 border-b-2 mx-auto mb-6"
              style={{ borderColor: 'var(--forest-500)' }}
            />
            <h1 className={headingClass} style={{ color: 'var(--ink-900)' }}>
              Verifying your email
            </h1>
            <p className={bodyClass} style={{ color: 'var(--ink-500)' }}>
              One moment…
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center"
              style={{ background: 'var(--forest-50)', color: 'var(--forest-700)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className={headingClass} style={{ color: 'var(--ink-900)' }}>
              Welcome to Nuray.
            </h1>
            <p className={bodyClass} style={{ color: 'var(--ink-500)' }}>
              {isSeller
                ? 'Your email is verified. Complete your kitchen profile to start selling.'
                : 'Your email is verified. The taste of home, delivered cold.'}
            </p>
            {isSeller ? (
              <Link href="/sellers/register">
                <Button size="lg" className="w-full" variant="dark">
                  Complete kitchen profile
                </Button>
              </Link>
            ) : (
              <Link href="/products">
                <Button size="lg" className="w-full">
                  Browse today&apos;s plates
                </Button>
              </Link>
            )}
          </>
        )}

        {status === 'error' && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center"
              style={{ background: 'var(--anar-50)', color: 'var(--anar-600)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <h1 className={headingClass} style={{ color: 'var(--ink-900)' }}>
              Verification failed.
            </h1>
            <p className={bodyClass} style={{ color: 'var(--ink-500)' }}>
              {error}
            </p>
            {isAuthenticated ? (
              <div className="space-y-2">
                <Button onClick={handleResendEmail} variant="outline" className="w-full">
                  Resend verification email
                </Button>
                <Link href="/products">
                  <Button className="w-full">Continue to Nuray</Button>
                </Link>
              </div>
            ) : (
              <Link href="/login">
                <Button className="w-full">Sign in</Button>
              </Link>
            )}
          </>
        )}

        {status === 'expired' && (
          <>
            <div
              className="mx-auto mb-6 w-14 h-14 rounded-full grid place-items-center"
              style={{ background: 'var(--gold-50)', color: 'var(--gold-600)' }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h1 className={headingClass} style={{ color: 'var(--ink-900)' }}>
              Link expired.
            </h1>
            <p className={bodyClass} style={{ color: 'var(--ink-500)' }}>
              This verification link is no longer valid. Request a new one.
            </p>
            {isAuthenticated ? (
              <Button onClick={handleResendEmail} className="w-full" size="lg">
                Resend verification email
              </Button>
            ) : (
              <Link href="/login">
                <Button className="w-full" size="lg">
                  Sign in to resend
                </Button>
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

