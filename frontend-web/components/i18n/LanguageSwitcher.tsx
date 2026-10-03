'use client';

import { Languages } from 'lucide-react';
import { LOCALE_NAMES, useLocale } from '@/lib/i18n';

/** One tap between English and Urdu; shows the language you'd switch to, in that language. */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const other = locale === 'ur' ? 'en' : 'ur';
  return (
    <button
      type="button"
      onClick={() => setLocale(other)}
      lang={other}
      className={`inline-flex items-center gap-1.5 h-10 px-3 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors ${className}`}
      aria-label={other === 'ur' ? 'اردو میں دیکھیں' : 'View in English'}
      data-testid="language-switcher"
    >
      <Languages className="w-4 h-4" />
      <span>{LOCALE_NAMES[other]}</span>
    </button>
  );
}
