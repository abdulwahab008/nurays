'use client';

import { Check, Globe } from 'lucide-react';
import { useT, useLocale, LOCALES, LOCALE_NAMES } from '@/lib/i18n';
import { accountMessages } from '@/lib/i18n/messages/account';

/** The language the app is shown in on this device; choosing one also saves it to the account. */
export function LanguageSection() {
  const t = useT(accountMessages);
  const { locale, setLocale } = useLocale();
  return (
    <div className="bg-surface rounded-[20px] border border-line p-6" data-testid="language-setting">
      <h2 className="text-lg font-bold text-ink mb-1 flex items-center gap-2">
        <Globe className="w-5 h-5 text-brand-ink" /> {t('appLanguage')}
      </h2>
      <p className="text-sm text-muted mb-4">{t('appLanguageDesc')}</p>
      <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('appLanguage')}>
        {LOCALES.map((code) => {
          const selected = locale === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={selected}
              lang={code}
              onClick={() => setLocale(code)}
              data-testid={`language-option-${code}`}
              className={`flex items-center justify-between gap-2 p-4 rounded-xl border-2 text-start font-semibold transition-colors ${
                selected
                  ? 'border-brand bg-brand-50 text-ink'
                  : 'border-line bg-surface text-ink hover:border-line-strong'
              }`}
            >
              <span>{LOCALE_NAMES[code]}</span>
              {selected && <Check className="w-4 h-4 text-brand-ink" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
