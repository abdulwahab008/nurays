import { request, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

// A throwaway customer for the specs that need someone signed in: made through the API, its e-mail marked verified in the database
// (there is no mailbox in CI), signed in through the API, and put into the browser the way the app keeps a session.

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

export async function signIn(page: Page, session: { jwt: string; user: unknown }) {
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
