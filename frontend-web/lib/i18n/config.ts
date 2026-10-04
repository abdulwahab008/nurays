/** Languages Nuray's screens come in. Server-safe (no React). */
export const LOCALES = ['en', 'ur'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'nuray_locale';

export const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
export const dirFor = (locale: Locale): 'ltr' | 'rtl' => (locale === 'ur' ? 'rtl' : 'ltr');

/** The name of each language, written in that language (for the switcher). */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', ur: 'اردو' };
