/**
 * Access tokens for the load-test accounts, written to .generated/tokens.json for the runner. Tokens last an
 * hour (JWT_EXPIRES_IN): a longer run needs this again, which is why it is a script of its own.
 *
 *   API_URL=https://staging.example/api/v1 npm run load:tokens -- --customers 500 --riders 100 --kitchens 20
 *   JWT_SECRET=... npm run load:tokens -- --sign          sign them here instead of signing in
 *
 * Signing in is the honest path (it needs no secret) but costs the server a bcrypt check per account and
 * is limited by the sign-in throttle, so `--rate` paces it (default 10 a second). `--sign` needs the API's
 * JWT_SECRET, so use it only against an environment whose secret you may hold.
 */
import { Fixture, FIXTURE_FILE, LOAD_PASSWORD, readJson, TOKENS_FILE, TokenFile, writeJson } from './common';

const API = (process.env.API_URL ?? 'http://localhost:3001/api/v1').replace(/\/+$/, '');

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function option(name: string, fallback: number): number {
  const at = process.argv.indexOf(`--${name}`);
  if (at === -1) return fallback;
  const n = Number(process.argv[at + 1]);
  if (!Number.isInteger(n) || n < 0) throw new Error(`--${name} needs a whole number`);
  return n;
}

type Account = { email: string; phone: string; userId: string };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn(account: Account): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phoneOrEmail: account.email, otpCodeOrPassword: LOAD_PASSWORD, loginMethod: 'email' }),
    });
    if (res.status === 429) {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as { data?: { tokens?: { access_token?: string } } };
    const token = body.data?.tokens?.access_token;
    if (res.status !== 200 || !token) throw new Error(`${account.email}: ${res.status}`);
    return token;
  }
  throw new Error(`${account.email}: still throttled after five tries`);
}

async function main() {
  const fixture = readJson<Fixture>(FIXTURE_FILE, 'The fixture');
  const sign = flag('sign');
  const rate = Math.max(1, option('rate', 10));
  const wanted = {
    customers: option('customers', Math.min(fixture.customers.length, 1000)),
    riders: option('riders', fixture.riders.length),
    kitchens: option('kitchens', Math.min(fixture.kitchens.length, 20)),
  };

  let mint: (account: Account, userType: string) => Promise<string>;
  if (sign) {
    if (!process.env.JWT_SECRET) throw new Error('--sign needs JWT_SECRET');
    const { generateToken } = await import('../../src/utils/jwt');
    mint = async (account, userType) => generateToken({ userId: account.userId, userType, phone: account.phone });
  } else {
    mint = (account) => signIn(account);
  }

  const failures: string[] = [];
  async function mintAll<A extends Account>(accounts: A[], userType: string): Promise<Array<{ email: string; userId: string; token: string }>> {
    const out: Array<{ email: string; userId: string; token: string }> = [];
    // `rate` accounts every second, each batch in parallel.
    for (let i = 0; i < accounts.length; i += rate) {
      const started = Date.now();
      const batch = accounts.slice(i, i + rate);
      await Promise.all(
        batch.map(async (account) => {
          try {
            out.push({ email: account.email, userId: account.userId, token: await mint(account, userType) });
          } catch (err) {
            failures.push(err instanceof Error ? err.message : String(err));
          }
        })
      );
      if (!sign) await sleep(Math.max(0, 1000 - (Date.now() - started)));
    }
    return out;
  }

  const createdAt = new Date();
  const file: TokenFile = {
    createdAt: createdAt.toISOString(),
    // Conservative: an hour from now, less a margin for a clock that is a little off.
    expiresAt: new Date(createdAt.getTime() + 55 * 60_000).toISOString(),
    customers: await mintAll(fixture.customers.slice(0, wanted.customers), 'customer'),
    riders: await mintAll(fixture.riders.slice(0, wanted.riders), 'rider'),
    kitchens: await mintAll(fixture.kitchens.slice(0, wanted.kitchens), 'seller'),
    admin: null,
  };
  if (flag('admin')) {
    const [admin] = await mintAll([fixture.admin], 'admin');
    file.admin = admin ?? null;
  }
  writeJson(TOKENS_FILE, file);
  console.log(`Tokens for ${file.customers.length} customers, ${file.riders.length} riders, ${file.kitchens.length} kitchens${file.admin ? ' and the admin' : ''} (${sign ? 'signed here' : 'signed in through the API'}); good until ${file.expiresAt}.`);
  if (failures.length > 0) {
    console.error(`${failures.length} accounts failed, for example: ${failures.slice(0, 3).join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
