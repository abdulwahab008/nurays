import { test, expect, type Page } from '@playwright/test';
import { API_BASE, CUSTOMER_PASSWORD, dbQuery, newCustomer, signIn } from './support/customer';

// The website inside the Nuray store app (mobile/): a stand-in for the app's shell gives the page isNativePlatform and
// the plugins it uses, recording every call (components/NativeBridge.tsx, lib/native-shell.ts).

type Shell = { platform?: 'android' | 'ios'; signIn?: Record<string, unknown> };

async function asTheApp(page: Page, vault: Record<string, string> = {}, shell: Shell = {}) {
  await page.addInitScript(([initialVault, { platform, signIn }]: [Record<string, string>, Shell]) => {
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
      getPlatform: () => platform ?? 'android',
      Plugins: {
        // The phone's sign-in sheet, answering with `signIn` (Sign in with Apple's answer, say).
        SocialLogin: {
          initialize: async (o: unknown) => void calls.push(`social init ${JSON.stringify(o)}`),
          login: async (o: { provider: string }) => {
            calls.push(`social login ${o.provider}`);
            return { provider: o.provider, result: signIn ?? {} };
          },
        },
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
        // The phone's push: permission granted when asked, and a token from FCM once registered.
        PushNotifications: {
          checkPermissions: async () => ({ receive: sessionStorage.getItem('__push') ?? 'prompt' }),
          requestPermissions: async () => {
            calls.push('push permission asked');
            sessionStorage.setItem('__push', 'granted');
            return { receive: 'granted' };
          },
          register: async () => {
            calls.push('push register');
            setTimeout(() => listeners.registration?.({ value: 'fcm-token-e2e-0123456789abcdefghijklmnop' }), 10);
          },
          addListener: async (event: string, cb: (e: unknown) => void) => {
            listeners[event] = cb;
            return { remove: async () => undefined };
          },
        },
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
  }, [vault, shell] as [Record<string, string>, Shell]);
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
const fire = (page: Page, event: string, payload: unknown) =>
  page.evaluate(([e, p]) => (window as unknown as { __listeners: Record<string, (x: unknown) => void> }).__listeners[e as string](p), [event, payload]);

// What the phone's secure storage holds now (the stand-in keeps it in sessionStorage across page loads).
const vault = (page: Page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('__vault') ?? '{}') as Record<string, string>);
// The localStorage keys that look like a sign-in token or hold one of `secrets`.
const storedTokens = (page: Page, secrets: string[]) =>
  page.evaluate(
    (known) =>
      Object.keys(localStorage).filter((k) => {
        const v = localStorage.getItem(k) ?? '';
        return /token|refresh|jwt/i.test(k) || /eyJ[\w-]+\.eyJ[\w-]+/.test(v) || known.some((t) => v.includes(t));
      }),
    secrets
  );

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

  test('an Android phone with no Google client set up shows no phone sign-in buttons', async ({ page }) => {
    test.skip(!!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID, 'this build has a Google client id');
    await asTheApp(page, {}, { platform: 'android' });
    await page.goto('/login');
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('native-sign-in')).toHaveCount(0);
  });

  test('on an iPhone, Sign in with Apple sends the identity token and name and signs the person in', async ({ page, request }) => {
    const customer = await newCustomer();
    test.skip(!customer.jwt, 'the API is not running');
    // A real Apple token cannot be made here, so the API's answer stands in: a real customer's sign-in, made outside this browser.
    const login = await request.post(`${API_BASE}/auth/login`, {
      data: { phoneOrEmail: customer.email, otpCodeOrPassword: CUSTOMER_PASSWORD, loginMethod: 'email' },
    });
    const signedIn = (await login.json()).data as { user: { email: string }; tokens: { access_token: string; refresh_token?: string } };
    let sent: Record<string, unknown> | null = null;
    await page.route('**/auth/apple', async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...signedIn, requiresEmailVerification: false } }) });
    });

    await asTheApp(page, {}, { platform: 'ios', signIn: { idToken: 'header.payload.signature', profile: { givenName: 'Ayesha', familyName: 'Khan' } } });
    await page.goto('/login');
    await page.getByRole('button', { name: /Apple/ }).click();

    await expect.poll(() => sent).toEqual({ identityToken: 'header.payload.signature', fullName: 'Ayesha Khan' });
    expect(await calls(page)).toEqual(expect.arrayContaining(['social login apple']));
    expect((await calls(page)).find((c) => c.startsWith('social init'))).toContain('"apple":{"clientId":"pk.nuray.app"');
    await expect(page).not.toHaveURL(/\/login/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('auth-storage') ?? '{}')?.state?.user?.email ?? null)).toBe(customer.email);
    // The tokens stay out of the page's storage and out of the phone's secure storage.
    const secrets = [signedIn.tokens.access_token, signedIn.tokens.refresh_token].filter((t): t is string => !!t);
    expect(await storedTokens(page, secrets)).toEqual([]);
    expect(await vault(page)).toEqual({});
  });

  test('tokens an earlier version saved are removed, from secure storage and from the page', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'old-access-token');
      localStorage.setItem('refresh_token', 'old-refresh-token');
    });
    await asTheApp(page, { nuray_access: 'old-access-token', nuray_refresh: 'old-refresh-token' });
    await page.goto('/terms');
    await expect.poll(() => vault(page)).toEqual({});
    expect(await storedTokens(page, ['old-access-token', 'old-refresh-token'])).toEqual([]);
  });

  test('push in the Android app: turned on with the phone token, a tap opens its page, turned off again', async ({ page }) => {
    const customer = await newCustomer();
    test.skip(!customer.jwt, 'the API is not running');
    const token = 'fcm-token-e2e-0123456789abcdefghijklmnop';
    dbQuery(`DELETE FROM push_subscriptions WHERE endpoint = '${token}'`);
    // CI's server has no Firebase key, so its answer stands in for one that has (saving the token is real).
    await page.route('**/notifications/push/public-key', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { publicKey: null, platforms: { web: false, android: true, ios: false } } }) })
    );
    await signIn(page, customer);
    await asTheApp(page, {}, { platform: 'android' });
    await page.goto('/notifications/settings');

    const saved = page.waitForRequest((r) => r.url().endsWith('/notifications/push/subscriptions') && r.method() === 'POST');
    await page.getByTestId('push-toggle').click();
    expect((await saved).postDataJSON()).toEqual({ platform: 'android', token });
    await expect(page.getByTestId('push-toggle')).toHaveText(/off/i);
    expect(await calls(page)).toEqual(expect.arrayContaining(['push permission asked', 'push register']));
    expect(dbQuery(`SELECT platform || ':' || (p256dh IS NULL) FROM push_subscriptions WHERE endpoint = '${token}' AND user_id = '${customer.id}'`)).toBe('android:true');

    await fire(page, 'pushNotificationActionPerformed', { notification: { data: { url: '/orders' } } });
    await expect(page).toHaveURL(/\/orders$/);
    await fire(page, 'pushNotificationActionPerformed', { notification: { data: { url: 'https://evil.example/' } } });
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/\/orders$/);

    await page.goto('/notifications/settings');
    await expect(page.getByTestId('push-toggle')).toHaveText(/off/i);
    const removed = page.waitForResponse((r) => r.url().endsWith('/notifications/push/subscriptions') && r.request().method() === 'DELETE');
    await page.getByTestId('push-toggle').click();
    expect((await removed).status()).toBe(200);
    expect(dbQuery(`SELECT count(*) FROM push_subscriptions WHERE endpoint = '${token}'`)).toBe('0');
  });
});
