import { test, expect, devices } from '@playwright/test';

/**
 * A rider who opens Google Maps and comes back: the browser has paused the dashboard, so it must send where
 * the rider is at once and keep the screen awake again, instead of waiting for the next movement (DELIV-7).
 * Run on a phone-sized screen against the E2E rider, who carries one job on the move (backend/prisma/seed-e2e.ts).
 * The phone is placed far from both ends of that job, so sharing its position cannot move the job on.
 */
const { defaultBrowserType: _browser, ...phone } = devices['Pixel 7'];
test.use({ ...phone, geolocation: { latitude: 31.5204, longitude: 74.3587 }, permissions: ['geolocation'] });

declare global {
  interface Window {
    __wake: { requests: number; sentinels: Array<{ fire: () => void }> };
    __setVisibility: (state: 'hidden' | 'visible') => void;
  }
}

const isPosition = (url: string) => /\/riders\/deliveries\/[^/]+\/location/.test(url);

test('coming back to the dashboard sends the rider\'s position at once and asks for the screen lock again', async ({ page }) => {
  // A wake lock and a page the phone can hide, which the sandbox browser does not do on its own.
  await page.addInitScript(() => {
    window.__wake = { requests: 0, sentinels: [] };
    Object.defineProperty(navigator, 'wakeLock', {
      configurable: true,
      value: {
        request: async () => {
          window.__wake.requests++;
          const listeners: Array<() => void> = [];
          const sentinel = { addEventListener: (_: string, fn: () => void) => listeners.push(fn), release: async () => {}, fire: () => listeners.forEach((fn) => fn()) };
          window.__wake.sentinels.push(sentinel);
          return sentinel;
        },
      },
    });
    window.__setVisibility = (state) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      // The browser lets go of the screen lock when the page is hidden.
      if (state === 'hidden') window.__wake.sentinels.forEach((s) => s.fire());
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });

  const sent: number[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && isPosition(request.url())) sent.push(Date.now());
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel(/Email Address/).fill(process.env.E2E_RIDER_EMAIL ?? 'e2e-rider@nuray.test');
  await page.getByLabel('Password').fill(process.env.E2E_RIDER_PASSWORD ?? 'RiderPass123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });

  // The job on the move starts sharing: one position, and the screen lock.
  await expect.poll(() => sent.length, { timeout: 20_000, message: 'the first position is sent' }).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__wake.requests), { message: 'the screen lock is asked for' }).toBeGreaterThan(0);
  const locksBefore = await page.evaluate(() => window.__wake.requests);
  // The server keeps one position every 3 s: wait that long, so the next one is not refused for coming too soon.
  await page.waitForTimeout(3500);
  const sentBefore = sent.length;

  // Off to Google Maps and back.
  await page.evaluate(() => window.__setVisibility('hidden'));
  await page.waitForTimeout(300);
  const answer = page.waitForResponse((response) => response.request().method() === 'POST' && isPosition(response.url()), { timeout: 5_000 });
  await page.evaluate(() => window.__setVisibility('visible'));

  // The position goes out at once (the steady rhythm is 10 s) and the server takes it.
  expect((await answer).status()).toBe(200);
  expect(sent.length).toBeGreaterThan(sentBefore);
  // The browser had let go of the lock, so the page asks for it again.
  await expect.poll(() => page.evaluate(() => window.__wake.requests), { message: 'the screen lock is asked for again' }).toBeGreaterThan(locksBefore);
});
