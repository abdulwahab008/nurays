'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { authService } from '@/lib/services/auth.service';
import { useAuthStore } from '@/lib/store/auth-store';

export function EmailVerificationBanner() {
  const router = useRouter();
  const { user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (!user || user.emailVerified || dismissed) {
    return null;
  }

  const handleResend = async () => {
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

  return (
    <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <span className="text-2xl">📧</span>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            Verify Your Email Address
          </h3>
          <p className="mt-1 text-sm text-yellow-700">
            Please verify your email ({user.email}) to activate your account and access all features.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleResend}
              disabled={loading}
              className="text-xs"
            >
              {loading ? 'Sending...' : 'Resend Email'}
            </Button>
            <button
              onClick={() => router.push('/verify-email-pending')}
              className="text-xs text-yellow-800 underline hover:text-yellow-900"
            >
              View Details
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="text-xs text-yellow-600 hover:text-yellow-800 ml-auto"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

