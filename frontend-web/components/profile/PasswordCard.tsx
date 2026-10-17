'use client';

import { useState } from 'react';
import { Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { authService } from '@/lib/services/auth.service';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { authMessages } from '@/lib/i18n/messages/auth';
import { commonMessages } from '@/lib/i18n/messages/common';
import { weakPasswordMessage } from '@/lib/password-errors';

const apiCode = (err: unknown) => (err as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;

const inputClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-orange-500 focus:outline-none';

/**
 * The password row of the profile's security card. A person who has a password changes it here (the current one,
 * then the new one twice): every other device is signed out and this one is handed new tokens, so nobody has to sign
 * in again. An account that only signs in with Google has no password to change; it can ask for an e-mailed link
 * to set one, which goes only to an address its owner has proven.
 */
export function PasswordCard({ hasPassword, email, emailVerified }: { hasPassword: boolean; email?: string | null; emailVerified: boolean }) {
  const t = useT(accountMessages);
  const ta = useT(authMessages);
  const tc = useT(commonMessages);
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setCurrent('');
    setNext('');
    setAgain('');
    setProblem(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setProblem(ta('passwordMin6'));
    if (next !== again) return setProblem(ta('passwordsNoMatch'));
    setBusy(true);
    setProblem(null);
    try {
      const res = await authService.changePassword(current, next);
      const tokens = res.data?.tokens;
      // The server ended every older session, this one included: carry on with the tokens it handed back.
      if (tokens) apiClient.setTokens(tokens.access_token, tokens.refresh_token);
      showToast(t('passwordChanged'), 'success');
      close();
    } catch (err) {
      const code = apiCode(err);
      setProblem(
        weakPasswordMessage(err, ta) ||
          (code === 'INVALID_PASSWORD' ? t('wrongCurrentPassword') : code === 'PASSWORD_UNCHANGED' ? t('passwordSame') : apiErrorMessage(err, t('passwordChangeFailed')))
      );
    } finally {
      setBusy(false);
    }
  };

  const sendSetLink = async () => {
    if (!email) return;
    setBusy(true);
    try {
      await authService.forgotPassword(email);
      showToast(t('setPasswordLinkSent'), 'success');
    } catch (err) {
      showToast(apiErrorMessage(err, t('passwordChangeFailed')), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-xl" data-testid="password-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
            <Key className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900">{t('password')}</p>
            <p className="text-xs text-gray-500">{hasPassword ? t('passwordDesc') : t('passwordGoogleOnly')}</p>
          </div>
        </div>
        {hasPassword && !open && (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)} data-testid="change-password-open">
            {t('change')}
          </Button>
        )}
        {!hasPassword && email && emailVerified && (
          <Button variant="outline" size="sm" className="shrink-0" disabled={busy} onClick={sendSetLink} data-testid="set-password-link">
            {t('sendSetPasswordLink')}
          </Button>
        )}
      </div>
      {!hasPassword && !(email && emailVerified) && <p className="text-xs text-gray-500 mt-3">{t('verifyEmailFirst')}</p>}

      {hasPassword && open && (
        <form onSubmit={submit} className="mt-4 space-y-3" data-testid="change-password-form">
          <div>
            <label htmlFor="current-password" className="block text-xs font-medium text-gray-700 mb-1">{t('currentPassword')}</label>
            <input id="current-password" type="password" autoComplete="current-password" required dir="ltr" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="new-password" className="block text-xs font-medium text-gray-700 mb-1">{ta('newPassword')}</label>
            <input id="new-password" type="password" autoComplete="new-password" required dir="ltr" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-xs font-medium text-gray-700 mb-1">{t('confirmNewPassword')}</label>
            <input id="confirm-password" type="password" autoComplete="new-password" required dir="ltr" value={again} onChange={(e) => setAgain(e.target.value)} className={inputClass} />
          </div>
          {problem && (
            <p role="alert" className="text-sm text-red-600" data-testid="change-password-problem">
              {problem}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={busy || !current || !next || !again} data-testid="change-password-submit">
              {busy ? tc('saving') : t('changePassword')}
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>
              {tc('cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
