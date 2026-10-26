/**
 * Light and dark theme. The choice (light, dark, or the same as the phone) is kept in the browser; the page's <html> gets
 * data-theme="dark" when the dark theme applies, and the tokens in globals.css do the rest.
 */
export type ThemeChoice = 'light' | 'dark' | 'system';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'nuray-theme';
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system'];

/**
 * Light until every screen has been redesigned for dark: a person can turn dark on, but nobody gets it without asking.
 * Once the redesign is finished this becomes 'system'.
 */
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'light';

/** The browser bar and phone status bar colour for each theme (the page background). */
export const THEME_COLOURS: Record<Theme, string> = { light: '#F5F8F7', dark: '#091614' };

/**
 * The kitchen, rider, hub and admin screens have not been redesigned for dark yet: they stay light whatever the choice.
 */
export const LIGHT_ONLY_PREFIXES: readonly string[] = ['/admin', '/sellers', '/riders', '/hub'];

export function themeAppliesTo(pathname: string): boolean {
  return !LIGHT_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix + '/'));
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  if (choice === 'system') return prefersDark ? 'dark' : 'light';
  return choice;
}

/** The saved choice, or the default when there is none or the storage cannot be read (a private window, blocked storage). */
export function readThemeChoice(storage: Pick<Storage, 'getItem'> | undefined): ThemeChoice {
  try {
    const saved = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(saved) ? saved : DEFAULT_THEME_CHOICE;
  } catch {
    return DEFAULT_THEME_CHOICE;
  }
}

/**
 * Runs in <head> before the page paints, so a dark page never flashes white first. Plain ES5 with everything inlined:
 * it runs before any bundle loads.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var p=location.pathname,l=${JSON.stringify(LIGHT_ONLY_PREFIXES)};` +
  `for(var i=0;i<l.length;i++)if(p===l[i]||p.indexOf(l[i]+'/')===0)return;` +
  `var c=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});` +
  `if(c!=='light'&&c!=='dark'&&c!=='system')c=${JSON.stringify(DEFAULT_THEME_CHOICE)};` +
  `var d=c==='dark'||(c==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);` +
  `if(d)document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();`;
