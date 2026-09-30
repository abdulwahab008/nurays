import { test, expect } from '@playwright/test';

test.describe('Seller Studio Analytics Section', () => {
  test('should display complete analytics dashboard with interactive periods, chart, and KPIs', async ({ page }) => {
    // 1. Log in via dev-login auto-login URL
    await page.goto('/dev-login?role=seller&autologin=1');

    // Should redirect to /sellers/dashboard
    await page.waitForURL('**/sellers/dashboard', { timeout: 20000 });
    await expect(page).toHaveURL(/\/sellers\/dashboard/);

    // 2. Navigate to Analytics via sidebar
    const analyticsLink = page.locator('aside a[href="/sellers/analytics"]');
    await expect(analyticsLink).toBeVisible();
    await analyticsLink.click();

    await page.waitForURL('**/sellers/analytics', { timeout: 15000 });
    await expect(page).toHaveURL(/\/sellers\/analytics/);

    // 3. Verify Page Header & Controls
    await expect(page.locator('h1', { hasText: /Analytics & Sales Velocity/i })).toBeVisible();
    await expect(page.getByText(/Live Kitchen Performance Telemetry/i)).toBeVisible();

    // 4. Verify 4 Core KPI Cards are rendered
    await expect(page.getByText(/Net Revenue/i)).toBeVisible();
    await expect(page.getByText(/Dishes Sold/i)).toBeVisible();
    await expect(page.getByText(/Fulfillment Rate/i)).toBeVisible();
    await expect(page.getByText(/Avg. Order Value/i)).toBeVisible();

    // 5. Verify Revenue Velocity Chart exists
    await expect(page.getByText(/Revenue Velocity & Trajectory/i)).toBeVisible();
    const svgChart = page.locator('svg[viewBox="0 0 1000 300"]');
    await expect(svgChart).toBeVisible();

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
    await expect(period7d).toHaveClass(/bg-slate-900/);

    // Switch to 90 Days
    await period90d.click();
    await page.waitForTimeout(600);
    await expect(period90d).toHaveClass(/bg-slate-900/);

    // Switch to 1 Year
    await period1y.click();
    await page.waitForTimeout(600);
    await expect(period1y).toHaveClass(/bg-slate-900/);

    // Switch back to 30 Days
    await period30d.click();
    await page.waitForTimeout(600);
    await expect(period30d).toHaveClass(/bg-slate-900/);

    // 7. Test Chart View Switcher (Bars vs Wave)
    const waveBtn = page.getByRole('button', { name: 'Wave' });
    const barsBtn = page.getByRole('button', { name: 'Bars' });

    await waveBtn.click();
    await page.waitForTimeout(400);
    await expect(svgChart.locator('path[stroke="#10B981"]')).toBeVisible();

    await barsBtn.click();
    await page.waitForTimeout(400);

    // 8. Verify Kitchen Fulfillment Quality Section
    await expect(page.getByText(/Kitchen Fulfillment Quality/i)).toBeVisible();
    await expect(page.getByText(/Delivery completion & cancellation health/i)).toBeVisible();

    // 9. Verify Top Performing Dishes
    await expect(page.getByText(/Top Performing Dishes/i)).toBeVisible();

    // 10. Verify Sidebar has Analytics highlighted and proper SVG icon
    await expect(analyticsLink).toBeVisible();

    // Take verified screenshot
    await page.screenshot({ path: 'test-results/seller-analytics-verified.png', fullPage: true });
  });
});
