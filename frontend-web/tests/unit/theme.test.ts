import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { DEFAULT_THEME_CHOICE, isThemeChoice, readThemeChoice, resolveTheme, THEME_BOOT_SCRIPT, THEME_STORAGE_KEY, themeAppliesTo } from '../../lib/theme.ts';

const store = (value: string | null) => ({ getItem: (key: string) => (key === THEME_STORAGE_KEY ? value : null) });

test('a saved choice is used, anything else falls back to the default', () => {
  assert.equal(readThemeChoice(store('dark')), 'dark');
  assert.equal(readThemeChoice(store('system')), 'system');
  assert.equal(readThemeChoice(store('purple')), DEFAULT_THEME_CHOICE);
  assert.equal(readThemeChoice(store(null)), DEFAULT_THEME_CHOICE);
  assert.equal(readThemeChoice(undefined), DEFAULT_THEME_CHOICE);
  assert.equal(readThemeChoice({ getItem: () => { throw new Error('blocked'); } }), DEFAULT_THEME_CHOICE);
});

test('"same as the phone" follows the phone; light and dark do not', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
  assert.ok(isThemeChoice('light') && !isThemeChoice('Light') && !isThemeChoice(undefined));
});

function boot(saved: string | null, prefersDark: boolean, storageThrows = false, pathname = '/'): string | null {
  let attr: string | null = null;
  runInNewContext(THEME_BOOT_SCRIPT, {
    location: { pathname },
    localStorage: { getItem: () => { if (storageThrows) throw new Error('blocked'); return saved; } },
    window: { matchMedia: () => ({ matches: prefersDark }) },
    document: { documentElement: { setAttribute: (_name: string, value: string) => { attr = value; } } },
  });
  return attr;
}

test('the script in <head> marks the page dark exactly when the theme is dark', () => {
  assert.equal(boot('dark', false), 'dark');
  assert.equal(boot('system', true), 'dark');
  assert.equal(boot('system', false), null);
  assert.equal(boot('light', true), null);
  assert.equal(boot(null, true), DEFAULT_THEME_CHOICE === 'light' ? null : 'dark');
  assert.equal(boot('dark', false, true), null, 'blocked storage leaves the page light instead of breaking it');
});

test('the kitchen, rider, hub and admin screens stay light until they are redesigned', () => {
  for (const path of ['/sellers/dashboard', '/riders', '/admin/orders/1', '/hub']) {
    assert.ok(!themeAppliesTo(path), path);
    assert.equal(boot('dark', true, false, path), null, path);
  }
  for (const path of ['/', '/orders', '/hubs-near-me', '/profile']) assert.ok(themeAppliesTo(path), path);
  assert.equal(boot('dark', false, false, '/orders'), 'dark');
});
