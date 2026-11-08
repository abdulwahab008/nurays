'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

/** The page decides where signing out leads: its own guard would otherwise send the person to sign in again. */
export function SignOutCard({ onSignOut }: { onSignOut: () => void }) {
  const t = useT(accountMessages);
  return (
    <div className="bg-surface rounded-[20px] border border-line p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="font-medium text-ink">{t('signOut')}</p>
        <p className="text-xs text-muted">{t('signOutDesc')}</p>
      </div>
      <Button variant="outline" className="shrink-0 min-h-11" data-testid="profile-sign-out" onClick={onSignOut}>
        <LogOut className="w-4 h-4" /> {t('signOut')}
      </Button>
    </div>
  );
}
