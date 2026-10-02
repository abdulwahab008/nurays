'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { DEFAULT_LOCALE, dirFor, LOCALE_COOKIE, type Locale } from './config';

export * from './config';

/**
 * Translations. Each area of the app keeps its strings in one module under ./messages,
 * written with defineMessages so the Urdu side must have every English key:
 *
 *   const messages = defineMessages({ en: { hi: 'Hi {name}' }, ur: { hi: '{name}، السلام علیکم' } });
 *   const t = useT(messages);  t('hi', { name })
 *
 * A page only loads the modules it uses. The chosen language lives in a cookie so the
 * server renders <html lang dir> right on the first paint.
 */

type Strings = Record<string, string>;
export type Messages<T extends Strings> = { en: T; ur: { [K in keyof T]: string } };

export function defineMessages<T extends Strings>(messages: Messages<T>): Messages<T> {
  return messages;
}

export type Vars = Record<string, string | number | null | undefined>;

export function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (vars[name] == null ? match : String(vars[name])));
}

interface LocaleContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ locale: DEFAULT_LOCALE, dir: 'ltr', setLocale: () => undefined });

export function LocaleProvider({ initialLocale, children }: { initialLocale: Locale; children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = dirFor(next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, dir: dirFor(locale), setLocale }), [locale, setLocale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);

/** The translate function for one messages module, in the current language. */
export function useT<T extends Strings>(messages: Messages<T>) {
  const { locale } = useLocale();
  return useCallback(
    (key: keyof T & string, vars?: Vars) => interpolate(messages[locale]?.[key] ?? messages.en[key] ?? key, vars),
    [messages, locale],
  );
}
