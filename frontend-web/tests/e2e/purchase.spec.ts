import { test, expect, request, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
const SAMPLE_PRODUCT_ID = '1e24a3f6-9043-4710-959a-afda9ccfe65a';

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
  path: string,
  body: unknown,
  jwt?: string,
) {
  const url = `${API_BASE}/${path.replace(/^\//, '')}`;
  return ctx.post(url, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    data: body,
  });
}

async function createVerifiedCustomer() {
  const ctx = await api();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `e2e-${suffix}@example.com`;
  const password = 'Pass123!';

  // Register — backend may 500 on email send (Gmail SMTP), but the user row is
  // committed before the email send. We tolerate either outcome and read the
  // verification token directly from the DB, which is the canonical pattern
  // for E2E suites (no real mailbox available).
  await postJson(ctx, '/auth/register', {
    email,
    password,
    user_type: 'customer',
    full_name: 'E2E Buyer',
    city: 'Karachi',
    area: 'DHA',
  });

  const token = dbQuery(
    `SELECT ev.token FROM email_verifications ev JOIN users u ON u.id = ev.user_id WHERE u.email = '${email}' ORDER BY ev.created_at DESC LIMIT 1`,
  );
  expect(token, 'verification token should be in DB after register').toHaveLength(64);

  const verifyResp = await postJson(ctx, '/auth/verify-email', { token });
  expect(verifyResp.status(), 'verify-email should succeed').toBe(200);

  const loginResp = await postJson(ctx, '/auth/login', {
    phoneOrEmail: email,
    otpCodeOrPassword: password,
    loginMethod: 'email',
  });
  expect(loginResp.status(), 'login should succeed').toBe(200);
  const loginBody = await loginResp.json();
  const jwt = loginBody.data.tokens.access_token as string;
  expect(jwt.length).toBeGreaterThan(20);

  const addrResp = await postJson(
    ctx,
    '/users/me/addresses',
    {
      label: 'Home',
      addressLine1: '123 Test Street',
      area: 'DHA Phase 5',
      city: 'Karachi',
      isDefault: true,
    },
    jwt,
  );
  expect(addrResp.status()).toBe(201);
  const addrBody = await addrResp.json();
  const addressId = addrBody.data.id as string;

  return { ctx, email, password, jwt, addressId };
}

test.describe('Nuray customer purchase', () => {
  test('API: register → verify → login → address → cart → COD order → /orders/me', async () => {
    const { ctx, jwt, addressId } = await createVerifiedCustomer();

    const cartResp = await postJson(
      ctx,
      '/cart/items',
      { productId: SAMPLE_PRODUCT_ID, quantity: 1 },
      jwt,
    );
    expect(cartResp.status()).toBe(201);

    const orderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 1 }],
        deliveryType: 'home_delivery',
        deliveryAddressId: addressId,
        paymentMethod: 'cod',
      },
      jwt,
    );
    expect(orderResp.status()).toBe(201);
    const orderBody = await orderResp.json();
    const order = orderBody.data.order;
    expect(order.orderNumber).toMatch(/^FN\d+/);
    expect(order.paymentMethod).toBe('cod');
    expect(order.orderStatus).toMatch(/pending|confirmed/);

    const listResp = await ctx.get(`${API_BASE}/orders/me?page=1&limit=5`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    expect(listResp.status()).toBe(200);
    const listBody = await listResp.json();
    const orderIds = listBody.data.orders.map((o: { id: string }) => o.id);
    expect(orderIds, '/orders/me should contain the new order').toContain(order.id);

    await ctx.dispose();
  });

  test('UI: customer logs in and sees their COD order in /orders', async ({ page }) => {
    // Pre-create user + order via API; drive the UI for the customer-facing path
    const { ctx, email, password, jwt, addressId } = await createVerifiedCustomer();
    const orderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [{ productId: SAMPLE_PRODUCT_ID, quantity: 2 }],
        deliveryType: 'home_delivery',
        deliveryAddressId: addressId,
        paymentMethod: 'cod',
      },
      jwt,
    );
    const order = (await orderResp.json()).data.order as {
      orderNumber: string;
      id: string;
    };

    // Drive the login UI
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page, 'login should redirect off /login').not.toHaveURL(/\/login(\?|$)/, {
      timeout: 10_000,
    });

    // Verify the order appears
    await page.goto('/orders');
    await expect(page).toHaveURL(/\/orders/);
    await expect(page.getByText(order.orderNumber)).toBeVisible({ timeout: 10_000 });

    await ctx.dispose();
  });

  test('UI: add to cart from product detail (authenticated session)', async ({ page }) => {
    const { ctx, email, password } = await createVerifiedCustomer();

    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });

    // Wait for the POST /cart/items response triggered by the Add-to-cart button.
    const cartAdded = page.waitForResponse(
      (r) =>
        r.url().includes('/api/v1/cart/items') &&
        r.request().method() === 'POST' &&
        r.status() < 400,
      { timeout: 10_000 },
    );

    await page.goto(`/products/${SAMPLE_PRODUCT_ID}`);
    await page.getByRole('button', { name: /Add to (cart|bag)/i }).click();
    const resp = await cartAdded;
    expect(resp.ok()).toBe(true);

    await ctx.dispose();
  });
});
