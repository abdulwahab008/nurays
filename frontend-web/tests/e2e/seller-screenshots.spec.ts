import { test, expect } from '@playwright/test';

test('screenshot all product sub-section views', async ({ page }) => {
  await page.goto('/dev-login?role=seller&autologin=1');
  await page.waitForURL('**/sellers/dashboard', { timeout: 20000 });

  // Products - All view
  await page.goto('/sellers/products');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '../screenshots/products-all.png', fullPage: false });

  // Products - Inventory view
  await page.goto('/sellers/products?view=inventory');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '../screenshots/products-inventory.png', fullPage: false });

  // Promotions - Discounts view
  await page.goto('/sellers/promotions');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: '../screenshots/promotions-discounts.png', fullPage: false });
});
