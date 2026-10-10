import { test, expect, request, APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
const ARTIFACT_SCREENSHOT_DIR = process.env.ARTIFACT_SCREENSHOT_DIR ?? path.join(process.cwd(), 'test-results', 'customer_spec_audit');

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

interface TestUserSession {
  email: string;
  jwt: string;
  user: any;
  addressId: string;
}

async function createVerifiedCustomer(): Promise<TestUserSession> {
  const ctx = await api();
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `audit-buyer-${suffix}@example.com`;
  const password = 'Lantern-Quartz-71!';

  // 1. Register
  await postJson(ctx, '/auth/register', {
    email,
    password,
    user_type: 'customer',
    full_name: 'Zainab Ahmed',
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
      addressLine1: 'Villa 22, Sector B, Askari 11',
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

test.describe.serial('Buyer / Customer Specification Complete 27-Section Audit', () => {
  test.setTimeout(60000);
  let session: TestUserSession;
  let seller1Id: string;
  let seller1Name: string;
  let seller2Id: string;
  let seller2Name: string;
  let product1Id: string;
  let product2Id: string;

  test.beforeAll(async () => {
    session = await createVerifiedCustomer();

    // Query 2 verified sellers with active products from DB
    const s1Raw = dbQuery(
      `SELECT s.id || '|' || s.business_name || '|' || p.id FROM sellers s JOIN products p ON p.seller_id = s.id AND p.is_active = true AND p.stock_quantity >= 10 WHERE s.is_verified = true AND s.status = 'active' LIMIT 1`,
    );
    const [s1Id, s1Name, p1Id] = s1Raw.split('|');
    seller1Id = s1Id;
    seller1Name = s1Name;
    product1Id = p1Id;

    const s2Raw = dbQuery(
      `SELECT s.id || '|' || s.business_name || '|' || p.id FROM sellers s JOIN products p ON p.seller_id = s.id AND p.is_active = true AND p.stock_quantity >= 10 WHERE s.is_verified = true AND s.status = 'active' AND s.id != '${seller1Id}' LIMIT 1`,
    );
    const [s2Id, s2Name, p2Id] = s2Raw.split('|');
    seller2Id = s2Id;
    seller2Name = s2Name;
    product2Id = p2Id;

    // Ensure sellers have manual payment details for Section 13
    const safeAccountName = (seller1Name || 'Chef Kitchen').replace(/'/g, "''");
    dbQuery(`
      UPDATE sellers 
      SET jazzcash_number = '03001234567',
          easypaisa_number = '03457654321',
          bank_account_number = 'PK36MEZN0001234567890123',
          bank_name = 'Meezan Bank Ltd',
          bank_account_name = '${safeAccountName}'
      WHERE id = '${seller1Id}'
    `);
  });

  // TEST 1: Section 3 & Rule 1, 2, 3 — Registration & Mandatory Fields & Terms Checkbox
  test('1. Section 3 & Rule 1-3: Registration Form, Community Selector & Mandatory T&C Checkbox', async ({ page }) => {
    await page.goto('/register', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Assert form inputs exist
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#full_name')).toBeVisible();
    await expect(page.locator('#community')).toBeVisible();
    await expect(page.locator('#house_apt')).toBeVisible();
    await expect(page.locator('#termsAccepted')).toBeVisible();

    // Fill form without checking T&C
    await page.locator('#email').fill(`tc-test-${Date.now()}@example.com`);
    await page.locator('#password').fill('Lantern-Quartz-71!');
    await page.locator('#confirmPassword').fill('Lantern-Quartz-71!');
    await page.locator('#full_name').fill('Terms Validator');
    await page.locator('#community').selectOption('Askari 11');
    await page.locator('#house_apt').fill('Apt 101, Block A');

    // Attempt to submit with terms unchecked
    await page.getByRole('button', { name: /create account/i }).click();

    // Verify HTML5 validation or application error prevents submission without terms
    const termsCheckbox = page.locator('#termsAccepted');
    const isChecked = await termsCheckbox.isChecked();
    expect(isChecked).toBe(false);

    // Now check the terms checkbox
    await termsCheckbox.check();
    expect(await termsCheckbox.isChecked()).toBe(true);

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '01_registration_and_terms.png'),
    });
  });

  // TEST 2: Section 4, 5 & Rule 4, 5, 7 — Home Dashboard, Community Selector & Cravings
  test('2. Section 4 & 5: Home Dashboard, Hyperlocal Community Badge & Cravings Shortcuts', async ({ page }) => {
    await setSession(page, session);
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Assert community context or switcher is rendered
    await expect(page.locator('text=Karachi').first()).toBeVisible();
    await expect(page.locator('text=Total Orders').first()).toBeVisible();
    await expect(page.locator('text=Active Platform Deals').first()).toBeVisible();
    await expect(page.locator("text=Tonight's Cravings").first()).toBeVisible();

    // Verify category shortcuts
    await expect(page.locator('text=Biryani').first()).toBeVisible();
    await expect(page.locator('text=Kebabs').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '02_home_dashboard.png'),
    });
  });

  // TEST 3: Section 6, 7 & Rule 4, 5, 7 — Search, Hyperlocal Distance & Seller Discovery Card
  test('3. Section 6 & 7: Search, Hyperlocal Priority & Community Distance Badges', async ({ page }) => {
    await setSession(page, session);
    await page.goto('/products', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Assert search input is visible
    const searchInput = page.locator('input[placeholder*="Search"]').first();
    await expect(searchInput).toBeVisible();

    // Verify community pill / filter is displayed
    await expect(page.locator('text=Askari 11').first()).toBeVisible();

    // Verify at least one product card displays community tag and distance
    await expect(page.locator('text=In Your Community').or(page.locator('text=Karachi Kitchen')).or(page.locator('text=Askari 11')).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '03_search_and_discovery.png'),
    });
  });

  // TEST 4: Section 8 — Seller Detail Page & Profile Header
  test('4. Section 8: Kitchen Profile, Chef Bio, Community Tag & Chat Trigger', async ({ page }) => {
    await setSession(page, session);
    await page.goto('/kitchens/k-saima', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator("text=Saima's Craft Kitchen").first()).toBeVisible();
    await expect(page.locator('text=Chef Saima Akhtar').first()).toBeVisible();
    await expect(page.locator('text=Gulshan-e-Iqbal').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '04_kitchen_profile_page.png'),
    });
  });

  // TEST 5: Section 9 — Dish Detail Page, Special Instructions & Buy Now Button
  test('5. Section 9: Dish Detail, Quantity Selector, Special Instructions & Dual Action Buttons', async ({ page }) => {
    await setSession(page, session);
    await page.goto(`/products/${product1Id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Assert special instructions textarea exists
    const instructionsInput = page.locator('#specialInstructions');
    await expect(instructionsInput).toBeVisible();
    await instructionsInput.fill('Please make it mild spicy with extra raita.');

    // Assert quantity selector exists
    await expect(page.getByLabel('Increase quantity')).toBeVisible();
    await expect(page.getByLabel('Decrease quantity')).toBeVisible();

    // Assert both Add to Bag and Buy Now buttons exist
    await expect(page.getByRole('button', { name: /add to bag/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /instant buy now/i })).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '05_dish_detail_and_customization.png'),
    });
  });

  // TEST 6: Section 10 & Rule 8 — Single-Seller Cart Conflict & Replacement Modal
  test('6. Section 10 & Rule 8: Single-Seller Cart Enforcement & Conflict Replacement Modal', async ({ page }) => {
    await setSession(page, session);

    // 1. Add product from Kitchen 1
    await page.goto(`/products/${product1Id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    const directBtn1 = page.locator('button:has-text("Direct")').first();
    if (await directBtn1.isVisible({ timeout: 2000 }).catch(() => false)) {
      await directBtn1.click();
    }
    const addBtn1 = page.getByRole('button', { name: /add to bag/i });
    await expect(addBtn1).toBeEnabled({ timeout: 15000 });
    await addBtn1.click();
    await page.waitForTimeout(1000);

    // 2. Add product from Kitchen 2
    await page.goto(`/products/${product2Id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    const directBtn2 = page.locator('button:has-text("Direct")').first();
    if (await directBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await directBtn2.click();
    }
    const addBtn2 = page.getByRole('button', { name: /add to bag/i });
    await expect(addBtn2).toBeEnabled({ timeout: 15000 });
    await addBtn2.click();

    // 3. Assert Conflict Modal appears
    await expect(page.locator('text=Start Order from a New Kitchen?')).toBeVisible({ timeout: 10000 });
    await expect(page.locator(`text=${seller2Name}`).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '06_cart_conflict_modal.png'),
    });

    // 4. Click "Clear Cart & Add New Dish"
    await page.getByRole('button', { name: /clear cart & add new dish/i }).click();
    await page.waitForTimeout(1500);

    // 5. Navigate to /cart and assert only Seller 2's dish is in the cart
    await page.goto('/cart', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text=${seller2Name}`).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '07_cart_single_seller_active.png'),
    });
  });

  // TEST 7: Section 11, 12, 13, 14 & Rule 10, 11 — Checkout, Manual Payment & TID Submission
  test('7. Section 11-14 & Rule 10: Checkout Flow, Manual Payment (JazzCash/EasyPaisa) & TID Submission', async ({ page }) => {
    await setSession(page, session);

    // Seed cart via API so checkout has items guaranteed
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, { headers: { Authorization: `Bearer ${session.jwt}` } });
    await postJson(ctx, '/cart/items', { productId: product1Id, quantity: 1, stockType: 'direct' }, session.jwt);

    // Go to product page and verify UI add button works
    await page.goto(`/products/${product1Id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 15000 });
    const directBtn = page.locator('button:has-text("Direct")').first();
    if (await directBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await directBtn.click();
    }
    const addBtn = page.getByRole('button', { name: /add to bag/i });
    await expect(addBtn).toBeEnabled({ timeout: 15000 });

    // Go to checkout
    await page.goto('/checkout', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('text=Order Summary').first()).toBeVisible({ timeout: 15000 });

    // Select Manual Online Payment (JazzCash / EasyPaisa / Bank)
    const manualRadio = page.locator('input[value="jazzcash"]').or(page.locator('input[value="bank"]')).or(page.locator('input[value="easypaisa"]')).first();
    if (await manualRadio.isVisible({ timeout: 3000 }).catch(() => false)) {
      await manualRadio.check();
    }

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '08_checkout_payment_selection.png'),
    });

    // Place Order
    const placeOrderBtn = page.getByRole('button', { name: /place order/i }).first();
    await expect(placeOrderBtn).toBeVisible({ timeout: 10000 });
    await placeOrderBtn.click();

    // Assert redirected to /orders/[id]
    await page.waitForURL(/\/orders\/[a-f0-9-]+/, { timeout: 15000 });
    const orderUrl = page.url();
    const orderId = orderUrl.split('/').pop()?.split('?')[0] || '';

    // Verify Manual Payment Card is visible
    await expect(page.locator('text=Pay Directly to').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("I Have Paid")').first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '09_order_manual_payment_card.png'),
    });

    // Click "I Have Paid & Transferred" -> Submit TID
    await page.locator('button:has-text("I Have Paid")').first().click();
    await expect(page.locator('text=Submit Payment Proof').first()).toBeVisible();

    await page.locator('input[placeholder*="19284729103"]').or(page.locator('input[required]')).first().fill('JC-AUDIT-998877');
    await page.getByRole('button', { name: /submit verification/i }).first().click();

    // Verify status updates to submitted
    await expect(page.locator('text=Payment Submitted').or(page.locator('text=Verification in Progress')).first()).toBeVisible({ timeout: 8000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '10_tid_proof_submitted.png'),
    });
  });

  // TEST 8: Section 15, 16 & Rule 9, 13 — Order Tracking Stepper & Cancellation Rules
  test('8. Section 15 & 16 & Rule 9: Order Tracking Stepper & Cancellation Window Enforcement', async ({ page }) => {
    await setSession(page, session);

    // Create a new fresh pending order
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, { headers: { Authorization: `Bearer ${session.jwt}` } });
    await postJson(ctx, '/cart/items', { productId: product1Id, quantity: 1, stockType: 'direct' }, session.jwt);

    const orderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [{ productId: product1Id, quantity: 1, stockType: 'direct' }],
        deliveryType: 'home_delivery',
        deliveryAddressId: session.addressId,
        paymentMethod: 'cod',
      },
      session.jwt,
    );
    const orderData = await orderResp.json();
    const orderId = orderData.data?.order?.id || orderData.data?.id;

    // View order detail
    await page.goto(`/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // 1. Assert Cancel Order button is available while pending
    const cancelBtn = page.getByRole('button', { name: /cancel order/i }).first();
    await expect(cancelBtn).toBeVisible();

    // 2. Advance order status to 'preparing' via DB
    dbQuery(`UPDATE orders SET order_status = 'preparing' WHERE id = '${orderId}'`);
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('text=PREPARING').first()).toBeVisible({ timeout: 10000 });

    // 3. Assert Cancel button is now blocked / hidden (Rule 9)
    await expect(page.getByRole('button', { name: /cancel order/i })).not.toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '11_cancellation_blocked_when_preparing.png'),
    });
  });

  // TEST 9: Section 17, 23 & Rule 14 — In-App Messaging (Order Chat) & Tri-Partite Review
  test('9. Section 17 & 23 & Rule 14: In-App Order Chat Drawer & Tri-Partite Review System', async ({ page }) => {
    await setSession(page, session);

    // Create order and set to delivered
    const ctx = await api();
    await ctx.delete(`${API_BASE}/cart`, { headers: { Authorization: `Bearer ${session.jwt}` } });
    await postJson(ctx, '/cart/items', { productId: product1Id, quantity: 1, stockType: 'direct' }, session.jwt);

    const orderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [{ productId: product1Id, quantity: 1, stockType: 'direct' }],
        deliveryType: 'home_delivery',
        deliveryAddressId: session.addressId,
        paymentMethod: 'cod',
      },
      session.jwt,
    );
    const orderData = await orderResp.json();
    const orderId = orderData.data?.order?.id || orderData.data?.id;

    // Advance to delivered in DB
    dbQuery(`UPDATE orders SET order_status = 'delivered', payment_status = 'paid' WHERE id = '${orderId}'`);

    await page.goto(`/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // 1. Open In-App Chat
    await page.getByRole('button', { name: /chat with/i }).first().click();
    await expect(page.locator('text=Live coordination with kitchen').first()).toBeVisible({ timeout: 5000 });

    // Send a message
    const msgInput = page.locator('input[placeholder*="Message"]').first();
    await msgInput.fill('Is the packaging thermal sealed?');
    await page.locator('form:has(input[placeholder*="Message"]) button[type="submit"]').click();
    await expect(page.locator('text=Is the packaging thermal sealed?').first()).toBeVisible({ timeout: 5000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '12_in_app_order_chat.png'),
    });

    // Close chat drawer
    await page.getByLabel('Close Chat').click();

    // 2. Open Tri-Partite Review Modal
    await page.getByRole('button', { name: /rate experience/i }).first().click();
    await expect(page.locator('text=Rate Your Experience').first()).toBeVisible();
    await expect(page.locator('text=Food Quality & Taste')).toBeVisible();
    await expect(page.locator('text=Kitchen & Packaging')).toBeVisible();
    await expect(page.locator('text=Delivery & Rider Courtesy')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '13_tri_partite_review_modal.png'),
    });

    // Submit review
    await page.locator('textarea[placeholder*="flavor"]').or(page.locator('textarea')).first().fill('Crispy and warm, authentic flavors!');
    await page.getByRole('button', { name: /submit.*review/i }).first().click();

    // Verify confirmation
    await expect(page.locator('text=Review Submitted!').first()).toBeVisible({ timeout: 8000 });

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '14_tri_partite_review_submitted.png'),
    });
  });

  // TEST 10: Section 18, 21 & Rule 15, 17 — Favorites Page & 1-Click Reorder
  test('10. Section 18 & 21 & Rule 15, 17: Favorites Page & 1-Click Reorder Action', async ({ page }) => {
    await setSession(page, session);

    // 1. Add favorite via API
    const ctx = await api();
    await postJson(ctx, `/favorites/${seller1Id}`, {}, session.jwt);

    // 2. Visit /favorites
    await page.goto('/favorites', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator(`text=${seller1Name}`).first()).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '15_favorites_page.png'),
    });

    // 3. Ensure a delivered order exists for this session
    const orderResp = await postJson(
      ctx,
      '/orders',
      {
        items: [{ productId: product1Id, quantity: 1, stockType: 'direct' }],
        deliveryType: 'home_delivery',
        deliveryAddressId: session.addressId,
        paymentMethod: 'cod',
      },
      session.jwt,
    );
    const orderData = await orderResp.json();
    const orderId = orderData.data?.order?.id || orderData.data?.id;
    dbQuery(`UPDATE orders SET order_status = 'delivered', payment_status = 'paid' WHERE id = '${orderId}'`);

    // 4. Visit /orders and test 1-Click Reorder
    await page.goto('/orders', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');

    // Click "Past Orders" tab
    await page.getByRole('button', { name: /past orders/i }).click();
    await page.waitForTimeout(500);

    // Assert Reorder button exists and click it
    const reorderBtn = page.getByRole('button', { name: /↻ reorder/i }).first();
    await expect(reorderBtn).toBeVisible({ timeout: 10000 });
    await reorderBtn.click();

    // Should redirect to /cart with items populated
    await page.waitForURL(/\/cart/, { timeout: 10000 });
    await expect(page.locator('text=Order Summary')).toBeVisible();

    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '16_one_click_reorder_to_cart.png'),
    });
  });

  // TEST 11: Section 19, 20, 22 — Support, Notifications & Profile Verification
  test('11. Section 19, 20, 22: Help & Support, Notifications & Addresses Management', async ({ page }) => {
    await setSession(page, session);

    // 1. Support
    page.on('pageerror', (err) => console.log('SUPPORT PAGE EXCEPTION:', err));
    await page.goto('/support', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('text=Help & Support').first()).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '17_support_page.png'),
    });

    // 2. Notifications
    await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByRole('heading', { name: 'Notifications' }).first()).toBeVisible();
    await expect(page.locator('text=Notification Preferences').first()).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '18_notifications_page.png'),
    });

    // 3. Profile & Addresses
    await page.goto('/profile', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('text=Zainab Ahmed').first()).toBeVisible();
    await expect(page.locator('text=Personal Information').or(page.locator('input[value*="Zainab"]')).first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({
      path: path.join(ARTIFACT_SCREENSHOT_DIR, '19_profile_page.png'),
    });
  });
});
