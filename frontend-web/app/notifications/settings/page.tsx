'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import {
  DashboardLayout,
  CUSTOMER_SIDEBAR_ITEMS,
  SELLER_SIDEBAR_ITEMS,
  RIDER_SIDEBAR_ITEMS,
  ADMIN_SIDEBAR_ITEMS,
  HUB_MANAGER_SIDEBAR_ITEMS,
} from '@/components/layout/DashboardShell';
import { useAuthStore } from '@/lib/store/auth-store';
import { useToast } from '@/components/ui/toast';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { disablePush, enablePush, getPushState, PushState } from '@/lib/push';

type Channel = 'push' | 'email' | 'sms';
type Category = 'orders' | 'payments' | 'deliveries';

interface Settings {
  preferences: Record<Category, Record<Channel, boolean>>;
  categories: Category[];
  channels: Record<Channel, { available: boolean; reason: string | null }>;
}

const CATEGORY_COPY: Record<string, Record<Category, { title: string; text: string }>> = {
  seller: {
    orders: { title: 'Orders', text: 'New orders (accept them within 30 minutes) and cancellations.' },
    payments: { title: 'Payments & payouts', text: 'Receipts to check, payments confirmed, payouts sent.' },
    deliveries: { title: 'Deliveries', text: '' },
  },
  rider: {
    orders: { title: 'Orders', text: '' },
    payments: { title: 'Money', text: 'Settlements and payments recorded for you.' },
    deliveries: { title: 'Delivery jobs', text: 'A job you took being cancelled.' },
  },
  default: {
    orders: { title: 'Order updates', text: 'Accepted, on the way, delivered, or cancelled.' },
    payments: { title: 'Payments & refunds', text: 'Payments received or questioned, refunds sent, wallet top-ups.' },
    deliveries: { title: 'Deliveries', text: '' },
  },
};

