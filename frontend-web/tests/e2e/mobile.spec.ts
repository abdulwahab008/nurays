import { test, expect } from '@playwright/test';

/**
 * The public site on a phone (the `mobile` project: Chromium with a Pixel 7's screen, touch and user agent). Most of the
 * people who order food here do it from a phone, so this is what breaks first there: a page wider than the screen, a menu
 * that cannot be reached, and the files that make the site installable.
 */

/** Pages anyone can open. Each must fit the width of the screen: a page that scrolls sideways is broken on a phone. */
const PUBLIC_PAGES = ['/', '/products', '/login', '/register', '/forgot-password', '/help', '/terms', '/privacy', '/refund-policy', '/cart'];

const widthOf = (page: import('@playwright/test').Page) =>
  page.evaluate(() => ({ screen: window.innerWidth, page: document.documentElement.scrollWidth }));

test.describe('on a phone', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} fits the width of the screen`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const { screen, page: pageWidth } = await widthOf(page);
      expect(pageWidth, `${path} is ${pageWidth}px wide on a ${screen}px screen`).toBeLessThanOrEqual(screen);
    });
  }

  test('a dish opens from the list and its page fits the screen', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: /^Dishes/ }).tap();
    const first = page.locator('a[href*="/products/"]').first();
    await expect(first).toBeVisible({ timeout: 15000 });
    await first.tap();
    await expect(page).toHaveURL(/\/products\/[^/?#]+/, { timeout: 15000 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 15000 });
    const { screen, page: pageWidth } = await widthOf(page);
    expect(pageWidth, `the dish page is ${pageWidth}px wide on a ${screen}px screen`).toBeLessThanOrEqual(screen);
  });

  test('the menu opens to the pages a visitor needs, fits the screen, and a tap on a page goes there', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Open navigation menu' }).tap();
    const menu = page.locator('aside', { has: page.getByRole('link', { name: 'All Dishes & Menus' }) });
    for (const name of ['All Dishes & Menus', 'Verified Kitchens', 'Sign In', 'Join', 'Open a Home Kitchen']) {
      await expect(menu.getByRole('link', { name }), `the menu links to "${name}"`).toBeVisible();
    }
    const box = await menu.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await menu.getByRole('link', { name: 'All Dishes & Menus' }).tap();
    await expect(page).toHaveURL(/\/products/);
  });

  test('the page can use the whole screen, notch and home indicator included, and the visitor can still zoom', async ({ page }) => {
    await page.goto('/');
    const content = (await page.locator('meta[name="viewport"]').getAttribute('content')) ?? '';
    expect(content).toContain('width=device-width');
    // Without viewport-fit=cover the safe-area insets are always 0, and the fixed bars sit under the notch and the home indicator.
    expect(content).toContain('viewport-fit=cover');
    expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?(?![\d.])/);
  });

  test('can be installed: a manifest with an id, a scope, a start page and icons that load', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = await res.json();
    expect(manifest).toMatchObject({ id: '/', scope: '/', start_url: '/', display: 'standalone' });
    const icons: Array<{ src: string; sizes: string; purpose?: string }> = manifest.icons;
    expect(icons.map((i) => `${i.sizes} ${i.purpose ?? 'any'}`)).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']));
    for (const icon of icons) {
      expect((await request.get(icon.src)).status(), `the icon ${icon.src} loads`).toBe(200);
    }
  });
});
