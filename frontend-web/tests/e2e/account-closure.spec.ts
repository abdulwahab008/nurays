import { test, expect } from '@playwright/test';
import { CUSTOMER_PASSWORD, dbQuery, newCustomer, signIn } from './support/customer';

// Signing out, and closing one's own account, from the profile page: both end on the home page with the person signed out. (The page's
// "sign in to see your profile" redirect used to win the race against the move to the home page, so the person landed on the sign-in page
// with ?next=/profile, which for a closed account leads nowhere.) Closing asks for the word DELETE, then the password.

test.describe('Leaving from the profile page', () => {
  test('signing out lands on the home page, not on the sign-in page', async ({ page }) => {
    const customer = await newCustomer();
    await signIn(page, customer);
    await page.goto('/profile');
    await expect(page.getByTestId('delete-account')).toBeVisible({ timeout: 20000 });
    await page.getByRole('button', { name: /^Sign Out$/ }).click();
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('closing the account asks for the word DELETE and the password, then ends on the home page signed out', async ({ page }) => {
    const customer = await newCustomer();
    await signIn(page, customer);
    await page.goto('/profile');
    const closeButton = page.getByTestId('delete-account');
    await expect(closeButton).toBeVisible({ timeout: 20000 });

    // The word has to be typed exactly.
    await closeButton.click();
    const answer = page.locator('#ask-dialog-input');
    await answer.fill('delete');
    await answer.press('Enter');
    await expect(page.getByRole('dialog')).toContainText(/Type DELETE/);

    // Then the password; a wrong one leaves the account open.
    await answer.fill('DELETE');
    await answer.press('Enter');
    await expect(page.locator('#ask-dialog-input')).toHaveAttribute('type', 'password');
    await page.locator('#ask-dialog-input').fill('not-my-password');
    await page.locator('#ask-dialog-input').press('Enter');
    await expect(page.getByText(/Wrong password/i).first()).toBeVisible({ timeout: 10000 });
    expect(dbQuery(`SELECT status FROM users WHERE id = '${customer.id}'`)).toBe('active');

    // The right one closes it.
    await closeButton.click();
    await page.locator('#ask-dialog-input').fill('DELETE');
    await page.locator('#ask-dialog-input').press('Enter');
    await page.locator('#ask-dialog-input').fill(CUSTOMER_PASSWORD);
    await page.locator('#ask-dialog-input').press('Enter');
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
    await expect(page).not.toHaveURL(/\/login/);
    expect(dbQuery(`SELECT status FROM users WHERE id = '${customer.id}'`)).toBe('deleted');
  });
});
