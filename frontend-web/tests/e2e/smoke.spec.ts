import { test, expect, request } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';

test.describe('Nuray smoke', () => {
  test('landing page renders and links to core routes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Nuray/i);
    await expect(page.locator('text=NURAY').first()).toBeVisible();
    await expect(page.locator('a[href="/products"]').first()).toBeVisible();
    await expect(page.locator('a[href="/login"]').first()).toBeVisible();
  });

  // A first visit has no area chosen: the Kitchens tab asks for one, and the Dishes tab
  // lists the whole catalog.
  test('/products lists items fetched from backend', async ({ page }) => {
    await page.goto('/products');
    await expect(page.getByRole('heading', { level: 1, name: /Home Kitchens & Menus/i })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^Dishes/ }).click();
    const cards = page.locator('a[href*="/products/"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('kitchen/product link navigates and displays details', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: /^Dishes/ }).click();
    const firstLink = page.locator('a[href*="/products/"]').first();
    await expect(firstLink).toBeVisible({ timeout: 15000 });
    await firstLink.click();
    await expect(page).toHaveURL(/\/(kitchens|products)\//, { timeout: 15000 });
  });

  test('/login renders OTP + Email tabs and Google sign-in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'OTP', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });

  test('/register renders role choices and email field', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /Create Your Account/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Order Food/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cook & Sell/i })).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });

  test('/checkout redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/login/);
  });

  test('no console errors across smoke pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        if (text.includes('favicon.ico')) return;
        errors.push(text);
      }
    });
    for (const path of ['/', '/products', '/login', '/register']) {
      // Wait for `load`, not `networkidle` — the app holds an open socket.io
      // connection, so the network never goes fully idle and `networkidle`
      // would time out. Give the page a moment to flush any console errors.
      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
    }
    expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
  });

  test('backend API health endpoints respond', async () => {
    const api = await request.newContext();
    for (const path of ['health', 'categories', 'products']) {
      const url = `${API_BASE.replace(/\/$/, '')}/${path}`;
      const r = await api.get(url);
      expect(r.status(), `${url} should be 200`).toBe(200);
    }
    await api.dispose();
  });
});
