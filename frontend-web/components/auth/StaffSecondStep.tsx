'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiClient, apiErrorCode, apiErrorMessage } from '@/lib/api-client';
import type { User } from '@/lib/store/auth-store';
import { useT } from '@/lib/i18n';
import { authMessages } from '@/lib/i18n/messages/auth';
import { authFieldError, authHeading, authInput, authLabel, authLede, authLink, authSubmit } from './AuthLayout';

/** What a finished staff sign-in answers: the account and its tokens. */
export interface StaffSignIn {
  user: User & { permissions?: string[] };
  tokens: { access_token: string; refresh_token: string };
  backupCodesLeft?: number;
  usedBackupCode?: boolean;
}

/** The secret in groups of four, as people type it into an authenticator app. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/**
 * The second step of a staff sign-in (SEC-3). `mode` comes from the sign-in's answer:
 *  - code:  enter the six-digit code from the authenticator app, or a backup code
 *  - setup: two-step sign-in is required and not set up yet: add the account to an authenticator app, confirm with
 *           a first code, and keep the ten backup codes shown once
 * `onDone` gets the finished sign-in; `onRestart` goes back to the password (the challenge lasts minutes).
 */
export function StaffSecondStep({
  mode,
  challengeToken,
  onDone,
  onRestart,
}: {
  mode: 'code' | 'setup';
  challengeToken: string;
  onDone: (result: StaffSignIn) => void;
  onRestart: (message: string) => void;
}) {
  const t = useT(authMessages);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [backup, setBackup] = useState<{ codes: string[]; result: StaffSignIn } | null>(null);

  const expiredOr = (err: unknown, fallback: string) => {
    if (apiErrorCode(err) === 'CHALLENGE_EXPIRED') {
      onRestart(t('staffExpired'));
      return null;
    }
    return apiErrorMessage(err, fallback);
  };

  useEffect(() => {
    if (mode !== 'setup') return;
    let cancelled = false;
    apiClient
      .post<{ data: { secret: string; otpauthUrl: string } }>('/auth/2fa/setup', { challengeToken })
      .then((res) => !cancelled && setSetup(res.data.data))
      .catch((err: unknown) => {
        const message = expiredOr(err, t('staffSetupFailed'));
        if (!cancelled && message) setError(message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one set-up per challenge
  }, [mode, challengeToken]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'code') {
        const res = await apiClient.post<{ data: StaffSignIn }>('/auth/2fa/verify', { challengeToken, code: code.trim() });
        onDone(res.data.data);
      } else {
        const res = await apiClient.post<{ data: StaffSignIn & { backupCodes: string[] } }>('/auth/2fa/setup/confirm', { challengeToken, code: code.trim() });
        const { backupCodes, ...result } = res.data.data;
        setBackup({ codes: backupCodes, result });
      }
    } catch (err: unknown) {
      const message = expiredOr(err, t('staffCodeFailed'));
      if (message) setError(message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (backup) {
    return (
      <div className="space-y-5" data-testid="backup-codes">
        <div>
          <h2 className={authHeading}>{t('staffBackupTitle')}</h2>
          <p className={authLede}>{t('staffBackupBody')}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" dir="ltr">
          {backup.codes.map((c) => (
            <li key={c} className="rounded-lg bg-raised px-3 py-2 text-center text-ink">{c}</li>
          ))}
        </ul>
        <Button className={authSubmit} onClick={() => onDone(backup.result)} data-testid="backup-codes-saved">
          {t('staffBackupSaved')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" data-testid={`second-step-${mode}`}>
      {mode === 'code' ? (
        <div>
          <h2 className={authHeading}>{t('staffCodeTitle')}</h2>
          <p className={authLede}>{t('staffCodeBody')}</p>
        </div>
      ) : (
        <div>
          <h2 className={authHeading}>{t('staffSetupTitle')}</h2>
          <p className={authLede}>{t('staffSetupBody')}</p>
          <ol className="mt-5 list-decimal space-y-3 ps-5 text-sm text-muted">
            <li>
              {t('staffSetupStep1')}
              <p className="mt-2 break-all rounded-lg bg-raised px-3 py-2.5 font-mono text-sm text-ink" dir="ltr" data-testid="setup-key">
                {setup ? grouped(setup.secret) : '…'}
              </p>
              {setup && (
                <a href={setup.otpauthUrl} className={`${authLink} -my-1 inline-flex min-h-11 items-center`}>
                  {t('staffOpenInApp')}
                </a>
              )}
            </li>
            <li>{t('staffSetupStep2')}</li>
          </ol>
        </div>
      )}

      <div>
        <label htmlFor="second-step-code" className={authLabel}>
          {mode === 'code' ? t('staffCodeLabel') : t('staffSetupCodeLabel')}
        </label>
        <input
          id="second-step-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={mode === 'setup' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          maxLength={mode === 'setup' ? 6 : 12}
          dir="ltr"
          enterKeyHint="go"
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'second-step-error' : undefined}
          className={`${authInput} font-mono tracking-wider`}
          placeholder="000000"
        />
        {error && (
          <p id="second-step-error" role="alert" className={authFieldError}>
            {error}
          </p>
        )}
      </div>
      <Button type="submit" disabled={busy || !code.trim() || (mode === 'setup' && !setup)} className={authSubmit}>
        {busy ? t('verifying') : mode === 'code' ? t('login') : t('staffTurnOn')}
      </Button>
      <button type="button" onClick={() => onRestart('')} className={`${authLink} inline-flex min-h-11 items-center text-sm`}>
        {t('staffBack')}
      </button>
    </form>
  );
}
