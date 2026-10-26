import { test, expect, devices } from '@playwright/test';

/**
 * The E2E rider (one job on the move, backend/prisma/seed-e2e.ts) in the Android store app, with a stand-in for the
 * shell's background location and HTTP plugins. Before anything is asked of the phone the rider sees what background
 * location is for and chooses; "Allow" moves sharing to the phone's own watch, whose positions the phone itself sends
 * to the server; "Only while the app is open" keeps the browser's watch, and the question can be asked again.
 * Positions are far from both ends of the job, so sharing cannot move it on.
 */
const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices['Pixel 7'];
test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, geolocation: { latitude: 31.5204, longitude: 74.3587 }, permissions: ['geolocation'] });

declare global {
  interface Window {
    __bg: { watchers: Array<{ options: Record<string, unknown> }>; removed: string[]; http: Array<{ url: string; headers: Record<string, string>; data: unknown; status: number }> };
    __bgFire: (latitude: number, longitude: number) => void;
  }
}

async function asTheRiderApp(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    window.__bg = { watchers: [], removed: [], http: [] };
    let callback: ((location?: unknown, error?: unknown) => void) | null = null;
    window.__bgFire = (latitude, longitude) => callback?.({ latitude, longitude, accuracy: 5, time: Date.now() });
    (window as unknown as Record<string, unknown>).Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'android',
      Plugins: {
        BackgroundGeolocation: {
          addWatcher: async (options: Record<string, unknown>, cb: (location?: unknown, error?: unknown) => void) => {
            window.__bg.watchers.push({ options });
            callback = cb;
            return `watcher-${window.__bg.watchers.length}`;
          },
          removeWatcher: async ({ id }: { id: string }) => void window.__bg.removed.push(id),
          openSettings: async () => undefined,
        },
        // The phone's own HTTP: here, a plain fetch from the page.
        CapacitorHttp: {
          request: async ({ url, method, headers, data }: { url: string; method: string; headers: Record<string, string>; data: unknown }) => {
            const res = await fetch(url, { method, headers, body: JSON.stringify(data) });
            const body = await res.json().catch(() => null);
            window.__bg.http.push({ url, headers, data, status: res.status });
            return { status: res.status, data: body };
          },
        },
      },
    };
  });
}

async function signInAsRider(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel(/Email Address/).fill(process.env.E2E_RIDER_EMAIL ?? 'e2e-rider@nuray.test');
  await page.getByLabel('Password').fill(process.env.E2E_RIDER_PASSWORD ?? 'RiderPass123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });
}

const bg = (page: import('@playwright/test').Page) => page.evaluate(() => window.__bg);

test('"Allow": the phone watches in the background and sends the positions itself', async ({ page }) => {
  await asTheRiderApp(page);
  await signInAsRider(page);

  const notice = page.getByTestId('background-location-notice');
  await expect(notice).toBeVisible({ timeout: 20_000 });
  await expect(notice).toContainText('even when the app is closed');
  await expect(notice).toContainText('It stops when your last job is done');
  // Nothing is asked of the phone before the rider answers.
  expect((await bg(page)).watchers).toHaveLength(0);

  await notice.getByRole('button', { name: 'Allow' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(async () => (await bg(page)).watchers.length).toBe(1);
  expect((await bg(page)).watchers[0].options).toMatchObject({
    backgroundTitle: 'Nuray: delivery in progress',
    backgroundMessage: 'Sharing your location with the customer until the job is done.',
    requestPermissions: true,
    stale: false,
  });

  await page.evaluate(() => window.__bgFire(31.5204, 74.3587));
  await expect.poll(async () => (await bg(page)).http.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const [sent] = (await bg(page)).http;
  expect(sent.url).toMatch(/^https?:\/\/[^/]+\/api\/v1\/riders\/deliveries\/[^/]+\/location$/);
  expect(sent.headers.Authorization).toMatch(/^Bearer .+/);
  expect(sent.data).toEqual({ latitude: 31.5204, longitude: 74.3587 });
  expect(sent.status).toBe(200);
  await expect(page.getByTestId('location-sharing')).toContainText('Sharing your location');

  // The choice is kept: the next visit goes straight to the phone's watch.
  await page.reload();
  await expect.poll(async () => (await bg(page)).watchers.length, { timeout: 20_000 }).toBe(1);
  await expect(page.getByTestId('background-location-notice')).toHaveCount(0);
});

test('"Only while the app is open": the browser watch shares, and the question can be asked again', async ({ page }) => {
  await asTheRiderApp(page);
  const posted: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/riders\/deliveries\/[^/]+\/location/.test(r.url())) posted.push(r.url());
  });
  await signInAsRider(page);

  const notice = page.getByTestId('background-location-notice');
  await notice.getByRole('button', { name: 'Only while the app is open' }).click();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => posted.length, { timeout: 20_000, message: 'the browser watch sends the position' }).toBeGreaterThan(0);
  expect((await bg(page)).watchers).toHaveLength(0);
  expect((await bg(page)).http).toHaveLength(0);

  await page.getByTestId('background-location-ask').click();
  await expect(page.getByTestId('background-location-notice')).toBeVisible();
});
