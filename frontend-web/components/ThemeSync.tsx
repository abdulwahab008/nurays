'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { applyTheme, useTheme } from '@/lib/hooks/use-theme';

/**
 * Keeps the page on the person's theme as they move around: the theme script in <head> covers the first page, this the
 * pages reached by a link (a screen that is light-only switches back to light, and back again on leaving it).
 */
export function ThemeSync() {
  const pathname = usePathname();
  const { theme } = useTheme();
  useEffect(() => {
    applyTheme(theme);
  }, [pathname, theme]);
  return null;
}
