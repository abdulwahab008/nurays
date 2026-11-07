import { test, expect } from '@playwright/test';
import { signIn } from './support/customer';

test.describe('Seller menu navigation', () => {
  test('Menu opens the dishes, whose Stock tab and the Discounts sub-item each open their page', async ({ page }) => {
    await signIn(page, { email: 'e2e-seller@nuray.test', password: 'SellerPass123!' });
    await page.goto('/sellers/dashboard');

    await page.locator('aside a[href="/sellers/products"]').first().click();
    await page.waitForURL('**/sellers/products', { timeout: 15000 });

    const stockTab = page.getByRole('link', { name: /^Stock/ });
    await expect(page.getByRole('link', { name: /^All dishes/ })).toHaveAttribute('aria-current', 'page');
    await stockTab.click();
    await page.waitForURL('**/sellers/products?view=inventory', { timeout: 15000 });
    await expect(stockTab).toHaveAttribute('aria-current', 'page');

    await page.locator('aside a[href="/sellers/promotions"]').click();
    await page.waitForURL('**/sellers/promotions', { timeout: 15000 });
  });
});
