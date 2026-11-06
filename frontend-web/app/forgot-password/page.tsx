'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { AuthLogo, authColumn, authFieldError, authHeading, authInput, authLabel, authLede, authLink, authShell, authSubmit } from '@/components/auth/AuthLayout';
import { useT } from '@/lib/i18n';
import { useRequestErrorMessage } from '@/components/ui/LoadError';
import { authMessages } from '@/lib/i18n/messages/auth';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();
  const t = useT(authMessages);
  const requestError = useRequestErrorMessage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = !email.trim() ? t('errEnterEmail') : !/^\S+@\S+\.\S+$/.test(email.trim()) ? t('errEmailInvalid') : '';
    setFieldError(problem);
    if (problem) {
      document.getElementById('forgot-email')?.focus();
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/forgot-password', { email: email.trim() });
      // The server answers the same whether or not the account exists.
      setSent(true);
    } catch (err) {
      showToast(requestError(err, t('errResetEmail')), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={authShell}>
      <div className={authColumn}>
        <AuthLogo />
        <h1 className={`mt-8 ${authHeading}`}>{sent ? t('checkEmail') : t('forgotTitle')}</h1>
        {sent ? (
          <p className={authLede} role="status">
            {t('forgotSentPrefix')} <strong className="font-semibold text-ink break-all" data-ltr>{email.trim()}</strong>
            {t('forgotSentSuffix')}
          </p>
        ) : (
          <>
            <p className={authLede}>{t('forgotIntro')}</p>
            <form onSubmit={handleSubmit} noValidate className="mt-7 space-y-5">
              <div>
                <label htmlFor="forgot-email" className={authLabel}>
                  {t('emailAddress')}
                </label>
                <input
                  type="email"
                  id="forgot-email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFieldError('');
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="send"
                  dir="ltr"
                  required
                  aria-invalid={fieldError ? true : undefined}
                  aria-describedby={fieldError ? 'forgot-email-error' : undefined}
                  className={authInput}
                />
                {fieldError && (
                  <p id="forgot-email-error" role="alert" className={authFieldError}>
                    {fieldError}
                  </p>
                )}
              </div>
              <Button type="submit" className={authSubmit} disabled={loading}>
                {loading ? t('sendingEllipsis') : t('sendResetLink')}
              </Button>
            </form>
          </>
        )}
        <p className="mt-8 text-sm text-muted">
          {t('rememberedIt')}{' '}
          <Link href="/login" className={`${authLink} -my-2.5 inline-block py-2.5`}>
            {t('signInLink')}
          </Link>
        </p>
      </div>
    </main>
  );
}
