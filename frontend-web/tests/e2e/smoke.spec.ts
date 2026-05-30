import { test, expect, request } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';

test.describe('Nuray smoke', () => {
  test('landing page renders and links to core routes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Nuray/i);
    await expect(
      page.getByRole('heading', { name: /The taste of[\s\S]*home,[\s\S]*delivered/i }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: "Today's plates" }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Join Nuray' })).toBeVisible();
  });

  test('/products lists items fetched from backend', async ({ page }) => {
    const productsResp = page.waitForResponse(
      (r) => r.url().includes('/api/v1/products') && r.status() === 200,
    );
    await page.goto('/products');
    await productsResp;
    await expect(page.getByRole('heading', { name: "Today's plates" })).toBeVisible();
    const cards = page.getByRole('link', { name: /Rs\s\d/ });
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('product detail page renders with Add to bag CTA', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('link', { name: /Rs\s\d/ }).first().click();
    await expect(page).toHaveURL(/\/products\/[0-9a-f-]{36}/);
    await expect(page.getByRole('heading', { name: 'Description' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Add to (cart|bag)/i })).toBeVisible();
  });

  test('/login renders OTP + Email tabs and Google sign-in', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByRole('button', { name: 'OTP', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  });

  test('/register renders buyer/seller toggle and required fields', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: /Join Nuray/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Buy food/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sell food/i })).toBeVisible();
    await expect(page.getByLabel(/Email Address/i)).toBeVisible();
    await expect(page.getByLabel(/^Password \*/i)).toBeVisible();
  });

  test('/cart redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/cart');
    await expect(page).toHaveURL(/\/login/);
  });

  test('no console errors across smoke pages', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
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
