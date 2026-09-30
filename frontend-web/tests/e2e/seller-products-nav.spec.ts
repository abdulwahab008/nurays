import { test, expect } from '@playwright/test';

test.describe('Seller Products & Sub-sections Navigation', () => {
  test('should display Products with nested Inventory and Discounts sub-items', async ({ page }) => {
    // 1. Log in via dev-login auto-login URL
    await page.goto('/dev-login?role=seller&autologin=1');
    await page.waitForURL('**/sellers/dashboard', { timeout: 20000 });

    // 2. Take screenshot of dashboard sidebar
    await page.screenshot({ path: '../products-sidebar-dashboard.png', fullPage: false });

    // 3. Click Products in the sidebar
    const productsMenu = page.locator('aside a[href="/sellers/products"]').first();
    await expect(productsMenu).toBeVisible();
    await productsMenu.click();

    await page.waitForURL('**/sellers/products', { timeout: 15000 });

    // 4. Take screenshot of Products page
    await page.screenshot({ path: '../products-page-current.png', fullPage: false });

    // 5. Check if sub-items are visible in sidebar under Products
    const inventorySubItem = page.locator('aside a[href="/sellers/products?view=inventory"]');
    const discountsSubItem = page.locator('aside a[href="/sellers/promotions"]');

    await expect(inventorySubItem).toBeVisible();
    await expect(discountsSubItem).toBeVisible();

    // 6. Click on Inventory sub-item
    await inventorySubItem.click();
    await page.waitForURL('**/sellers/products?view=inventory', { timeout: 15000 });
    await page.screenshot({ path: '../inventory-view-current.png', fullPage: false });

    // 7. Click on Discounts sub-item
    await discountsSubItem.click();
    await page.waitForURL('**/sellers/promotions', { timeout: 15000 });
    await page.screenshot({ path: '../promotions-view-current.png', fullPage: false });
  });
});
