import { test, expect, request, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
const ARTIFACT_SCREENSHOT_DIR = '/Users/apple/.gemini/antigravity-ide/brain/b5ab1d9a-10a7-43f3-9b36-7132ded48fbd/customer_tabs';

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
) {
  const url = `${API_BASE}/${endpoint.replace(/^\//, '')}`;
  return ctx.post(url, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    data: body,
  });
}

async function createVerifiedCustomerWithData() {
  const ctx = await api();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `customer-e2e-${suffix}@example.com`;
  const password = 'Password123!';

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
    `SELECT id FROM products WHERE id = '1e24a3f6-9043-4710-959a-afda9ccfe65a' OR (is_active = true AND approval_status = 'approved' AND stock_quantity >= 5) ORDER BY CASE WHEN id = '1e24a3f6-9043-4710-959a-afda9ccfe65a' THEN 0 ELSE 1 END LIMIT 1`,
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
    await page.getByLabel(/Email Address/).fill(data.email);
    await page.getByLabel('Password').fill(data.password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Wait until logged in
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 15_000 });

    // Helper to verify sidebar active item
    const verifySidebarActive = async (expectedActiveName: string) => {
      const sidebarNav = page.locator('aside nav');
      await expect(sidebarNav).toBeVisible();

      // Check all 7 standard items exist
      const standardItems = [
        'Dashboard',
        'Kitchens & Menus',
        'My Orders',
        'My Cart',
        'My Profile',
        'Saved Addresses',
        'Help & Support',
      ];

      for (const itemName of standardItems) {
        const itemLink = sidebarNav.getByRole('link', { name: itemName, exact: true });
        await expect(itemLink).toBeVisible();

        // Check SVG icon exists
        const svgIcon = itemLink.locator('svg');
        await expect(svgIcon).toBeVisible();

        // Check active state
        const styleAttr = await itemLink.getAttribute('style');
        if (itemName === expectedActiveName) {
          expect(
            styleAttr,
            `Sidebar item "${itemName}" should be active on ${page.url()}`,
          ).toContain('rgb(255, 85, 0)'); // #FF5500 accent
        } else {
          expect(
            styleAttr,
            `Sidebar item "${itemName}" should NOT be active on ${page.url()}`,
          ).toContain('background: transparent');
        }
      }
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

    // Check Dashboard Elements
    await expect(page.getByText(/Total Orders/i)).toBeVisible();
    await expect(page.getByText(/Total Spent/i)).toBeVisible();
    await expect(page.getByText(/Active Platform Deals|Tonight's Cravings/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '01_dashboard.png'),
      fullPage: true,
    });

    // --- TAB 2: KITCHENS & MENUS (/products) ---
    await page.getByRole('link', { name: 'Kitchens & Menus', exact: true }).click();
    await expect(page).toHaveURL(/\/products/);
    await page.waitForLoadState('load');
    await verifySidebarActive('Kitchens & Menus');
    await verifyNoHorizontalOverflow();

    await expect(page.getByPlaceholder(/Search for biryani/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Search Food/i })).toBeVisible();
    await expect(page.getByText(/Browse Home Kitchens/i)).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '02_products.png'),
      fullPage: true,
    });

    // --- TAB 3: PRODUCT DETAIL (/products/[id]) ---
    await page.goto(`/products/${data.productId}`, { waitUntil: 'load' });
    await expect(page).toHaveURL(new RegExp(`/products/${data.productId}`));
    // On product detail, "Kitchens & Menus" must remain active
    await verifySidebarActive('Kitchens & Menus');
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('button', { name: /Add to (bag|cart)/i })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '03_product_detail.png'),
      fullPage: true,
    });

    // --- TAB 4: MY ORDERS (/orders) ---
    await page.getByRole('link', { name: 'My Orders', exact: true }).click();
    await expect(page).toHaveURL(/\/orders/);
    await page.waitForLoadState('load');
    await verifySidebarActive('My Orders');
    await verifyNoHorizontalOverflow();

    // Check order card is visible with our created order
    await expect(page.getByText(data.order.orderNumber)).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '04_orders.png'),
      fullPage: true,
    });

    // --- TAB 5: ORDER DETAIL (/orders/[id]) ---
    await page.locator(`a[href="/orders/${data.order.id}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(`/orders/${data.order.id}`));
    await page.waitForLoadState('load');
    // On order detail, "My Orders" must remain active
    await verifySidebarActive('My Orders');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText(`Order ${data.order.orderNumber}`)).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '05_order_detail.png'),
      fullPage: true,
    });

    // --- TAB 6: MY CART (/cart) ---
    await page.getByRole('link', { name: 'My Cart', exact: true }).click();
    await expect(page).toHaveURL(/\/cart/);
    await page.waitForLoadState('load');
    await verifySidebarActive('My Cart');
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('button', { name: /Proceed to Checkout/i })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '06_cart.png'),
      fullPage: true,
    });

    // --- TAB 7: CHECKOUT (/checkout) ---
    await page.getByRole('button', { name: /Proceed to Checkout/i }).click();
    await expect(page).toHaveURL(/\/checkout/);
    await page.waitForLoadState('load');
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('heading', { name: 'Delivery Address' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Payment Method' })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '07_checkout.png'),
      fullPage: true,
    });

    // --- TAB 8: MY PROFILE (/profile) ---
    await page.getByRole('link', { name: 'My Profile', exact: true }).click();
    await expect(page).toHaveURL(/\/profile/);
    await page.waitForLoadState('load');
    // Crucial: "My Profile" is active, "Saved Addresses" is NOT active
    await verifySidebarActive('My Profile');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText('Personal Information')).toBeVisible();
    await expect(page.getByText(data.email).first()).toBeVisible();
    await page.getByRole('button', { name: /Edit/i }).click();
    await expect(page.getByPlaceholder('Enter your name')).toHaveValue('Sara Khan');
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '08_profile.png'),
      fullPage: true,
    });

    // --- TAB 9: SAVED ADDRESSES (/profile/addresses) ---
    await page.getByRole('link', { name: 'Saved Addresses', exact: true }).click();
    await expect(page).toHaveURL(/\/profile\/addresses/);
    await page.waitForLoadState('load');
    // Crucial: "Saved Addresses" is active, "My Profile" is NOT active!
    await verifySidebarActive('Saved Addresses');
    await verifyNoHorizontalOverflow();

    await expect(page.getByText('Apartment 4B, Ocean View Towers')).toBeVisible();
    await expect(page.getByText(/Default/i).first()).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '09_addresses.png'),
      fullPage: true,
    });

    // --- TAB 10: HELP & SUPPORT (/support) ---
    await page.getByRole('link', { name: 'Help & Support', exact: true }).click();
    await expect(page).toHaveURL(/\/support/);
    await page.waitForLoadState('load');
    await verifySidebarActive('Help & Support');
    await verifyNoHorizontalOverflow();

    // Check FAQs, Contact Us, and My Tickets tabs
    await expect(page.getByRole('button', { name: /FAQs/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Contact Us/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /My Tickets/i })).toBeVisible();

    // Test FAQ expansion
    const firstFaq = page.locator('button').filter({ hasText: /What payment methods are accepted|What are the delivery hours/i }).first();
    if (await firstFaq.isVisible()) {
      await firstFaq.click();
    }
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '10_support.png'),
    });

    // --- TAB 11: NOTIFICATIONS (/notifications) ---
    await page.goto('/notifications', { waitUntil: 'load' });
    await expect(page).toHaveURL(/\/notifications/);
    await verifyNoHorizontalOverflow();

    await expect(page.getByRole('heading', { name: /Notifications/i })).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '11_notifications.png'),
      fullPage: true,
    });

    // Assert zero critical console errors
    expect(consoleErrors, `Unexpected console errors: ${consoleErrors.join('\n')}`).toEqual([]);

    await data.ctx.dispose();
  });
});
