import { test, expect, type Page } from '@playwright/test';
import { newCustomer } from './support/customer';

// The website inside the Nuray store app (mobile/): a stand-in for the app's shell gives the page isNativePlatform and
// the plugins it uses, recording every call (components/NativeBridge.tsx, lib/native-shell.ts).

async function asTheApp(page: Page, vault: Record<string, string> = {}) {
  await page.addInitScript((initialVault: Record<string, string>) => {
    const w = window as unknown as Record<string, unknown>;
    const calls: string[] = [];
    const listeners: Record<string, (e: unknown) => void> = {};
    const stored = sessionStorage.getItem('__vault');
    const vaultNow: Record<string, string> = stored ? JSON.parse(stored) : initialVault;
    const save = () => sessionStorage.setItem('__vault', JSON.stringify(vaultNow));
    save();
    w.__calls = calls;
    w.__listeners = listeners;
    w.Capacitor = {
      isNativePlatform: () => true,
      Plugins: {
        App: {
          addListener: async (event: string, cb: (e: unknown) => void) => {
            calls.push(`listen ${event}`);
            listeners[event] = cb;
            return { remove: async () => undefined };
          },
          exitApp: async () => void calls.push('exitApp'),
        },
        StatusBar: { setStyle: async (o: { style: string }) => void calls.push(`status ${o.style}`) },
        SplashScreen: { hide: async () => void calls.push('splash hidden') },
        SecureStorage: {
          internalGetItem: async ({ prefixedKey }: { prefixedKey: string }) => ({ data: vaultNow[prefixedKey] ?? null }),
          internalSetItem: async ({ prefixedKey, data }: { prefixedKey: string; data: string }) => {
            vaultNow[prefixedKey] = data;
            save();
          },
          internalRemoveItem: async ({ prefixedKey }: { prefixedKey: string }) => {
            delete vaultNow[prefixedKey];
            save();
            return { success: true };
          },
        },
      },
    };
  }, vault);
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
const fire = (page: Page, event: string, payload: unknown) =>
  page.evaluate(([e, p]) => (window as unknown as { __listeners: Record<string, (x: unknown) => void> }).__listeners[e as string](p), [event, payload]);

test.describe('the website inside the store app', () => {
  test('hooks into the app: splash, status bar, links and the back button', async ({ page }) => {
    await asTheApp(page);
    await page.goto('/terms');
    await expect.poll(() => calls(page)).toEqual(expect.arrayContaining(['listen appUrlOpen', 'listen backButton', 'status LIGHT', 'splash hidden']));

    await fire(page, 'appUrlOpen', { url: 'pk.nuray.app://privacy' });
    await expect(page).toHaveURL(/\/privacy$/);
    await fire(page, 'appUrlOpen', { url: 'https://evil.example/help' });
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/privacy$/);

    await fire(page, 'backButton', { canGoBack: true });
    await expect(page).toHaveURL(/\/terms$/);
    await fire(page, 'backButton', { canGoBack: false });
    await expect.poll(() => calls(page)).toContain('exitApp');
  });

  test('offers no web Google sign-in, which Google refuses inside an app', async ({ page }) => {
    await asTheApp(page);
    await page.goto('/login');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Google/ })).toHaveCount(0);
  });

  test('a page that lost its sign-in gets it back from secure storage', async ({ page }) => {
    const customer = await newCustomer();
    test.skip(!customer.jwt, 'the API is not running');
    const login = await page.request.post(`${process.env.API_BASE ?? 'http://localhost:3001/api/v1'}/auth/login`, {
      data: { phoneOrEmail: customer.email, otpCodeOrPassword: 'Lantern-Quartz-71!', loginMethod: 'email' },
    });
    const tokens = (await login.json()).data.tokens as { access_token: string; refresh_token: string };
    await asTheApp(page, { nuray_access: tokens.access_token, nuray_refresh: tokens.refresh_token });
    await page.goto('/terms');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('refresh_token'))).toBe(tokens.refresh_token);
  });
});
