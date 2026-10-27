'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Laptop, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { LoadError } from '@/components/ui/LoadError';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useAuthStore } from '@/lib/store/auth-store';
import { useLocale, useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';
import { describeDevice, sortDevices, type SignedInDevice } from '@/lib/sessions';

/**
 * The profile's "Signed-in devices": every device the account is signed in on, from GET /auth/sessions. Signing one
 * out ends its session at once (its tokens stop working, its live connection closes); "Sign out everywhere" ends
 * them all, this one included.
 */
export function SessionsCard() {
  const t = useT(accountMessages);
  const { locale } = useLocale();
  const { showToast } = useToast();
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [devices, setDevices] = useState<SignedInDevice[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [endingAll, setEndingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: { sessions: SignedInDevice[] } }>('/auth/sessions');
      setDevices(sortDevices(res.data.data.sessions));
      setError(null);
    } catch (err: unknown) {
      setError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const when = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-PK', { dateStyle: 'medium', timeStyle: 'short' });

  const name = (d: SignedInDevice) => {
    const { browser, os } = describeDevice(d.userAgent);
    if (browser && os) return t('deviceOn', { browser, os });
    return browser ?? os ?? t('deviceUnknown');
  };

  const signOut = async (d: SignedInDevice) => {
    setBusyId(d.id);
    try {
      await apiClient.delete(`/auth/sessions/${encodeURIComponent(d.id)}`);
      showToast(t('deviceSignedOut'), 'success');
      setDevices((prev) => prev?.filter((x) => x.id !== d.id) ?? prev);
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, t('deviceSignOutFailed')), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const signOutEverywhere = async () => {
    setEndingAll(true);
    try {
      await apiClient.post('/auth/logout-all');
      setConfirmAll(false);
      logout();
      router.push('/login');
    } catch (err: unknown) {
      showToast(apiErrorMessage(err, t('deviceSignOutFailed')), 'error');
      setEndingAll(false);
    }
  };

  return (
    <div className="p-4 bg-raised rounded-xl" data-testid="sessions-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{t('devicesTitle')}</p>
          <p className="text-xs text-muted">{t('devicesDesc')}</p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setConfirmAll(true)} data-testid="sessions-sign-out-all">
          {t('devicesSignOutAll')}
        </Button>
      </div>

      {Boolean(error) && <LoadError compact className="mt-3" error={error} onRetry={load} title={t('devicesLoadFailed')} />}

      {devices && (
        <ul className="mt-3 divide-y divide-line" data-testid="sessions-list">
          {devices.map((d) => {
            const mobile = /iPhone|Android|iPad/.test(d.userAgent ?? '');
            const Icon = mobile ? Smartphone : Laptop;
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 py-3" data-testid="session-row">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 shrink-0 text-muted" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {name(d)}
                      {d.current && (
                        <span className="ms-2 inline-block rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-soft-ink">{t('deviceThis')}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {t('deviceLastActive', { when: when(d.lastActiveAt) })}
                      {d.ipAddress ? <span dir="ltr"> · {d.ipAddress}</span> : null}
                    </p>
                  </div>
                </div>
                {!d.current && (
                  <Button variant="outline" size="sm" className="shrink-0" disabled={busyId === d.id} onClick={() => signOut(d)} data-testid="session-sign-out">
                    {t('deviceSignOut')}
                  </Button>
                )}
              </li>
            );
          })}
          {devices.every((d) => d.current) && <li className="py-3 text-xs text-muted">{t('devicesNone')}</li>}
        </ul>
      )}

      <ConfirmModal
        isOpen={confirmAll}
        title={t('devicesSignOutAllTitle')}
        message={t('devicesSignOutAllBody')}
        confirmText={t('devicesSignOutAll')}
        variant="danger"
        loading={endingAll}
        onConfirm={signOutEverywhere}
        onCancel={() => setConfirmAll(false)}
      />
    </div>
  );
}
