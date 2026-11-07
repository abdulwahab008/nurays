import { test, expect } from '@playwright/test';

test('a rider gets the rider dashboard with none of the customer shortcuts', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(process.env.E2E_RIDER_EMAIL ?? 'e2e-rider@nuray.test');
  await page.getByLabel('Password').fill(process.env.E2E_RIDER_PASSWORD ?? 'RiderPass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/riders\/dashboard/, { timeout: 15_000 });

  for (const name of [/^Current/, /^New jobs/, /^Done/]) {
    await expect(page.getByRole('tab', { name })).toBeVisible({ timeout: 10_000 });
  }
  await page.getByRole('tab', { name: /^New jobs/ }).click();
  await expect(page.getByRole('tab', { name: /^New jobs/ })).toHaveAttribute('aria-selected', 'true');

  await expect(page.locator('a[href="/cart"]')).toHaveCount(0);
  await expect(page.locator('a[href="/profile/addresses"]')).toHaveCount(0);
  await expect(page.getByRole('search')).toHaveCount(0);
});
