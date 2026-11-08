'use client';

import Link from 'next/link';
import { Bell, ChevronRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

/** The way to the notification preferences, which every role keeps on /notifications/settings. */
export function NotificationsLinkCard() {
  const t = useT(accountMessages);
  return (
    <Link
      href="/notifications/settings"
      className="flex items-center gap-3 min-h-12 bg-surface rounded-[20px] border border-line p-4 hover:bg-raised transition-colors"
      data-testid="notification-settings-link"
    >
      <span className="w-10 h-10 shrink-0 bg-brand-soft rounded-xl flex items-center justify-center text-brand-soft-ink">
        <Bell className="w-5 h-5" aria-hidden />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block font-medium text-ink">{t('notificationSettings')}</span>
        <span className="block text-xs text-muted">{t('notificationSettingsSub')}</span>
      </span>
      <ChevronRight className="rtl:-scale-x-100 w-4 h-4 text-muted shrink-0" aria-hidden />
    </Link>
  );
}
