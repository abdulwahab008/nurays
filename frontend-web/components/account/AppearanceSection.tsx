'use client';

import { Palette } from 'lucide-react';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { useT } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

/** Light, dark or the same as the phone. `note` says where the choice does not apply yet (LIGHT_ONLY_PREFIXES in lib/theme.ts). */
export function AppearanceSection({ note }: { note?: string }) {
  const t = useT(accountMessages);
  return (
    <div className="bg-surface rounded-[20px] border border-line p-6" data-testid="appearance-setting">
      <h2 className="text-lg font-bold text-ink mb-1 flex items-center gap-2">
        <Palette className="w-5 h-5 text-brand-ink" /> {t('appearance')}
      </h2>
      <p className="text-sm text-muted mb-4">{t('appearanceDesc')}</p>
      <ThemeToggle className="max-w-sm" />
      {note && <p className="text-xs text-muted mt-3">{note}</p>}
    </div>
  );
}
