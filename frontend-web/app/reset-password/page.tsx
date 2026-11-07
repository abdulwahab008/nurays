'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { AuthLogo, PasswordInput, authColumn, authFieldError, authHeading, authHelper, authInput, authLabel, authLede, authLink, authLinkButton, authShell, authSubmit, focusNextOnEnter } from '@/components/auth/AuthLayout';
import { useT } from '@/lib/i18n';
import { useLoadFailureMessage } from '@/components/ui/LoadError';
import { classifyLoadFailure } from '@/lib/load-error';
import { authMessages } from '@/lib/i18n/messages/auth';
import { weakPasswordMessage } from '@/lib/password-errors';

const PASSWORD_RULES = { passwordrules: 'minlength: 8;' };
type Problem = { field: 'new-password' | 'confirm-password' | 'link' | 'network'; message: string };

function ResetForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const { showToast } = useToast();
  const t = useT(authMessages);
  const failureMessage = useLoadFailureMessage();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (password.length < 8) {
      setProblem({ field: 'new-password', message: t('passwordMin6') });
      document.getElementById('new-password')?.focus();
      return;
    }
    if (password !== confirm) {
      setProblem({ field: 'confirm-password', message: t('passwordsNoMatch') });
      document.getElementById('confirm-password')?.focus();
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/reset-password', { token, password });
      showToast(t('passwordUpdated'), 'success');
      router.push('/login');
    } catch (err) {
      const weak = weakPasswordMessage(err, t);
      const kind = classifyLoadFailure(err);
      if (weak) {
        setProblem({ field: 'new-password', message: weak });
      } else if (kind === 'offline' || kind === 'busy' || kind === 'server') {
        const message = failureMessage(err);
        showToast(message, 'error');
        setProblem({ field: 'network', message });
      } else {
        // Any refusal here is about the link (expired, used, cut short): the server's own wording is not for people.
        setProblem({ field: 'link', message: t('resetLinkInvalid') });
      }
    } finally {
      setLoading(false);
    }
  };

  const longEnough = password.length >= 8;
  const errorFor = (field: 'new-password' | 'confirm-password') =>
    problem?.field === field ? (
      <p id={`${field}-error`} role="alert" className={authFieldError}>
        {problem.message}
      </p>
    ) : null;

  return (
    <main className={authShell}>
      <div className={authColumn}>
        <AuthLogo />
        {!token ? (
          <>
            <h1 className={`mt-8 ${authHeading}`}>{t('verificationFailed')}</h1>
            <p className={authLede}>{t('resetMissingToken')}</p>
            <Link href="/forgot-password" className={`mt-8 ${authLinkButton}`}>
              {t('requestNewOne')}
            </Link>
          </>
        ) : (
          <>
            <h1 className={`mt-8 ${authHeading}`}>{t('resetTitle')}</h1>
            <p className={authLede}>{t('resetIntro')}</p>
            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label htmlFor="new-password" className={authLabel}>
                  {t('newPassword')}
                </label>
                <PasswordInput
                  id="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  enterKeyHint="next"
                  required
                  showLabel={t('showPassword')}
                  hideLabel={t('hidePassword')}
                  aria-invalid={problem?.field === 'new-password' || undefined}
                  aria-describedby={problem?.field === 'new-password' ? 'new-password-error' : 'new-password-rule'}
                  {...PASSWORD_RULES}
                  {...focusNextOnEnter('confirm-password')}
                />
                {errorFor('new-password') ?? (
                  <p id="new-password-rule" className={`${authHelper} flex items-center gap-1.5 ${longEnough ? 'text-brand-ink' : ''}`}>
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={longEnough ? '' : 'opacity-40'}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t('passwordRule')}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="confirm-password" className={authLabel}>
                  {t('confirmNewPassword')}
                </label>
                <input
                  type="password"
                  id="confirm-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  enterKeyHint="done"
                  required
                  aria-invalid={problem?.field === 'confirm-password' || undefined}
                  aria-describedby={problem?.field === 'confirm-password' ? 'confirm-password-error' : undefined}
                  className={authInput}
                  {...PASSWORD_RULES}
                />
                {errorFor('confirm-password')}
              </div>
              {(problem?.field === 'link' || problem?.field === 'network') && (
                <p role="alert" className="text-sm text-red-700">
                  {problem.message}
                  {problem.field === 'link' && (
                    <>
                      {' '}
                      <Link href="/forgot-password" className={authLink}>
                        {t('requestNewOne')}
                      </Link>
                    </>
                  )}
                </p>
              )}
              <Button type="submit" className={authSubmit} disabled={loading}>
                {loading ? t('saving') : t('updatePassword')}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
