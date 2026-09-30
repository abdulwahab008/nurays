import { test, expect } from '@playwright/test';

const ARTIFACT_DIR = '/Users/apple/.gemini/antigravity-ide/brain/a2705288-aff8-4485-a3b0-98a5dfd5f673';

test('Rider Mission Control Cockpit & Strict RBAC Verification', async ({ page }) => {
  // 1. Login as rider
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel(/Email Address/).fill('rider@nuray.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Login', exact: true }).click();

  // 2. Expect redirection to rider dashboard
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });
  await page.waitForTimeout(2000);

  // 3. Verify Navbar RBAC
  // - Eyebrow should say "Rider fleet"
  await expect(page.locator('p.eyebrow').filter({ hasText: 'Rider fleet' })).toBeVisible({ timeout: 5000 });

  // - Assigned zone should be visible and NOT be a link to customer addresses
  await expect(page.locator('div').filter({ hasText: 'Assigned Zone' }).first()).toBeVisible();
  await expect(page.getByText('Karachi Central Hub').first()).toBeVisible();
  const addressLinks = await page.locator('a[href="/profile/addresses"]').count();
  expect(addressLinks).toBe(0);

  // - Search bar and cart should be hidden
  const searchInput = await page.locator('input[placeholder*="Search for biryani"]').count();
  expect(searchInput).toBe(0);
  const cartLinks = await page.locator('a[href="/cart"]').count();
  expect(cartLinks).toBe(0);

  // Take screenshot of main cockpit
  await page.screenshot({ path: `${ARTIFACT_DIR}/fresh_rider_cockpit_main.png`, fullPage: false });

  // 4. Verify User Dropdown Menu
  // Click user profile button
  const userButton = page.locator('nav button:has(div.w-9.h-9)');
  await userButton.click();
  await page.waitForTimeout(500);

  // Verify dropdown content
  const dropdown = page.locator('nav .absolute.right-0');
  await expect(dropdown.getByText('Rider Fleet', { exact: false })).toBeVisible();
  await expect(dropdown.getByText('Fleet Command')).toBeVisible();
  await expect(dropdown.getByText('Active Deliveries')).toBeVisible();
  await expect(dropdown.getByText('Available Pool')).toBeVisible();
  await expect(dropdown.getByText('COD Cash Settlement')).toBeVisible();
  await expect(dropdown.getByText('Fleet Support')).toBeVisible();

  // Verify NO customer links exist in dropdown
  const profileLink = await page.locator('a[href="/profile"]').count();
  expect(profileLink).toBe(0);
  const customerOrdersLink = await page.locator('a[href="/orders"]').count();
  expect(customerOrdersLink).toBe(0);

  await page.screenshot({ path: `${ARTIFACT_DIR}/fresh_rider_navbar_dropdown_open.png` });

  // Close dropdown
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 5. Verify Sidebar RBAC
  await expect(page.getByText('Fleet SOS & Support')).toBeVisible();
  const referralWidget = await page.locator('text=Refer a food lover').count();
  expect(referralWidget).toBe(0);

  // 6. Verify 2-Column Cockpit & Tabs
  await expect(page.getByRole('button', { name: /Active Run/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Available Pool/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Completed Runs/i })).toBeVisible();

  // Right column elements
  await expect(page.getByText('COD Cash in Hand')).toBeVisible();
  await expect(page.getByText('Shift Diagnostics')).toBeVisible();
  await expect(page.getByText('Cold-Chain Protocol')).toBeVisible();

  // 7. Click Available Pool tab
  await page.getByRole('button', { name: /Available Pool/i }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${ARTIFACT_DIR}/fresh_rider_available_pool.png` });

  // 8. Click Active Run tab
  await page.getByRole('button', { name: /Active Run/i }).click();
  await page.waitForTimeout(500);

  await page.screenshot({ path: `${ARTIFACT_DIR}/fresh_rider_active_tab.png` });
});
