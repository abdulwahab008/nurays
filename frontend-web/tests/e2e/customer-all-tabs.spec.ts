import { test, expect, request, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
const ARTIFACT_SCREENSHOT_DIR = process.env.ARTIFACT_SCREENSHOT_DIR ?? path.join(process.cwd(), 'test-results', 'customer_tabs');

function dbQuery(sql: string): string {
  return execSync(`psql "${DB_URL}" -tA -c "${sql.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
  }).trim();
}

async function api(): Promise<APIRequestContext> {
  return request.newContext();
}

async function postJson(
  ctx: APIRequestContext,
  endpoint: string,
  body: unknown,
  jwt?: string,
  extraHeaders: Record<string, string> = {},
) {
  const url = `${API_BASE}/${endpoint.replace(/^\//, '')}`;
  return ctx.post(url, {
    headers: { ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...extraHeaders },
    data: body,
  });
}

async function createVerifiedCustomerWithData() {
  const ctx = await api();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `customer-e2e-${suffix}@example.com`;
  const password = 'Lantern-Quartz-71!';

  // Register
  await postJson(ctx, '/auth/register', {
    email,
    password,
    user_type: 'customer',
    full_name: 'Sara Khan',
    city: 'Karachi',
    area: 'Clifton',
  });

  // Verify email directly via DB token
  const token = dbQuery(
    `SELECT ev.token FROM email_verifications ev JOIN users u ON u.id = ev.user_id WHERE u.email = '${email}' ORDER BY ev.created_at DESC LIMIT 1`,
  );
  expect(token).toHaveLength(64);

  const verifyResp = await postJson(ctx, '/auth/verify-email', { token });
  expect(verifyResp.status()).toBe(200);

  // Login via API to get JWT
  const loginResp = await postJson(ctx, '/auth/login', {
    phoneOrEmail: email,
    otpCodeOrPassword: password,
    loginMethod: 'email',
  });
  expect(loginResp.status()).toBe(200);
  const loginBody = await loginResp.json();
  const jwt = loginBody.data.tokens.access_token as string;

  // Add default saved address
  const addrResp = await postJson(
    ctx,
    '/users/me/addresses',
    {
      label: 'Home',
      addressLine1: 'Apartment 4B, Ocean View Towers',
      area: 'Clifton Block 2',
      city: 'Karachi',
      isDefault: true,
      latitude: 24.8145,
      longitude: 67.0345,
    },
    jwt,
  );
  expect(addrResp.status()).toBe(201);
  const addrBody = await addrResp.json();
  const addressId = addrBody.data.id as string;

  // Query an active approved product with sufficient stock
  const productId = dbQuery(
    `SELECT id FROM products WHERE is_active = true AND approval_status = 'approved' AND stock_quantity >= 5 LIMIT 1`,
  );
  expect(productId).toBeTruthy();

  // Add item to cart
  const cartResp = await postJson(
    ctx,
    '/cart/items',
    { productId, quantity: 1 },
    jwt,
  );
  expect(cartResp.status()).toBe(201);

  // Create an order so /orders and /orders/[id] have data
  const orderResp = await postJson(
    ctx,
    '/orders',
    {
      items: [{ productId, quantity: 1 }],
      deliveryType: 'home_delivery',
      deliveryAddressId: addressId,
      paymentMethod: 'cod',
    },
    jwt,
    { 'Idempotency-Key': crypto.randomUUID() },
  );
  expect(orderResp.status()).toBe(201);
  const orderBody = await orderResp.json();
  const order = orderBody.data.order as { id: string; orderNumber: string };

  return { ctx, email, password, jwt, addressId, productId, order };
}

test.describe('Customer Module E2E - All Tabs & Visual Polish', () => {
  test.beforeAll(() => {
    if (!fs.existsSync(ARTIFACT_SCREENSHOT_DIR)) {
      fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('comprehensive navigation, styling, and active-state verification across all customer tabs', async ({
    page,
  }) => {
    // 1. Prepare customer session with active data
    const data = await createVerifiedCustomerWithData();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const txt = msg.text();
        // Ignore expected socket.io teardown/reconnect or favicon noise
        if (!txt.includes('socket.io') && !txt.includes('favicon')) {
          consoleErrors.push(txt);
        }
      }
    });
    page.on('response', (res) => {
      if (res.status() === 404) {
        console.log('404 URL:', res.url());
      }
    });

    // 2. Perform UI Login
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: /Welcome back/i })).toBeVisible();

    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill(data.email);
    await page.getByLabel('Password').fill(data.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Wait until logged in
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });

    const verifySidebarActive = async (expectedActiveName: string) => {
      const sidebarNav = page.locator('aside nav');
      await expect(sidebarNav).toBeVisible();

      const items = ['Dashboard', 'Kitchens & menus', 'Saved kitchens', 'My orders', 'Nuray wallet', 'My profile', 'Saved addresses', 'Help and support'];
      for (const itemName of items) {
        const itemLink = sidebarNav.getByRole('link', { name: itemName, exact: true });
        await expect(itemLink).toBeVisible();
        await expect(itemLink.locator('svg')).toBeVisible();
      }

      const active = sidebarNav.locator('a[aria-current="page"]');
      await expect(active, `one active sidebar item on ${page.url()}`).toHaveCount(1);
      await expect(active).toHaveText(expectedActiveName);
    };

    // Helper to verify page has no horizontal overflow
    const verifyNoHorizontalOverflow = async () => {
      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 2;
      });
      expect(hasOverflow, `Page should not have horizontal overflow on ${page.url()}`).toBeFalsy();
    };

    // --- TAB 1: DASHBOARD (/dashboard) ---
    await page.goto('/dashboard', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/dashboard/);
    await verifySidebarActive('Dashboard');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText(`Order #${data.order.orderNumber}`)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Explore by cuisine' })).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '01_dashboard.png'), fullPage: true });

    // --- TAB 2: DISHES (/products), on the public site layout without the sidebar ---
    await page.locator('aside nav').getByRole('link', { name: 'Kitchens & menus', exact: true }).click();
    await expect(page).toHaveURL(/\/products/);
    await page.waitForLoadState('load');
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('heading', { name: 'Dishes near you' })).toBeVisible();
    await expect(page.getByText(/Found \d+ dishes/)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '02_products.png'), fullPage: true });

    // --- TAB 3: PRODUCT DETAIL (/products/[id]) ---
    await page.goto(`/products/${data.productId}`, { waitUntil: 'load' });
    await expect(page).toHaveURL(new RegExp(`/products/${data.productId}`));
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('button', { name: /Add to tray/i })).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '03_product_detail.png'), fullPage: true });

    // --- TAB 4: MY ORDERS (/orders) ---
    await page.goto('/orders', { waitUntil: 'load' });
    await verifySidebarActive('My orders');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText(`#${data.order.orderNumber}`)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '04_orders.png'), fullPage: true });

    // --- TAB 5: ORDER DETAIL (/orders/[id]) ---
    await page.locator(`a[href="/orders/${data.order.id}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/orders/${data.order.id}`));
    await page.waitForLoadState('load');
    await verifySidebarActive('My orders');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText(`Order ${data.order.orderNumber}`)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '05_order_detail.png'), fullPage: true });

    // --- TAB 6: MY TRAY (/cart), reached from the top bar, not the sidebar ---
    await page.goto('/cart', { waitUntil: 'load' });
    await expect(page.getByRole('heading', { name: 'My tray' })).toBeVisible();
    await expect(page.locator('aside nav a[aria-current="page"]')).toHaveCount(0);
    await verifyNoHorizontalOverflow();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '06_cart.png'), fullPage: true });

    // --- TAB 7: CHECKOUT (/checkout) ---
    await page.getByRole('button', { name: 'Go to checkout' }).or(page.getByRole('link', { name: 'Go to checkout' })).click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.waitForLoadState('load');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText('Delivery address', { exact: true })).toBeVisible();
    await expect(page.getByText('Cash on delivery', { exact: true })).toBeVisible();
    await expect(page.getByText('Apartment 4B, Ocean View Towers, Clifton Block 2, Karachi')).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '07_checkout.png'), fullPage: true });

    // --- TAB 8: MY PROFILE (/profile) ---
    await page.locator('aside nav').getByRole('link', { name: 'My profile', exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await page.waitForLoadState('load');
    // "My profile" is active, "Saved addresses" is not
    await verifySidebarActive('My profile');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText('Personal information', { exact: true })).toBeVisible();
    await expect(page.getByText(data.email).first()).toBeVisible();
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(page.getByPlaceholder('Enter your name')).toHaveValue('Sara Khan');
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '08_profile.png'), fullPage: true });

    // --- TAB 9: SAVED ADDRESSES (/profile/addresses) ---
    await page.locator('aside nav').getByRole('link', { name: 'Saved addresses', exact: true }).click();
    await expect(page).toHaveURL(/\/profile\/addresses/);
    await page.waitForLoadState('load');
    // "Saved addresses" is active, "My profile" is not
    await verifySidebarActive('Saved addresses');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText('Apartment 4B, Ocean View Towers', { exact: true })).toBeVisible();
    await expect(page.getByText('Default', { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '09_addresses.png'), fullPage: true });

    // --- TAB 10: HELP AND SUPPORT (/support) ---
    await page.locator('aside nav').getByRole('link', { name: 'Help and support', exact: true }).click();
    await expect(page).toHaveURL(/\/support/);
    await page.waitForLoadState('load');
    await verifySidebarActive('Help and support');
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('tab', { name: 'FAQs' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Contact us' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'My tickets' })).toBeVisible();
    await page.getByText('How do I order?', { exact: true }).click();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '10_support.png') });

    // --- TAB 11: NOTIFICATIONS (/notifications) ---
    await page.goto('/notifications', { waitUntil: 'load' });
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
    await expect(page.getByText(`Your order #${data.order.orderNumber}`)).toBeVisible();
    await page.screenshot({ path: path.join(ARTIFACT_SCREENSHOT_DIR, '11_notifications.png'), fullPage: true });

    // Assert zero critical console errors
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('\n')}`).toEqual([]);

    await data.ctx.dispose();
  });
});
