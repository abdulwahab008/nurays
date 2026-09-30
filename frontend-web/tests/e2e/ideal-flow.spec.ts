import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';

const USERS = {
  customer: { email: 'customer@nuray.test', pass: 'Password123!', dashboardUrl: '/dashboard' },
  seller:   { email: 'seller@nuray.test',   pass: 'Password123!', dashboardUrl: '/sellers/dashboard' },
  rider:    { email: 'rider@nuray.test',    pass: 'Password123!', dashboardUrl: '/riders/dashboard' },
  admin:    { email: 'admin@frozennuray.com', pass: 'Password123!', dashboardUrl: '/admin/dashboard' },
};

import * as path from 'node:path';

const backendDir = path.resolve(__dirname, '../../../backend');

test.beforeAll(async () => {
  // Ensure all 4 test users are seeded with standard credentials
  execSync('npx ts-node scripts/seed-ideal-flow-users.ts', {
    cwd: backendDir,
    stdio: 'inherit',
  });
});

test.describe('Nuray Multi-Role Login Verification', () => {
  test('Customer UI login redirects to /dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(USERS.customer.email);
    await page.getByLabel('Password').fill(USERS.customer.pass);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Verify redirected away from /login to customer dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Customer Dashboard|My Orders|Welcome/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Seller (Home Chef) UI login redirects to /sellers/dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(USERS.seller.email);
    await page.getByLabel('Password').fill(USERS.seller.pass);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Verify redirected to seller kitchen portal
    await expect(page).toHaveURL(/\/sellers\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Saima's Craft Kitchen|Kitchen Dashboard|Orders|Earnings/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Rider UI login redirects to /riders/dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(USERS.rider.email);
    await page.getByLabel('Password').fill(USERS.rider.pass);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Verify redirected to rider dashboard
    await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Rider Dashboard|Deliveries|Active/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('Admin UI login redirects to /admin/dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(USERS.admin.email);
    await page.getByLabel('Password').fill(USERS.admin.pass);
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    // Verify redirected to super admin dashboard
    await expect(page).toHaveURL(/\/admin\/dashboard/, { timeout: 15_000 });
    await expect(page.getByText(/Admin|Overview|Total Orders|Revenue/i).first()).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Nuray Ideal E2E Operational Flow & Doorstep Handshake', () => {
  test('Executes complete multi-role flow (Order -> Kitchen Prep -> JIT Dispatch -> Doorstep PIN Handshake -> Ledger)', async ({ page }) => {
    // 1. Run the backend orchestrated lifecycle
    const flowOutput = execSync('npx ts-node scripts/run-ideal-flow.ts', {
      cwd: backendDir,
      encoding: 'utf-8',
    });

    expect(flowOutput).toContain('IDEAL MULTI-ROLE FLOW COMPLETE: ALL STAGES PASSED 100%!');
    expect(flowOutput).toContain('JIT Lookahead Dispatch Triggered!');
    expect(flowOutput).toContain('Handshake Verified! Order marked DELIVERED successfully.');
    expect(flowOutput).toContain('Financial integrity confirmed: All 4 double-entry records posted.');

    // 2. Extract the order number from output
    const match = flowOutput.match(/Order Number:\s*(FN\d+)/);
    expect(match, 'Order number must be present in output').not.toBeNull();
    const orderNumber = match![1];

    // 3. Customer UI check: Login and view completed order
    await page.goto('/login');
    await page.getByRole('button', { name: 'Email', exact: true }).click();
    await page.getByLabel(/Email Address/).fill(USERS.customer.email);
    await page.getByLabel('Password').fill(USERS.customer.pass);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    await page.goto('/orders');
    await expect(page.getByText(orderNumber)).toBeVisible({ timeout: 10_000 });
  });
});
