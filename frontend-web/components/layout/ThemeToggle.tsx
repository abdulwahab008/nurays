'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { siteMessages } from '@/lib/i18n/messages/site';
import { useTheme } from '@/lib/hooks/use-theme';
import type { ThemeChoice } from '@/lib/theme';
import { cn } from '@/lib/utils';

const OPTIONS: { choice: ThemeChoice; label: 'themeLight' | 'themeDark' | 'themeSystem'; Icon: typeof Sun }[] = [
  { choice: 'light', label: 'themeLight', Icon: Sun },
  { choice: 'dark', label: 'themeDark', Icon: Moon },
  { choice: 'system', label: 'themeSystem', Icon: Monitor },
];

/** Light, dark, or the same as the phone: three buttons, one pressed. */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useT(siteMessages);
  const { choice, setChoice } = useTheme();
  return (
    <div role="radiogroup" aria-label={t('appearance')} className={cn('grid grid-cols-3 gap-1 rounded-xl bg-raised p-1', className)}>
      {OPTIONS.map(({ choice: option, label, Icon }) => {
        const selected = option === choice;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setChoice(option)}
            className={cn(
              'flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[11px] font-semibold transition-colors',
              selected ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink',
            )}
            data-testid={`theme-${option}`}
          >
            <Icon className="h-4 w-4" aria-hidden />
            <span>{t(label)}</span>
          </button>
        );
      })}
    </div>
  );
}
