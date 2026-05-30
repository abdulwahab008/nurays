'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { NurayButton as Button } from '@/components/ui/NurayButton';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';

function VerifyEmailPendingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
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
      showToast('Verification email sent! Please check your inbox.', 'success');
    } catch (err: any) {
      showToast(err.response?.data?.error?.message || 'Failed to resend email', 'error');
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
          Check your email.
        </h1>
        <p className="text-[15px] mb-3" style={{ color: 'var(--ink-600)' }}>
          We've sent a verification link to{' '}
          <strong style={{ color: 'var(--ink-900)' }}>{user?.email || 'your email'}</strong>.
        </p>
        <p className="text-sm mb-7" style={{ color: 'var(--ink-500)' }}>
          Click the link to activate your account. It expires in 24 hours.
        </p>

        {isSeller && (
          <div
            className="rounded-xl p-4 mb-5 text-left"
            style={{ background: 'var(--gold-50)', border: '1px solid var(--gold-200)' }}
          >
            <p className="eyebrow" style={{ color: 'var(--gold-700)' }}>Next steps for sellers</p>
            <ol className="text-sm mt-2 space-y-1 list-decimal list-inside" style={{ color: 'var(--ink-700)' }}>
              <li>Verify your email by clicking the link</li>
              <li>Complete your kitchen profile</li>
              <li>Upload CNIC and kitchen photos for verification</li>
              <li>Start listing your dishes</li>
            </ol>
          </div>
        )}

        <div
          className="rounded-xl p-4 mb-6 text-left"
          style={{ background: 'var(--cream-100)', border: '1px solid var(--ink-200)' }}
        >
          <p className="eyebrow" style={{ color: 'var(--ink-700)' }}>Didn't get the email?</p>
          <ul className="text-sm mt-2 space-y-1 list-disc list-inside" style={{ color: 'var(--ink-600)' }}>
            <li>Check your spam folder</li>
            <li>Confirm the email address is correct</li>
            <li>Wait a couple of minutes, then resend</li>
          </ul>
        </div>

        <div className="space-y-2">
          <Button onClick={handleResendEmail} variant="outline" className="w-full" disabled={loading}>
            {loading ? 'Sending…' : 'Resend verification email'}
          </Button>
          {isSeller ? (
            <Link href="/sellers/register">
              <Button variant="dark" className="w-full">
                Continue to kitchen registration
              </Button>
            </Link>
          ) : (
            <Link href="/products">
              <Button className="w-full">Browse today's plates</Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
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
            <p style={{ color: 'var(--ink-500)' }}>Loading…</p>
          </div>
        </div>
      }
    >
      <VerifyEmailPendingContent />
    </Suspense>
  );
}

