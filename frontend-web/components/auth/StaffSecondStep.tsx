'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiClient, apiErrorCode, apiErrorMessage } from '@/lib/api-client';
import type { User } from '@/lib/store/auth-store';

/** What a finished staff sign-in answers: the account and its tokens. */
export interface StaffSignIn {
  user: User & { permissions?: string[] };
  tokens: { access_token: string; refresh_token: string };
  backupCodesLeft?: number;
  usedBackupCode?: boolean;
}

const inputClass = 'w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500';

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
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [backup, setBackup] = useState<{ codes: string[]; result: StaffSignIn } | null>(null);

  const expiredOr = (err: unknown, fallback: string) => {
    if (apiErrorCode(err) === 'CHALLENGE_EXPIRED') {
      onRestart('That took too long. Enter your password again.');
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
        const message = expiredOr(err, 'Could not start the set-up.');
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
      const message = expiredOr(err, 'That code did not work.');
      if (message) setError(message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  if (backup) {
    return (
      <div className="space-y-4" data-testid="backup-codes">
        <h2 className="text-lg font-bold text-gray-900">Save your backup codes</h2>
        <p className="text-sm text-gray-700">
          Each one signs you in once if you lose your phone. They are shown only now: write them down or keep them in a password manager.
        </p>
        <ul className="grid grid-cols-2 gap-2 font-mono text-sm" dir="ltr">
          {backup.codes.map((c) => (
            <li key={c} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-center">{c}</li>
          ))}
        </ul>
        <Button className="w-full bg-green-700 hover:bg-green-800 text-white" onClick={() => onDone(backup.result)} data-testid="backup-codes-saved">
          I have saved them
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" data-testid={`second-step-${mode}`}>
      {mode === 'code' ? (
        <div>
          <h2 className="text-lg font-bold text-gray-900">Two-step sign-in</h2>
          <p className="text-sm text-gray-700 mt-1">Enter the six-digit code from your authenticator app. Lost your phone? Enter one of your backup codes instead.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">Set up two-step sign-in</h2>
          <p className="text-sm text-gray-700">
            Staff accounts need a code from an authenticator app (Google Authenticator, Microsoft Authenticator or similar) at every sign-in.
          </p>
          <ol className="list-decimal ps-5 text-sm text-gray-700 space-y-2">
            <li>
              On your phone, add an account in the app. On the phone itself you can{' '}
              {setup ? (
                <a href={setup.otpauthUrl} className="text-green-700 underline font-medium">open it in the app</a>
              ) : (
                'open it in the app'
              )}
              ; otherwise choose &quot;enter a setup key&quot; and type this key:
            </li>
          </ol>
          <p className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 font-mono text-sm break-all" dir="ltr" data-testid="setup-key">
            {setup ? grouped(setup.secret) : '…'}
          </p>
          <ol start={2} className="list-decimal ps-5 text-sm text-gray-700">
            <li>Enter the six-digit code the app now shows.</li>
          </ol>
        </div>
      )}

      {error && <div role="alert" className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}

      <div>
        <label htmlFor="second-step-code" className="block text-sm font-medium text-gray-700 mb-2">
          {mode === 'code' ? 'Code or backup code' : 'Code from the app'}
        </label>
        <input
          id="second-step-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          inputMode={mode === 'setup' ? 'numeric' : 'text'}
          autoComplete="one-time-code"
          autoFocus
          required
          maxLength={mode === 'setup' ? 6 : 12}
          dir="ltr"
          className={inputClass}
          placeholder={mode === 'setup' ? '123456' : '123456 or abcd-efgh'}
        />
      </div>
      <Button type="submit" disabled={busy || !code.trim() || (mode === 'setup' && !setup)} className="w-full bg-green-600 hover:bg-green-700 text-white py-2">
        {busy ? 'Checking…' : mode === 'code' ? 'Sign in' : 'Turn on and sign in'}
      </Button>
      <button type="button" onClick={() => onRestart('')} className="w-full text-sm text-gray-600 hover:text-gray-900">
        ← Back to the password
      </button>
    </form>
  );
}
