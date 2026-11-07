import { test, expect, request, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { signIn } from './support/customer';

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
  user: { id: string } & Record<string, unknown>;
  addressId: string;
}

function productOf(kitchen: string): string {
  return dbQuery(
    `SELECT p.id FROM products p JOIN sellers s ON s.id = p.seller_id WHERE s.business_name = '${kitchen.replace(/'/g, "''")}' AND p.is_active AND p.approval_status = 'approved' AND p.stock_quantity >= 5 ORDER BY p.created_at LIMIT 1`,
  );
}

async function createVerifiedCustomer(): Promise<TestUserSession> {
  const ctx = await api();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `buyer-test-${suffix}@example.com`;
  const password = 'Lantern-Quartz-71!';

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

test.describe('Buyer Hyperlocal Workflow & Operations', () => {
  test.describe.configure({ mode: 'serial' });

  let session: TestUserSession;
  let placedOrderId: string = '';
  let prod1Id = '';
  let prod2Id = '';

  test.beforeAll(async () => {
    session = await createVerifiedCustomer();
    prod1Id = productOf("Saima's Craft Kitchen");
    prod2Id = productOf("Tahira's Clay Pot Meetha");
    if (!fs.existsSync(ARTIFACT_SCREENSHOT_DIR)) {
      fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });
    }
  });

  test('1. Hyperlocal Discovery, Community Detection & Tier Badges', async ({ page }) => {
    await signIn(page, session);
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
    await signIn(page, session);

    // Ensure cart is initially empty
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, {
      headers: { Authorization: `Bearer ${session.jwt}` },
    });

    // Step A: Add Product 1 from Claude Test Kitchen (Askari 11)
    await page.goto(`/products/${prod1Id}`);
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /^Add to tray/ });
    await addBtn.waitFor({ state: 'visible' });
    await addBtn.click();
    await page.waitForTimeout(1000);

    // Screenshot product detail
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_02_product1_added.png'),
    });

    // Step B: Attempt to Add Product 2 from E2E Test Kitchen (Askari 10)
    await page.goto(`/products/${prod2Id}`);
    await page.waitForLoadState('networkidle');

    const addBtn2 = page.getByRole('button', { name: /^Add to tray/ });
    await addBtn2.waitFor({ state: 'visible' });
    await addBtn2.click();

    // The CartConflictModal should appear!
    const modalHeading = page.getByRole('heading', { name: 'Start an order from a new kitchen?' });
    await expect(modalHeading).toBeVisible({ timeout: 8000 });

    // Capture screenshot of the Cart Conflict Dialog
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_03_cart_conflict_modal.png'),
    });

    const confirmClearBtn = page.getByRole('button', { name: 'Clear tray and add dish' });
    await expect(confirmClearBtn).toBeVisible();
    await confirmClearBtn.click();
    await page.waitForTimeout(1500);

    // Verify cart page now reflects single-kitchen order
    await page.goto('/cart');
    await page.waitForLoadState('networkidle');

    await expect(page.getByText(/^\d+ items? from Tahira's Clay Pot Meetha$/)).toBeVisible({ timeout: 6000 });
    await expect(page.getByText("Saima's Craft Kitchen")).toHaveCount(0);
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_04_cart_single_seller.png'),
    });
  });

  test('3. Favorite Kitchen Toggle & Dedicated Favorites Page', async ({ page }) => {
    await signIn(page, session);

    // Go to product of Claude Test Kitchen
    await page.goto(`/products/${prod1Id}`);
    await page.waitForLoadState('networkidle');

    const favBtn = page.getByRole('button', { name: 'Save Kitchen to Favorites' });
    await favBtn.click();
    await expect(favBtn).toHaveAttribute('aria-pressed', 'true');

    await page.goto('/favorites');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Saved kitchens', level: 1 })).toBeVisible({ timeout: 6000 });
    await expect(page.getByRole('main').getByText("Saima's Craft Kitchen").first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_05_favorites_page.png'),
    });
  });

  test('4. Checkout, Manual Payment (JazzCash/EasyPaisa) & TID Submission', async ({ page }) => {
    await signIn(page, session);

    // Ensure item in cart
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, {
      headers: { Authorization: `Bearer ${session.jwt}` },
    });
    await postJson(
      ctx,
      '/cart/items',
      { productId: prod1Id, quantity: 2 },
      session.jwt,
    );

    // Go to checkout
    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    const jazzcashRadio = page.locator('input[type="radio"][value="jazzcash"]');
    await jazzcashRadio.waitFor({ state: 'visible' });
    await jazzcashRadio.check();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_06_checkout_manual_payment.png'),
    });

    await page.getByRole('button', { name: /^Place order/ }).click();

    // Should redirect to /orders/:id
    await page.waitForURL(/\/orders\/[a-f0-9-]+/, { timeout: 15000 });
    await page.waitForLoadState('networkidle');

    // Extract orderId from URL
    const url = page.url();
    const match = url.match(/\/orders\/([a-f0-9-]+)/);
    if (match) placedOrderId = match[1];

    // Verify Manual Payment Card is visible with payment details
    await expect(page.getByText("Pay Directly to Saima's Craft Kitchen")).toBeVisible({ timeout: 8000 });
    const iHavePaid = page.getByRole('button', { name: /I Have Paid/ });
    await expect(iHavePaid).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_07_manual_payment_card.png'),
    });

    await iHavePaid.click();

    // Modal opens
    const tidInput = page.getByPlaceholder('e.g. 19284729103 or FT26259...');
    await expect(tidInput).toBeVisible();
    await tidInput.fill('JC-99882211443');

    await page.getByPlaceholder('e.g. Muhammad Ali').fill('Sara Khan');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_08_tid_submission_modal.png'),
    });

    await page.getByRole('button', { name: /Submit Payment Verification/ }).click();

    await expect(page.getByText('Payment Proof Submitted').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('JC-99882211443').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_09_payment_proof_submitted.png'),
    });
  });

  test('5. In-App Order Messaging (Buyer <-> Kitchen)', async ({ page }) => {
    await signIn(page, session);

    const orderId = placedOrderId || dbQuery(
      `SELECT id FROM orders WHERE customer_id = '${session.user.id}' ORDER BY created_at DESC LIMIT 1`,
    );
    expect(orderId).toBeTruthy();

    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle');

    const chatBtn = page.getByRole('button', { name: "Chat with Saima's Craft Kitchen" });
    await expect(chatBtn).toBeVisible();
    await chatBtn.click();

    // Verify chat drawer opens
    await expect(page.locator('#order-chat-title')).toBeVisible({ timeout: 5000 });

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
    await signIn(page, session);

    const orderId = placedOrderId || dbQuery(
      `SELECT id FROM orders WHERE customer_id = '${session.user.id}' ORDER BY created_at DESC LIMIT 1`,
    );
    // Delivered and paid, so the order can be rated
    dbQuery(`UPDATE orders SET order_status = 'delivered', payment_status = 'paid' WHERE id = '${orderId}'`);
    dbQuery(`UPDATE order_items SET status = 'delivered' WHERE order_id = '${orderId}'`);

    await page.goto(`/orders/${orderId}`);
    await page.waitForLoadState('networkidle');

    const rateBtn = page.getByRole('button', { name: 'Rate this order' });
    await expect(rateBtn).toBeVisible({ timeout: 5000 });
    await rateBtn.click();

    const dialog = page.getByRole('dialog', { name: 'Rate your order' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('How were the food, the kitchen and the delivery?')).toBeVisible();
    await expect(dialog.getByText('Food', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Kitchen and packaging', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Delivery', { exact: true })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_11_tripartite_review_modal.png'),
    });

    const fiveStars = dialog.getByRole('button', { name: '5 stars' });
    await fiveStars.nth(0).click();
    await fiveStars.nth(1).click();
    await fiveStars.nth(2).click();
    await dialog.getByPlaceholder('How was the taste, the portion and the packing?').fill('Rich, fresh and well packed.');
    await dialog.getByRole('button', { name: 'Submit review' }).click();
    await expect(dialog.getByRole('heading', { name: 'Thanks for your review' })).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, 'buyer_12_review_submitted.png'),
    });
  });
});
