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
) {
  const url = `${API_BASE}/${endpoint.replace(/^\//, '')}`;
  return ctx.post(url, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
    data: body,
  });
}

interface TestUserSession {
  email: string;
  jwt: string;
  user: any;
  addressId: string;
}

async function createVerifiedCustomer(): Promise<TestUserSession> {
  const ctx = await api();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `buyer-test-${suffix}@example.com`;
  const password = 'Password123!';

  // 1. Register
  await postJson(ctx, '/auth/register', {
    email,
    password,
    user_type: 'customer',
    full_name: 'Sara Khan',
    city: 'Karachi',
    area: 'Askari 11',
  });

  // 2. Ensure verified & active in DB
  dbQuery(`UPDATE users SET email_verified = true, status = 'active' WHERE email = '${email}'`);

  // 3. Login via API
  const loginResp = await postJson(ctx, '/auth/login', {
    phoneOrEmail: email,
    otpCodeOrPassword: password,
    loginMethod: 'email',
  });
  const loginBody = await loginResp.json();
  const jwt = loginBody.data?.tokens?.access_token || '';
  const user = loginBody.data?.user || {};

  // 4. Create default delivery address in Askari 11
  const addrResp = await postJson(
    ctx,
    '/users/me/addresses',
    {
      label: 'Home (Askari 11)',
      addressLine1: 'Villa 14, Sector C, Askari 11',
      area: 'Askari 11',
      city: 'Karachi',
      isDefault: true,
      latitude: 24.9125,
      longitude: 67.115,
    },
    jwt,
  );
  const addrBody = await addrResp.json();
  const addressId = addrBody.data?.id || '';

  return { email, jwt, user, addressId };
}

