import { request, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

// A throwaway customer for the specs that need someone signed in: made through the API, its e-mail marked verified in the database
// (there is no mailbox in CI) and signed in through the API; signIn puts that person into a browser the way the website keeps a session.

export const API_BASE = (process.env.API_BASE ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
export const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://localhost:5432/frozennuray_dev';
export const CUSTOMER_PASSWORD = 'Lantern-Quartz-71!';

export function dbQuery(sql: string): string {
  return execSync(`psql "${DB_URL}" -tA -c "${sql.replace(/"/g, '\\"')}"`, { encoding: 'utf-8' }).trim();
}

export interface Customer {
  id: string;
  email: string;
  jwt: string;
  user: unknown;
}

export async function newCustomer(): Promise<Customer> {
  const api = await request.newContext();
  const email = `spec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await api.post(`${API_BASE}/auth/register`, { data: { email, password: CUSTOMER_PASSWORD, user_type: 'customer', full_name: 'Spec Customer' } });
  dbQuery(`UPDATE users SET email_verified = true, status = 'active' WHERE email = '${email}'`);
  const login = await api.post(`${API_BASE}/auth/login`, { data: { phoneOrEmail: email, otpCodeOrPassword: CUSTOMER_PASSWORD, loginMethod: 'email' } });
  const body = await login.json();
  return { id: body.data?.user?.id ?? '', email, jwt: body.data?.tokens?.access_token ?? '', user: body.data?.user ?? {} };
}

// Signs the page's browser in the way the website keeps a session: the login goes through the browser context's own request client, which
// shares the browser's cookie jar, so the API's httpOnly refresh cookie lands there; the user is put where the website remembers who is
// signed in. The access token lives only in page memory, so the app gets one through the cookie on its first request.
export async function signIn(page: Page, session: { email: string; user: unknown; password?: string }) {
  // The API sets the cookie only for a request from the website's own origin, which a browser always sends and Playwright's
  // request client does not.
  const login = await page.context().request.post(`${API_BASE}/auth/login`, {
    headers: { Origin: new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000').origin },
    data: { phoneOrEmail: session.email, otpCodeOrPassword: session.password ?? CUSTOMER_PASSWORD, loginMethod: 'email' },
  });
  if (!login.ok()) throw new Error(`signIn: login for ${session.email} answered ${login.status()}`);
  if (!(await page.context().cookies()).some((c) => c.name === 'nuray_rt')) throw new Error(`signIn: no refresh cookie for ${session.email}`);
  await page.addInitScript((user: unknown) => {
    window.localStorage.setItem('auth-storage', JSON.stringify({ state: { user, isAuthenticated: true }, version: 0 }));
  }, session.user);
}