const CHANNELS: Array<{ id: Channel; label: string; icon: React.ReactNode }> = [
  { id: 'push', label: 'Push', icon: <Smartphone className="w-4 h-4" /> },
  { id: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { id: 'sms', label: 'Text (SMS)', icon: <MessageSquare className="w-4 h-4" /> },
];

const PUSH_TEXT: Record<PushState, string> = {
  on: 'On for this device.',
  off: 'Off for this device.',
  denied: "Blocked in this browser's settings. Allow notifications for this site there, then come back.",
  unsupported: "This browser doesn't support push notifications. On iPhone, add Nuray to your home screen first.",
  unavailable: "Push notifications aren't set up on Nuray's server yet.",
};

/** Which notifications reach this person outside the app, and on which devices. */
export default function NotificationSettingsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [pushState, setPushState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const role = (user?.userType ?? user?.user_type ?? 'customer') as string;

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get('/notifications/preferences');
      setSettings(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not load your notification settings'), 'error');
    }
    setPushState(await getPushState().catch(() => 'unsupported' as PushState));
  }, [showToast]);

  useEffect(() => {
    if (!isAuthenticated && !apiClient.getAccessToken()) {
      router.push('/login');
      return;
    }
    load();
  }, [isAuthenticated, router, load]);

  const toggle = async (category: Category, channel: Channel) => {
    if (!settings) return;
    const next = !settings.preferences[category][channel];
    setSettings({ ...settings, preferences: { ...settings.preferences, [category]: { ...settings.preferences[category], [channel]: next } } });
    try {
      const res = await apiClient.put('/notifications/preferences', { preferences: { [category]: { [channel]: next } } });
      setSettings(res.data.data);
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save that'), 'error');
      load();
    }
  };

  const changePush = async (on: boolean) => {
    try {
      setBusy(true);
      const state = on ? await enablePush() : await disablePush();
      setPushState(state);
      if (on && state === 'on') showToast('Notifications are on for this device', 'success');
      if (on && state === 'denied') showToast('Notifications are blocked for this site in your browser', 'warning');
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not change notifications on this device'), 'error');
    } finally {
      setBusy(false);
    }
  };

  const sidebar =
    role === 'seller'
      ? SELLER_SIDEBAR_ITEMS
      : role === 'rider'
        ? RIDER_SIDEBAR_ITEMS
        : role === 'admin'
          ? ADMIN_SIDEBAR_ITEMS
          : role === 'hub_manager'
            ? HUB_MANAGER_SIDEBAR_ITEMS
            : CUSTOMER_SIDEBAR_ITEMS;
  const layoutRole = (['seller', 'rider', 'admin', 'hub_manager'].includes(role) ? role : 'customer') as 'customer' | 'seller' | 'rider' | 'admin' | 'hub_manager';
  const copy = CATEGORY_COPY[role] ?? CATEGORY_COPY.default;

  return (
    <DashboardLayout title="Notification settings" subtitle="What reaches you outside the app" sidebarItems={sidebar} userType={layoutRole}>
      <div className="max-w-3xl mx-auto space-y-5 pb-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6" data-testid="push-device">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#FF5500] flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-bold text-slate-900">Push notifications on this device</h2>
              <p className="text-xs text-slate-500 mt-1">{pushState ? PUSH_TEXT[pushState] : 'Checking…'}</p>
              {role === 'seller' && pushState === 'off' && (
                <p className="text-xs text-amber-700 mt-1">Turn this on on the phone or computer you take orders on, so you never miss a new order.</p>
              )}
            </div>
            {(pushState === 'off' || pushState === 'on') && (
              <button
                type="button"
                disabled={busy}
                onClick={() => changePush(pushState !== 'on')}
                className={`px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 ${pushState === 'on' ? 'border border-slate-300 text-slate-700' : 'bg-[#FF5500] text-white'}`}
                data-testid="push-toggle"
              >
                {busy ? 'One moment…' : pushState === 'on' ? 'Turn off' : 'Turn on'}
              </button>
            )}
          </div>
        </div>

        {!settings ? (
          <div className="h-48 rounded-3xl bg-slate-100 animate-pulse" />
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white overflow-hidden" data-testid="notification-preferences">
            <div className="px-5 sm:px-6 pt-5">
              <h2 className="text-sm font-bold text-slate-900">What you hear about, and how</h2>
              <p className="text-xs text-slate-500 mt-1">
                Everything also appears under{' '}
                <Link href={role === 'seller' ? '/sellers/notifications' : '/notifications'} className="underline">
                  Notifications
                </Link>
                . Text messages are only sent for things that need you now.
              </p>
            </div>
            <table className="w-full text-sm mt-4">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 sm:px-6 py-2 text-left font-semibold">Kind</th>
                  {CHANNELS.map((c) => (
                    <th key={c.id} className="px-3 py-2 font-semibold">
                      <span className="inline-flex items-center gap-1">
                        {c.icon}
                        {c.label}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {settings.categories.map((category) => (
                  <tr key={category}>
                    <td className="px-5 sm:px-6 py-4">
                      <p className="font-semibold text-slate-900">{copy[category].title}</p>
                      <p className="text-xs text-slate-500">{copy[category].text}</p>
                    </td>
                    {CHANNELS.map((c) => {
                      const available = settings.channels[c.id].available;
                      const on = settings.preferences[category][c.id];
                      return (
                        <td key={c.id} className="px-3 py-4 text-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on && available}
                            aria-label={`${copy[category].title}: ${c.label}`}
                            disabled={!available}
                            title={settings.channels[c.id].reason ?? undefined}
                            onClick={() => toggle(category, c.id)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40 ${on && available ? 'bg-emerald-500' : 'bg-slate-300'}`}
                          >
                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${on && available ? 'translate-x-5' : 'translate-x-0.5'}`} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            {CHANNELS.some((c) => !settings.channels[c.id].available) && (
              <ul className="px-5 sm:px-6 py-4 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                {CHANNELS.filter((c) => !settings.channels[c.id].available).map((c) => (
                  <li key={c.id}>
                    {c.label}: {settings.channels[c.id].reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
