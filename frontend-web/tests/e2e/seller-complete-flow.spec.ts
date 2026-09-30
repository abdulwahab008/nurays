import { test, expect, request, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
const ARTIFACT_SCREENSHOT_DIR = '/Users/apple/.gemini/antigravity-ide/brain/b5ab1d9a-10a7-43f3-9b36-7132ded48fbd/seller_spec_audit';

if (!fs.existsSync(ARTIFACT_SCREENSHOT_DIR)) {
  fs.mkdirSync(ARTIFACT_SCREENSHOT_DIR, { recursive: true });
}

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

async function getJson(
  ctx: APIRequestContext,
  endpoint: string,
  jwt?: string,
) {
  const url = `${API_BASE}/${endpoint.replace(/^\//, '')}`;
  return ctx.get(url, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  });
}

interface TestUserSession {
  email: string;
  jwt: string;
  user: any;
}

async function createSellerUser(suffix: string): Promise<TestUserSession> {
  const ctx = await api();
  const email = `seller-spec-${suffix}@example.com`;
  const password = 'Password123!';

  // 1. Register User as customer applicant
  await postJson(ctx, '/auth/register', {
    email,
    password,
    user_type: 'customer',
    full_name: `Chef Tariq ${suffix}`,
    phone: `0300${Math.floor(1000000 + Math.random() * 9000000)}`,
    city: 'Karachi',
    area: 'Askari 11',
  });

  // 2. Mark active & verified
  dbQuery(`UPDATE users SET email_verified = true, status = 'active' WHERE email = '${email}'`);

  // 3. Login
  const loginResp = await postJson(ctx, '/auth/login', {
    phoneOrEmail: email,
    otpCodeOrPassword: password,
    loginMethod: 'email',
  });
  const body = await loginResp.json();
  const jwt = body.data?.tokens?.access_token || '';
  const user = body.data?.user || {};

  return { email, jwt, user };
}

