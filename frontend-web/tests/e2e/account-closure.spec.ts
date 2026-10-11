import { test, expect, request, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

// Signing out, and closing one's own account, from the profile page: both end on the home page with the person signed out. (The page's
// "sign in to see your profile" redirect used to win the race against the move to the home page, so the person landed on the sign-in page
// with ?next=/profile, which for a closed account leads nowhere.) Closing asks for the word DELETE, then the password.

const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
const PASSWORD = 'Lantern-Quartz-71!';

function dbQuery(sql: string): string {
  return execSync(`psql "${DB_URL}" -tA -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' }).trim();
}

/** A new customer with a verified e-mail, signed in through the API. */
async function newCustomer(): Promise<{ id: string; email: string; jwt: string; user: unknown }> {
  const api = await request.newContext();
  const email = `closing-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await api.post(`${API_BASE}/auth/register`, { data: { email, password: PASSWORD, user_type: 'customer', full_name: 'Closing Customer' } });
  dbQuery(`UPDATE users SET email_verified = true, status = 'active' WHERE email = '${email}'`);
  const login = await api.post(`${API_BASE}/auth/login`, { data: { phoneOrEmail: email, otpCodeOrPassword: PASSWORD, loginMethod: 'email' } });
  const body = await login.json();
  return { id: body.data?.user?.id ?? '', email, jwt: body.data?.tokens?.access_token ?? '', user: body.data?.user ?? {} };
}

async function signIn(page: Page, session: { jwt: string; user: unknown }) {
  await page.addInitScript(
    ({ token, user }: { token: string; user: unknown }) => {
      window.localStorage.setItem('auth_token', token);
      window.localStorage.setItem('access_token', token);
      window.localStorage.setItem('token', token);
      window.localStorage.setItem('auth-storage', JSON.stringify({ state: { user, token, isAuthenticated: true }, version: 0 }));
    },
    { token: session.jwt, user: session.user }
  );
  await page.context().addCookies(
    ['access_token', 'auth_token'].map((name) => ({ name, value: session.jwt, domain: 'localhost', path: '/', httpOnly: false, secure: false, sameSite: 'Lax' as const }))
  );
}

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
    await page.locator('#ask-dialog-input').fill(PASSWORD);
    await page.locator('#ask-dialog-input').press('Enter');
    await expect(page).toHaveURL(/\/$/, { timeout: 15000 });
    await expect(page).not.toHaveURL(/\/login/);
    expect(dbQuery(`SELECT status FROM users WHERE id = '${customer.id}'`)).toBe('deleted');
  });
});