async function setSession(page: any, session: TestUserSession) {
  await page.addInitScript(
    ({ token, user }: { token: string; user: any }) => {
      window.localStorage.setItem('auth_token', token);
      window.localStorage.setItem('access_token', token);
      window.localStorage.setItem('token', token);
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user,
            token,
            isAuthenticated: true,
          },
          version: 0,
        }),
      );
    },
    { token: session.jwt, user: session.user },
  );

  await page.context().addCookies([
    {
      name: 'access_token',
      value: session.jwt,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'auth_token',
      value: session.jwt,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

test.describe('Buyer Hyperlocal Workflow & Operations', () => {
  test.describe.configure({ mode: 'serial' });

  let session: TestUserSession;
  let placedOrderId: string = '';

  test.beforeAll(async () => {
    session = await createVerifiedCustomer();
    if (!fs.existsSync(ARTIFACT_SCREENSHOT_DIR)) {
      fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('1. Hyperlocal Discovery, Community Detection & Tier Badges', async ({ page }) => {
    await setSession(page, session);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // Verify presence of community-driven UI elements
    await expect(page.locator('h1, h2').first()).toBeVisible();

    // Screenshot initial products listing with community context
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_01_products_hyperlocal.png'),
      fullPage: false,
    });
  });

  test('2. Single-Seller Cart Conflict Detection & Auto-Replacement', async ({ page }) => {
    await setSession(page, session);

    // Ensure cart is initially empty
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, {
      headers: { Authorization: `Bearer ${session.jwt}` },
    });

    // Step A: Add Product 1 from Claude Test Kitchen (Askari 11)
    const prod1Id = 'a0500ed2-9260-4543-a7c7-bf96397644f6'; // Biryani
    await page.goto(`/products/${prod1Id}`);
    await page.waitForLoadState('networkidle');

    const addBtn = page.locator('button:has-text("Add to bag"), button:has-text("Add to Cart")').first();
    await addBtn.waitFor({ state: 'visible' });
    await addBtn.click();
    await page.waitForTimeout(1000);

    // Screenshot product detail
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_02_product1_added.png'),
    });

    // Step B: Attempt to Add Product 2 from E2E Test Kitchen (Askari 10)
    const prod2Id = '6101a4c2-616c-4cd7-9aee-74f056f9989c'; // Samosa
    await page.goto(`/products/${prod2Id}`);
    await page.waitForLoadState('networkidle');

    const addBtn2 = page.locator('button:has-text("Add to bag"), button:has-text("Add to Cart")').first();
    await addBtn2.waitFor({ state: 'visible' });
    await addBtn2.click();

    // The CartConflictModal should appear!
    const modalHeading = page.locator('text=Start Order from a New Kitchen?');
    await expect(modalHeading).toBeVisible({ timeout: 8000 });

    // Capture screenshot of the Cart Conflict Dialog
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_03_cart_conflict_modal.png'),
    });

    // Click "Clear Cart & Add New Dish"
    const confirmClearBtn = page.locator('button:has-text("Clear Cart & Add New Dish")');
    await expect(confirmClearBtn).toBeVisible();
    await confirmClearBtn.click();
    await page.waitForTimeout(1500);

    // Verify cart page now reflects single-kitchen order
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('text=Single-Kitchen Order')).toBeVisible({ timeout: 6000 });
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_04_cart_single_seller.png'),
    });
  });

  test('3. Favorite Kitchen Toggle & Dedicated Favorites Page', async ({ page }) => {
    await setSession(page, session);

    // Go to product of Claude Test Kitchen
    const prod1Id = 'a0500ed2-9260-4543-a7c7-bf96397644f6';
    await page.goto(`/products/${prod1Id}`);
    await page.waitForLoadState('networkidle');

    // Click favorite heart button
    const favBtn = page.locator('button[title="Save Kitchen to Favorites"]');
    if (await favBtn.isVisible()) {
      await favBtn.click();
      await page.waitForTimeout(1000);
    }

    // Navigate to /favorites
    await page.goto('/favorites');
    await page.waitForLoadState('networkidle');

    // Verify page title and header
    await expect(page.locator('text=Favorite Kitchens').or(page.locator('text=Your Saved Kitchens')).first()).toBeVisible({ timeout: 6000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_05_favorites_page.png'),
    });
  });

  test('4. Checkout, Manual Payment (JazzCash/EasyPaisa) & TID Submission', async ({ page }) => {
    await setSession(page, session);

    // Ensure item in cart
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, {
      headers: { Authorization: `Bearer ${session.jwt}` },
    });
    await postJson(
      ctx,
      '/cart/items',
      { productId: '6101a4c2-616c-4cd7-9aee-74f056f9989c', quantity: 2 },
      session.jwt,
    );

    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    // Select JazzCash Direct Transfer
    const jazzcashRadio = page.locator('input[type="radio"][value="jazzcash"]');
    await jazzcashRadio.waitFor({ state: 'visible' });
    await jazzcashRadio.check();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_06_checkout_manual_payment.png'),
    });

    // Click Place Order
    const placeOrderBtn = page.locator('button:has-text("Place Order")');
    await placeOrderBtn.click();

    // Should redirect to /orders/:id
    await page.waitForURL(/\/orders\/[a-f0-9-]+/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Extract orderId from URL
    const url = page.url();
    const match = url.match(/\/orders\/([a-f0-9-]+)/);
    if (match) placedOrderId = match[1];

    // Verify Manual Payment Card is visible with payment details
    await expect(page.locator('text=Pay Directly to Kitchen').or(page.locator('text=Direct Domestic Chef Payment')).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('button:has-text("I Have Paid"), button:has-text("Submit Transaction ID")').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_07_manual_payment_card.png'),
    });

    // Click "I Have Paid / Submit Transaction ID"
    await page.locator('button:has-text("I Have Paid"), button:has-text("Submit Transaction ID")').first().click();

    // Modal opens
    const tidInput = page.locator('input[placeholder*="19284729103"], input[placeholder*="FT26259"], input[placeholder*="TID"]');
    await expect(tidInput).toBeVisible();
    await tidInput.fill('JC-99882211443');

    const senderNameInput = page.locator('input[placeholder*="Muhammad Ali"], input[placeholder*="Account Name"]');
    if (await senderNameInput.isVisible()) {
      await senderNameInput.fill('Sara Khan');
    }

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_08_tid_submission_modal.png'),
    });

    // Click "Submit Verification"
    await page.locator('button:has-text("Submit Verification"), button:has-text("Submit Payment Proof")').click();
    await page.waitForTimeout(2000);

    // Verification banner / proof submitted text
    await expect(page.locator('text=Payment Submitted — Verification in Progress').or(page.locator('text=payment submitted')).first()).toBeVisible({ timeout: 8000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_09_payment_proof_submitted.png'),
    });
  });

  test('5. In-App Order Messaging (Buyer <-> Kitchen)', async ({ page }) => {
    await setSession(page, session);

    const orderId = placedOrderId || dbQuery(
      `SELECT id FROM orders WHERE customer_id = '${session.user.id}' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(orderId).toBeTruthy();

    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle');

    // Click "Chat with Kitchen"
    const chatBtn = page.locator('button:has-text("Chat with")');
    await expect(chatBtn).toBeVisible();
    await chatBtn.click();

    // Verify chat drawer opens
    await expect(page.locator('h3:has-text("Chat with")')).toBeVisible({ timeout: 5000 });

    // Send a message
    const msgInput = page.locator('input[placeholder*="Message"]');
    await expect(msgInput).toBeVisible();
    await msgInput.fill('Please make sure it is delivered with extra green chutney and napkins.');

    const sendBtn = page.locator('form:has(input[placeholder*="Message"]) button[type="submit"]');
    await sendBtn.click();
    await page.waitForTimeout(1500);

    // Message should be displayed in drawer
    await expect(page.locator('text=Please make sure it is delivered with extra green chutney')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_10_order_chat_drawer.png'),
    });
  });

  test('6. Tri-Partite Review System on Completed Order', async ({ page }) => {
    await setSession(page, session);

    const orderId = placedOrderId || dbQuery(
      `SELECT id FROM orders WHERE customer_id = '${session.user.id}' ORDER BY created_at DESC LIMIT 1`,
    );
    // Mark order as delivered so the review button is enabled
    dbQuery(`UPDATE orders SET order_status = 'delivered' WHERE id = '${orderId}'`);

    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle');

    // "Rate Experience" button should appear
    const rateBtn = page.locator('button:has-text("Rate Experience")');
    await expect(rateBtn).toBeVisible({ timeout: 5000 });
    await rateBtn.click();

    // Verify Tri-Partite Review modal with 3 rating dimensions
    await expect(page.locator('h3:has-text("Rate Your Experience")')).toBeVisible();
    await expect(page.locator('text=Food Quality & Taste')).toBeVisible();
    await expect(page.locator('text=Kitchen & Packaging')).toBeVisible();
    await expect(page.locator('text=Delivery & Rider Courtesy')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_11_tripartite_review_modal.png'),
    });

    // Submit review
    const commentInput = page.locator('textarea[placeholder*="flavor"], textarea[placeholder*="review"]');
    if (await commentInput.isVisible()) {
      await commentInput.fill('The chicken samosas were crispy, fresh, and piping hot! Outstanding packaging.');
    }
    await page.locator('button:has-text("Submit Tri-Partite Review")').click();
    await expect(page.locator('h4:has-text("Review Submitted!")')).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_12_review_submitted.png'),
    });
  });
});
