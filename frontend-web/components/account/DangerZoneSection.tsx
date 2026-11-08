'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { apiErrorCode, errorMessage } from '@/lib/api-client';
import { userProfileService } from '@/lib/services/user-profile.service';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

/** Closing the account: typed confirmation, then the password if the server asks for one. The page signs out and leaves in `onClosed`. */
export function DangerZoneSection({ onClosed }: { onClosed: () => void }) {
  const t = useT(accountMessages);
  const { showToast } = useToast();
  const { ask: askDialog } = useDialogs();
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if ((await askDialog({ title: t('deleteAccount'), message: t('deleteConfirmPrompt'), label: 'DELETE', mustEqual: 'DELETE', destructive: true })) !== 'DELETE') return;
    const attempt = async (password?: string) => {
      await userProfileService.deleteAccount(password);
      showToast(t('accountDeleted'), 'success');
      onClosed();
    };
    try {
      setDeleting(true);
      try {
        await attempt();
      } catch (error) {
        if (apiErrorCode(error) !== 'PASSWORD_REQUIRED') throw error;
        const password = (await askDialog({ title: t('password'), message: t('deletePasswordPrompt'), type: 'password', destructive: true }));
        if (!password) return;
        await attempt(password);
      }
    } catch (error) {
      showToast(errorMessage(error, 'Could not close the account'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-surface rounded-[20px] border border-red-200 p-6">
      <h2 className="text-lg font-bold text-red-700 mb-4 flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-red-700" /> {t('dangerZone')}
      </h2>
      <div className="flex items-center justify-between gap-3 p-4 bg-red-50 rounded-xl">
        <div className="min-w-0">
          <p className="font-medium text-ink">{t('deleteAccount')}</p>
          <p className="text-xs text-muted">{t('deleteAccountDesc')}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="border-red-300 text-red-700 hover:bg-red-100 shrink-0"
          data-testid="delete-account"
          disabled={deleting}
          onClick={handleDeleteAccount}
        >
          {t('deleteAccount')}
        </Button>
      </div>
    </div>
  );
}
