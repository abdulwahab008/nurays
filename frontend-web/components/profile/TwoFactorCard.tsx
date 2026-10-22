'use client';

import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiClient, apiErrorMessage } from '@/lib/api-client';

interface Status {
  enabled: boolean;
  backupCodesLeft: number;
  required: boolean;
}

/**
 * Two-step sign-in on a staff member's own account (SEC-3): whether it is on and how many backup codes are left,
 * setting it up when it is not (it can be required at sign-in instead), and new backup codes. Staff only.
 */
export function TwoFactorCard() {
  const { showToast } = useToast();
  const { ask } = useDialogs();
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: Status }>('/auth/2fa');
      setStatus(res.data.data);
      setError(null);
    } catch (err: unknown) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    setBusy(true);
    try {
      const res = await apiClient.post<{ data: { secret: string; otpauthUrl: string } }>('/auth/2fa/setup', {});
      setSetup(res.data.data);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, 'Could not start the set-up.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await apiClient.post<{ data: { backupCodes: string[] } }>('/auth/2fa/setup/confirm', { code: code.trim() });
      setCodes(res.data.data.backupCodes);
      setSetup(null);
      setCode('');
      showToast('Two-step sign-in is on', 'success');
      void load();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, 'That code did not work.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const renew = async () => {
    const current = await ask({ title: 'New backup codes', message: 'Your old backup codes stop working. Enter the code from your authenticator app to confirm.', label: 'Code from the app', minLength: 6, confirmText: 'Make new codes' });
    if (!current) return;
    try {
      const res = await apiClient.post<{ data: { backupCodes: string[] } }>('/auth/2fa/backup-codes', { code: current.trim() });
      setCodes(res.data.data.backupCodes);
      void load();
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, 'That code did not work.'), 'error');
    }
  };

  return (
    <div className="p-4 bg-gray-50 rounded-xl space-y-3" data-testid="two-factor-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 shrink-0 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-700">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-gray-900">Two-step sign-in</p>
            <p className="text-xs text-gray-600">
              {status == null
                ? 'A code from an authenticator app at every sign-in.'
                : status.enabled
                  ? `On. ${status.backupCodesLeft} backup code${status.backupCodesLeft === 1 ? '' : 's'} left.`
                  : status.required
                    ? 'Required for staff: you will set it up at your next sign-in, or now.'
                    : 'Off. Recommended for every staff account.'}
            </p>
          </div>
        </div>
        {status && !status.enabled && !setup && (
          <Button size="sm" variant="outline" disabled={busy} onClick={start} data-testid="two-factor-start">Set up</Button>
        )}
        {status?.enabled && (
          <Button size="sm" variant="outline" onClick={renew}>New backup codes</Button>
        )}
      </div>

      {Boolean(error) && <LoadError compact error={error} onRetry={load} title="We couldn't load your two-step sign-in" />}

      {setup && (
        <form onSubmit={confirm} className="space-y-2 text-sm text-gray-700">
          <p>
            Add an account in your authenticator app ({' '}
            <a href={setup.otpauthUrl} className="text-emerald-700 underline">open it in the app</a> on your phone), or type this key:
          </p>
          <p className="rounded-lg bg-white border border-gray-200 px-3 py-2 font-mono break-all" dir="ltr">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</p>
          <label htmlFor="two-factor-code" className="block text-xs font-medium text-gray-700">Code from the app</label>
          <div className="flex gap-2">
            <input id="two-factor-code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} dir="ltr" className="w-32 px-3 py-2 border border-gray-200 rounded-xl" />
            <Button type="submit" size="sm" disabled={busy || code.trim().length !== 6}>Turn on</Button>
          </div>
        </form>
      )}

      {codes && (
        <div className="space-y-2" data-testid="two-factor-backup-codes">
          <p className="text-sm text-gray-800 font-medium">Your backup codes, shown only now. Each signs you in once if you lose your phone.</p>
          <ul className="grid grid-cols-2 sm:grid-cols-5 gap-2 font-mono text-xs" dir="ltr">
            {codes.map((c) => <li key={c} className="rounded-lg bg-white border border-gray-200 px-2 py-1 text-center">{c}</li>)}
          </ul>
          <Button size="sm" variant="outline" onClick={() => setCodes(null)}>I have saved them</Button>
        </div>
      )}
    </div>
  );
}
