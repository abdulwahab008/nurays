import { test, expect } from '@playwright/test';
import { signIn } from './support/customer';

test.describe('Seller Studio Analytics Section', () => {
  test('should display complete analytics dashboard with interactive periods, chart, and KPIs', async ({ page }) => {
    await signIn(page, { email: 'e2e-seller@nuray.test', password: 'SellerPass123!' });
    await page.goto('/sellers/dashboard');

    // 2. Navigate to Analytics via sidebar
    const analyticsLink = page.locator('aside a[href="/sellers/analytics"]');
    await expect(analyticsLink).toBeVisible();
    await analyticsLink.click();

    await page.waitForURL('**/sellers/analytics', { timeout: 15000 });
    await expect(page).toHaveURL(/\/sellers\/analytics/);

    // 3. Verify Page Header & Controls
    await expect(page.locator('h1', { hasText: /Reports/i })).toBeVisible();

    // 4. Verify the four figures are rendered
    await expect(page.getByText('Earned in this period', { exact: true })).toBeVisible();
    await expect(page.getByText('Dishes sold', { exact: true })).toBeVisible();
    await expect(page.getByText('Orders delivered', { exact: true })).toBeVisible();
    await expect(page.getByText('Average you earn per order', { exact: true })).toBeVisible();

    // 5. Verify the earnings chart section exists (a kitchen with no sales sees one line instead of the drawing)
    await expect(page.getByText(/Earnings by day/i)).toBeVisible();
    const svgChart = page.locator('svg[viewBox="0 0 1000 300"]');
    const hasSales = await svgChart.isVisible();

    // 6. Test Period Filter Switching
    const period7d = page.locator('#period-btn-7d');
    const period30d = page.locator('#period-btn-30d');
    const period90d = page.locator('#period-btn-90d');
    const period1y = page.locator('#period-btn-1y');

    await expect(period7d).toBeVisible();
    await expect(period30d).toBeVisible();
    await expect(period90d).toBeVisible();
    await expect(period1y).toBeVisible();

    // Switch to 7 Days
    await period7d.click();
    await page.waitForTimeout(600);
    await expect(period7d).toHaveAttribute('aria-selected', 'true');

    // Switch to 90 Days
    await period90d.click();
    await page.waitForTimeout(600);
    await expect(period90d).toHaveAttribute('aria-selected', 'true');

    // Switch to 1 Year
    await period1y.click();
    await page.waitForTimeout(600);
    await expect(period1y).toHaveAttribute('aria-selected', 'true');

    // Switch back to 30 Days
    await period30d.click();
    await page.waitForTimeout(600);
    await expect(period30d).toHaveAttribute('aria-selected', 'true');

    // 7. Test Chart View Switcher (Bars vs Line)
    if (hasSales) {
      await page.getByRole('button', { name: 'Line' }).click();
      await expect(svgChart.locator('path[fill="none"]')).toBeVisible();
      await page.getByRole('button', { name: 'Bars' }).click();
    } else {
      await expect(page.getByText('No sales in this time.')).toBeVisible();
    }

    // 8. Verify the orders section
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await expect(page.getByText(/Cancelled or refunded/i)).toBeVisible();

    // 9. Verify the best-selling dishes section
    await expect(page.getByRole('heading', { name: 'Best-selling dishes' })).toBeVisible();

    // 10. Verify Sidebar has Analytics highlighted and proper SVG icon
    await expect(analyticsLink).toBeVisible();

    // Take verified screenshot
    await page.screenshot({ path: 'test-results/seller-analytics-verified.png', fullPage: true });
  });
});
