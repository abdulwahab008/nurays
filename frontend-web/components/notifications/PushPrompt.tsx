'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { enablePush, getPushState, PushState } from '@/lib/push';
import { useToast } from '@/components/ui/toast';

const DISMISS_KEY = 'nuray-push-prompt-dismissed';

/**
 * A one-tap way to get alerts on this device (e.g. a kitchen's new orders). Shown only when
 * push is possible here and not on yet; once dismissed it stays away on this browser.
 */
export default function PushPrompt({ text }: { text: string }) {
  const { showToast } = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
    getPushState()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  if (state !== 'off' || dismissed) return null;

  const turnOn = async () => {
    try {
      setBusy(true);
      const next = await enablePush();
      setState(next);
      if (next === 'on') showToast('Alerts are on for this device', 'success');
      else if (next === 'denied') showToast('Notifications are blocked for this site in your browser', 'warning');
    } catch {
      showToast('Could not turn on alerts. Try again from notification settings.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Private window: it just comes back next time.
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-orange-200 bg-orange-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3" data-testid="push-prompt">
      <div className="flex items-start gap-3 flex-1">
        <div className="w-9 h-9 rounded-xl bg-[#FF5500] text-white flex items-center justify-center shrink-0">
          <Bell className="w-4 h-4" />
        </div>
        <p className="text-sm text-slate-800">
          {text}{' '}
          <Link href="/notifications/settings" className="underline text-slate-600">
            Settings
          </Link>
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={busy} onClick={turnOn} className="px-4 py-2 rounded-xl bg-[#FF5500] text-white text-sm font-bold disabled:opacity-50">
          {busy ? 'One moment…' : 'Turn on alerts'}
        </button>
        <button type="button" onClick={dismiss} className="px-3 py-2 rounded-xl text-sm text-slate-600 hover:text-slate-900">
          Not now
        </button>
      </div>
    </div>
  );
}
