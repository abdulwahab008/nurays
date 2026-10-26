'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { nativePlugins, type NativeWindow } from '@/lib/native-shell';
import { readThemeChoice, resolveTheme, THEME_COLOURS, THEME_STORAGE_KEY, themeAppliesTo, type Theme, type ThemeChoice } from '@/lib/theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const CHANGE_EVENT = 'nuray-theme-change';

function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Puts a theme on the page: the attribute the tokens follow, the browser bar colour and the phone's status bar text.
 * The screens not yet made for dark (lib/theme.ts) get the light one.
 */
export function applyTheme(chosen: Theme): void {
  const theme: Theme = themeAppliesTo(window.location.pathname) ? chosen : 'light';
  const root = document.documentElement;
  if (theme === 'dark') root.setAttribute('data-theme', 'dark');
  else root.removeAttribute('data-theme');
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => meta.setAttribute('content', THEME_COLOURS[theme]));
  // Capacitor's DARK style is light text, for a dark page.
  void nativePlugins(window as unknown as NativeWindow)?.StatusBar?.setStyle({ style: theme === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => undefined);
}

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    media.removeEventListener('change', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

const snapshot = () => `${readThemeChoice(storage())}|${window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'}`;
const serverSnapshot = () => 'light|light';

/** The person's theme choice, the theme it gives right now, and a way to change it. */
export function useTheme(): { choice: ThemeChoice; theme: Theme; setChoice: (choice: ThemeChoice) => void } {
  const [choicePart, systemPart] = useSyncExternalStore(subscribe, snapshot, serverSnapshot).split('|');
  const choice = choicePart as ThemeChoice;
  // components/ThemeSync.tsx puts it on the page.
  const theme = resolveTheme(choice, systemPart === 'dark');

  const setChoice = useCallback((next: ThemeChoice) => {
    try {
      storage()?.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // The choice then lasts until the page is closed.
    }
    applyTheme(resolveTheme(next, window.matchMedia(DARK_QUERY).matches));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { choice, theme, setChoice };
}
