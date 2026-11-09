'use client';

import { useState } from 'react';
import { Check, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { PasswordCard } from '@/components/profile/PasswordCard';
import { SessionsCard } from '@/components/profile/SessionsCard';
import { TwoFactorCard } from '@/components/profile/TwoFactorCard';
import { apiErrorMessage } from '@/lib/api-client';
import { authService } from '@/lib/services/auth.service';
import type { UserProfile } from '@/lib/services/user-profile.service';
import { useAuthStore } from '@/lib/store/auth-store';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

/** Password, signed-in devices, two-step sign-in for staff, and whether the e-mail address is verified. */
export function AccountSecuritySection({ profile }: { profile: UserProfile }) {
  const t = useT(accountMessages);
  const { showToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const [sendingVerification, setSendingVerification] = useState(false);

  // The account's e-mail address is only trusted once its owner has clicked the link sent to it.
  const sendVerificationLink = async () => {
    setSendingVerification(true);
    try {
      await authService.resendVerificationEmail();
      showToast(t('verificationEmailSent'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, t('verificationEmailFailed')), 'error');
    } finally {
      setSendingVerification(false);
    }
  };

  return (
    <div className="bg-surface rounded-[20px] border border-line p-6">
      <h2 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
        <Lock className="w-5 h-5 text-ink" /> {t('accountSecurity')}
      </h2>
      <div className="space-y-3">
        <PasswordCard hasPassword={profile.hasPassword !== false} email={profile.email} emailVerified={!!profile.emailVerified} />
        <SessionsCard />
        {(user?.userType ?? user?.user_type) === 'admin' && <TwoFactorCard />}
        {profile.email && (
          <div className="flex items-center justify-between gap-3 p-4 bg-raised rounded-xl" data-testid="email-verification">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 shrink-0 bg-brand-soft rounded-xl flex items-center justify-center text-brand-soft-ink">
                <Mail className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p className="font-medium text-ink">{t('emailVerification')}</p>
                <p className="text-xs text-muted">
                  {profile.emailVerified ? t('emailIsVerified') : t('verifyEmailAddress')}
                </p>
              </div>
            </div>
            {!profile.emailVerified && (
              <Button variant="outline" size="sm" className="shrink-0" disabled={sendingVerification} onClick={sendVerificationLink} data-testid="send-verification">
                {sendingVerification ? t('sending') : t('verify')}
              </Button>
            )}
            {profile.emailVerified && (
              <span className="text-brand-ink font-bold text-sm flex items-center gap-1 shrink-0">
                <Check className="w-4 h-4" /> {t('verified')}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