async function createCustomerUser(suffix: string): Promise<TestUserSession> {
  const ctx = await api();
  const email = `buyer-spec-${suffix}@example.com`;
  const password = 'Password123!';

  await postJson(ctx, '/auth/register', {
    email,
    password,
    user_type: 'customer',
    full_name: `Customer Farhan ${suffix}`,
    phone: `0312${Math.floor(1000000 + Math.random() * 9000000)}`,
    city: 'Karachi',
    area: 'Askari 11',
  });

  dbQuery(`UPDATE users SET email_verified = true, status = 'active' WHERE email = '${email}'`);

  const loginResp = await postJson(ctx, '/auth/login', {
    phoneOrEmail: email,
    otpCodeOrPassword: password,
    loginMethod: 'email',
  });
  const body = await loginResp.json();
  const jwt = body.data?.tokens?.access_token || '';
  const user = body.data?.user || {};

  // Add Askari 11 address
  await postJson(
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

  return { email, jwt, user };
}

async function setSession(page: any, session: TestUserSession) {
  await page.addInitScript(
    ({ token, user }: { token: string; user: any }) => {
      window.localStorage.setItem('auth_token', token);
      window.localStorage.setItem('access_token', token);
      window.localStorage.setItem('refresh_token', token);
      window.localStorage.setItem('token', token);
      window.sessionStorage.setItem('access_token', token);
      window.sessionStorage.setItem('refresh_token', token);
      window.localStorage.setItem(
        'auth-storage',
        JSON.stringify({
          state: {
            user,
            token,
            tokens: { access_token: token, refresh_token: token },
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

test.describe.serial('Complete Seller End-to-End Workflow (Sections 1-14)', () => {
  let sellerSession: TestUserSession;
  let buyerSession: TestUserSession;
  let sellerId: string;
  let categoryId: string;
  let createdProductId: string;
  let orderNumber: string;
  let orderId: string;
  const uniqueSuffix = `${Date.now().toString().slice(-6)}`;

  test.beforeAll(async () => {
    sellerSession = await createSellerUser(uniqueSuffix);
    buyerSession = await createCustomerUser(uniqueSuffix);

    // Get a valid food category from DB (e.g. Burgers / Fast Food)
    const catRaw = dbQuery(`SELECT id FROM categories WHERE is_active = true ORDER BY name LIMIT 1`);
    categoryId = catRaw || '';
  });

  // 1. SECTION 1: Seller Registration with GPS, Community, Docs & T&C -> Pending
  test('1. Section 1: Seller Registration wizard with GPS, community detection & submission', async ({ page }) => {
    await setSession(page, sellerSession);
    await page.goto('/sellers/register');
    await page.waitForLoadState('networkidle');

    // Fill Registration Form
    const bizInput = page.locator('#business-name-input');
    await expect(bizInput).toBeVisible();
    await bizInput.fill(`Tariq Gourmet Burgers ${uniqueSuffix}`);
    await page.fill('#house-unit-input', 'Shop #3, Commercial Avenue');
    await page.selectOption('#community-select', { label: 'Askari 11, Karachi' });

    // Click Auto-Detect GPS
    await page.click('#detect-gps-btn');

    // Fill Bank & Wallet Details
    await page.fill('#bank-name-input', 'Meezan Bank');
    await page.fill('#bank-account-name-input', 'Chef Tariq');
    await page.fill('#bank-account-input', 'PK36MEZN0001234567890123');
    await page.fill('#jazzcash-input', '03001234567');

    // Agree to Terms
    const termsCheckbox = page.locator('#agree-terms-checkbox');
    await expect(termsCheckbox).toBeVisible();
    await termsCheckbox.check();

    // Screenshot registration form before submit
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '01_seller_registration_form.png'),
      fullPage: true,
    });

    // Submit for Approval
    await page.click('#submit-registration-btn');
    await page.waitForTimeout(2000);

    // Verify Pending Approval Banner
    await expect(page.locator('#pending-approval-banner')).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '02_seller_pending_approval.png'),
      fullPage: true,
    });

    // Capture seller ID from DB
    sellerId = dbQuery(`SELECT id FROM sellers WHERE user_id = '${sellerSession.user.id}'`);
    expect(sellerId).toBeTruthy();
  });

  // 2. SECTION 2: Admin Rejection with Reason -> Seller sees reason -> Fix & Resubmit
  test('2. Section 2: Admin Rejection & Resubmission Cycle', async ({ page }) => {
    // Admin rejects the seller application with specific reason
    const rejectReason = 'CNIC copy is blurry. Please provide clear front/back photos and kitchen address.';
    dbQuery(`
      UPDATE sellers 
      SET verification_status = 'rejected', 
          rejection_reason = '${rejectReason}' 
      WHERE id = '${sellerId}'
    `);

    // Seller visits registration / status page
    await setSession(page, sellerSession);
    await page.goto('/sellers/register');
    await page.waitForLoadState('networkidle');

    // Verify rejection banner and reason
    const rejectBanner = page.locator('#rejected-banner');
    await expect(rejectBanner).toBeVisible();
    await expect(page.locator('#rejection-reason-text')).toContainText('CNIC copy is blurry');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '03_seller_rejection_reason_shown.png'),
      fullPage: true,
    });

    // Click "Fix Information & Resubmit"
    await page.click('#fix-resubmit-btn');
    await expect(page.locator('#business-name-input')).toBeVisible();

    // Resubmit application
    await page.fill('#house-unit-input', 'Shop #3-B (Updated with clear board), Commercial Avenue');
    await page.check('#agree-terms-checkbox');
    await page.click('#submit-registration-btn');
    await page.waitForTimeout(2000);

    // Status returns to pending
    await expect(page.locator('#pending-approval-banner')).toBeVisible();
  });

  // 3. SECTION 2 & 3: Admin Approval -> Seller Account Active -> Dashboard Activated
  test('3. Section 2 & 3: Admin Approval & Seller Dashboard Activation', async ({ page }) => {
    // Admin approves the seller and promotes user to seller role
    dbQuery(`
      UPDATE users SET user_type = 'seller' WHERE id = '${sellerSession.user.id}';
      UPDATE sellers 
      SET verification_status = 'approved', 
          status = 'active', 
          is_verified = true,
          rejection_reason = NULL,
          availability_override = 'open'
      WHERE id = '${sellerId}';
    `);

    // Re-login to get updated JWT containing userType: 'seller'
    const ctx = await api();
    const loginResp = await postJson(ctx, '/auth/login', {
      phoneOrEmail: sellerSession.email,
      otpCodeOrPassword: 'Password123!',
      loginMethod: 'email',
    });
    const body = await loginResp.json();
    sellerSession.jwt = body.data?.tokens?.access_token || sellerSession.jwt;
    sellerSession.user = body.data?.user || sellerSession.user;
    sellerSession.user.userType = 'seller';

    // Verify seller dashboard loads with active status and store live switch
    await setSession(page, sellerSession);
    await page.goto('/sellers/dashboard');
    await page.waitForLoadState('networkidle');

    // Verify Active status badge and Store Live button
    await expect(page.locator('#store-live-toggle-btn')).toBeVisible();
    await expect(page.locator('#store-live-toggle-btn')).toContainText('Store: OPEN');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '04_seller_dashboard_active.png'),
      fullPage: true,
    });
  });

  // 4. SECTION 3 & 5: Store Live Switch (Store: OPEN / CLOSED toggle)
  test('4. Section 3 & 5: One-Click Store Live OPEN / CLOSED Toggle', async ({ page }) => {
    await setSession(page, sellerSession);
    await page.goto('/sellers/dashboard');
    await page.waitForLoadState('networkidle');

    const toggleBtn = page.locator('#store-live-toggle-btn');
    await expect(toggleBtn).toBeVisible();

    // Toggle store to CLOSED
    await toggleBtn.click();
    await page.waitForTimeout(800);
    await expect(toggleBtn).toContainText('Store: CLOSED');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '05_seller_store_closed.png'),
      fullPage: true,
    });

    // Toggle store back to OPEN
    await toggleBtn.click();
    await page.waitForTimeout(800);
    await expect(toggleBtn).toContainText('Store: OPEN');
  });

  // 5. SECTION 4: Seller Adds Food Item with Kitchen Preparation Time Presets
  test('5. Section 4: Add Food Item with Kitchen Preparation Time Preset (30m Biryani / 15m Burger)', async ({ page }) => {
    await setSession(page, sellerSession);
    await page.goto('/sellers/products/new');
    await page.waitForLoadState('networkidle');

    // Fill Item Details
    await page.fill('#product-name-input', `Chef Special Smash Burger ${uniqueSuffix}`);
    await page.fill('#product-description-input', 'Double smash patty with caramelized onions, secret sauce and melted cheese.');
    await page.fill('#product-price-input', '650');
    await page.fill('#product-stock-input', '25');

    // Select Category
    const categorySelect = page.locator('#product-category-select');
    if (await categorySelect.isVisible()) {
      await categorySelect.selectOption({ index: 1 });
    }

    // Click 15m Burger prep time preset button
    const prep15mBtn = page.locator('#prep-preset-15');
    await expect(prep15mBtn).toBeVisible();
    await prep15mBtn.click();

    // Verify preparation time input is set to 15
    const prepInput = page.locator('#product-prep-time-input');
    await expect(prepInput).toHaveValue('15');

    // Now test clicking 30m Biryani preset
    const prep30mBtn = page.locator('#prep-preset-30');
    await prep30mBtn.click();
    await expect(prepInput).toHaveValue('30');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '06_add_item_kitchen_prep_time.png'),
      fullPage: true,
    });

    // Submit product via API or form
    const ctx = await api();
    const prodResp = await postJson(
      ctx,
      '/products',
      {
        name: `Chef Special Smash Burger ${uniqueSuffix}`,
        description: 'Double smash patty with caramelized onions, secret sauce and melted cheese.',
        price: 650,
        unit: 'piece',
        stockQuantity: 25,
        stockType: 'direct',
        productType: 'ready_to_eat',
        categoryId: categoryId || (await categorySelect.inputValue()),
        preparationTime: 20,
      },
      sellerSession.jwt,
    );
    const prodBody = await prodResp.json();
    createdProductId = prodBody.data?.id || '';
    expect(createdProductId).toBeTruthy();
  });

  // 6. SECTION 6: Customer Places Order & Seller Receives Order Ticket
  test('6. Section 6: Customer Places Order & Order Ticket is Generated', async ({ page }) => {
    // Approve the newly created product so customer can purchase it
    dbQuery(`UPDATE products SET approval_status = 'approved', is_active = true WHERE id = '${createdProductId}'`);
    const addressId = dbQuery(`SELECT id FROM user_addresses WHERE user_id = '${buyerSession.user.id}' LIMIT 1`);

    const ctx = await api();

    // Customer places order for 2 Burgers
    const orderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [
          {
            productId: createdProductId,
            quantity: 2,
            stockType: 'direct',
          },
        ],
        deliveryType: 'home_delivery',
        deliveryAddressId: addressId,
        paymentMethod: 'cod',
        deliveryInstructions: 'Askari 11 Sector C Villa 14, please ring doorbell.',
      },
      buyerSession.jwt,
    );

    const orderBody = await orderResp.json();
    expect(orderBody.success).toBe(true);
    const orderData = orderBody.data?.order;
    orderId = orderData?.id || '';
    orderNumber = orderData?.orderNumber || '';
    expect(orderId).toBeTruthy();

    // Seller views Kitchen Orders Cockpit
    await setSession(page, sellerSession);
    await page.goto('/sellers/orders');
    await page.waitForLoadState('networkidle');

    // Verify Order Ticket Card appears
    const orderCard = page.locator(`#order-card-${orderId}`);
    await expect(orderCard).toBeVisible();
    await expect(orderCard).toContainText(`Order #${orderNumber}`);
    await expect(orderCard).toContainText('2 × Chef Special Smash Burger');
    await expect(orderCard).toContainText('Askari 11');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '07_seller_order_ticket_received.png'),
      fullPage: true,
    });
  });

  // 7. SECTION 7: Seller Order Rejection Flow with Reason Modal
  test('7. Section 7: Seller Rejection Modal with Choices (Item unavailable, Too busy, etc.)', async ({ page }) => {
    const addressId = dbQuery(`SELECT id FROM user_addresses WHERE user_id = '${buyerSession.user.id}' LIMIT 1`);
    // Create a temporary second order to test the reject flow
    const ctx = await api();
    const tempOrderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [{ productId: createdProductId, quantity: 1, stockType: 'direct' }],
        deliveryType: 'home_delivery',
        deliveryAddressId: addressId,
        paymentMethod: 'cod',
      },
      buyerSession.jwt,
    );
    const tempOrderBody = await tempOrderResp.json();
    const tempOrderId = tempOrderBody.data?.order?.id;

    await setSession(page, sellerSession);
    await page.goto('/sellers/orders');
    await page.waitForLoadState('networkidle');

    // Click Reject on temp order
    const rejectBtn = page.locator(`#reject-order-btn-${tempOrderId}`);
    await expect(rejectBtn).toBeVisible();
    await rejectBtn.click();

    // Reject Modal appears
    const modal = page.locator('#reject-order-modal');
    await expect(modal).toBeVisible();
    await expect(modal).toContainText('Reject Order');
    await expect(modal).toContainText('Item unavailable');
    await expect(modal).toContainText('Too busy / High kitchen load');

    // Select "Too busy" and submit
    await page.check('input[value="too_busy"]');
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '08_seller_order_reject_modal.png'),
      fullPage: true,
    });

    await page.click('#confirm-reject-btn');
    await page.waitForTimeout(1000);

    // Verify temp order is cancelled with reason
    const cancelledStatus = dbQuery(`SELECT order_status || '|' || cancellation_reason FROM orders WHERE id = '${tempOrderId}'`);
    expect(cancelledStatus).toContain('cancelled');
    expect(cancelledStatus).toContain('Too busy');
  });

  // 8. SECTION 7 & 8: Seller Accepts Order -> In Preparation with Kitchen Timer
  test('8. Section 7 & 8: Seller Accepts Order & Enters Preparing State', async ({ page }) => {
    await setSession(page, sellerSession);
    await page.goto('/sellers/orders');
    await page.waitForLoadState('networkidle');

    // Main Order: Click Accept & Start Preparing
    const acceptBtn = page.locator(`#accept-order-btn-${orderId}`);
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();
    await page.waitForTimeout(1200);

    // Verify state transitioned to Preparing
    const orderCard = page.locator(`#order-card-${orderId}`);
    await expect(orderCard).toContainText('Preparing');
    await expect(orderCard).toContainText('Currently cooking in kitchen');
    await expect(page.locator(`#ready-pickup-btn-${orderId}`)).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '09_seller_preparing_countdown.png'),
      fullPage: true,
    });
  });

  // 9. SECTION 10: Seller Marks Food "Ready for Pickup"
  test('9. Section 10: Seller Marks Food Ready for Pickup', async ({ page }) => {
    await setSession(page, sellerSession);
    await page.goto('/sellers/orders');
    await page.waitForLoadState('networkidle');

    // Click "Mark Ready for Pickup"
    const readyBtn = page.locator(`#ready-pickup-btn-${orderId}`);
    await expect(readyBtn).toBeVisible();
    await readyBtn.click();
    await page.waitForTimeout(1200);

    // Verify state transitioned to Ready
    const orderCard = page.locator(`#order-card-${orderId}`);
    await expect(orderCard).toContainText('Ready on Kitchen Counter');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '10_seller_ready_for_pickup.png'),
      fullPage: true,
    });

    // Verify DB order status is ready
    const dbStatus = dbQuery(`SELECT order_status FROM orders WHERE id = '${orderId}'`);
    expect(dbStatus).toBe('ready');
  });

  // 10. SECTION 11 & 12: Delivery to Customer & Order Completion
  test('10. Section 11 & 12: Delivery Handover & Order Completion', async ({ page }) => {
    // Simulate rider pickup & delivery to customer
    dbQuery(`
      UPDATE orders 
      SET order_status = 'delivered', 
          payment_status = 'paid'
      WHERE id = '${orderId}'
    `);
    dbQuery(`
      UPDATE order_items 
      SET status = 'delivered' 
      WHERE order_id = '${orderId}'
    `);

    // Verify Seller Orders page shows Delivered Completed
    await setSession(page, sellerSession);
    await page.goto('/sellers/orders');
    await page.waitForLoadState('networkidle');

    const orderCard = page.locator(`#order-card-${orderId}`);
    await expect(orderCard).toContainText('Delivered Successfully');

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '11_seller_order_delivered_completed.png'),
      fullPage: true,
    });
  });

  // 11. SECTION 13: Operational Earnings Breakdown & Settlement (7 Metrics)
  test('11. Section 13: Earnings Dashboard with 7 Metrics & History', async ({ page }) => {
    await setSession(page, sellerSession);
    await page.goto('/sellers/earnings');
    await page.waitForLoadState('networkidle');

    // Verify 7 Section 13 metrics
    await expect(page.getByText('Performance & Settlement Breakdown')).toBeVisible();
    await expect(page.getByText("Today's Sales", { exact: true })).toBeVisible();
    await expect(page.getByText("Today's Orders", { exact: true })).toBeVisible();
    await expect(page.getByText('Gross Sales', { exact: true })).toBeVisible();
    await expect(page.getByText('Platform Fees', { exact: true })).toBeVisible();
    await expect(page.getByText('Net Earnings', { exact: true })).toBeVisible();
    await expect(page.getByText('Pending Settlement', { exact: true })).toBeVisible();
    await expect(page.getByText('Paid Settlement', { exact: true })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '12_seller_earnings_7_metrics.png'),
      fullPage: true,
    });
  });

  // 12. SECTION 13 & 14: Customer Review & Full Operational Loop Closure
  test('12. Section 13 & 14: Customer Review Submission & Rating Update', async () => {
    const ctx = await api();

    // Customer submits tripartite review
    const orderItemId = dbQuery(`SELECT id FROM order_items WHERE order_id = '${orderId}' LIMIT 1`);
    const reviewResp = await postJson(
      ctx,
      '/reviews',
      {
        orderId,
        orderItemId,
        sellerRating: 5,
        productRating: 5,
        deliveryRating: 5,
        comment: 'Incredible smash burger, super fresh and piping hot!',
      },
      buyerSession.jwt,
    );

    const reviewBody = await reviewResp.json();
    expect(reviewBody.success).toBe(true);

    // Verify review saved in database
    const reviewCount = dbQuery(`SELECT COUNT(*) FROM reviews WHERE seller_id = '${sellerId}'`);
    expect(parseInt(reviewCount, 10)).toBeGreaterThanOrEqual(1);
  });
});
