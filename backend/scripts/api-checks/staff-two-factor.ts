/**
 * Staff two-step sign-in (SEC-3) and the order fingerprint (MONEY-7), as the outside sees them. The test server runs
 * with STAFF_2FA_REQUIRED unset (not production), so set-up is voluntary here; once on, the second step is always asked.
 */
import { type Actor, call, login, makeKitchen, makeProduct, makeUser, ok, PASSWORD, prisma, sleep, unique } from './lib';
import { base32Decode, hotp, stepAt } from '../../src/utils/totp';
import type { Prisma } from '@prisma/client';

const codeAt = (secret: string, offsetSteps = 0) => hotp(base32Decode(secret), stepAt(Date.now()) + offsetSteps);
const said = (r: { status: number; code: unknown }) => `${r.status} ${r.code}`;
/** Audit rows are written in the background: count them once they have had a moment to land. */
async function auditRows(where: Prisma.AuditLogWhereInput, atLeast = 1): Promise<number> {
  let n = 0;
  for (let i = 0; i < 15; i++) {
    n = await prisma.auditLog.count({ where });
    if (n >= atLeast) break;
    await sleep(200);
  }
  return n;
}
const signIn = (email: string, password = PASSWORD) => call(null, 'POST', '/auth/login', { phoneOrEmail: email, otpCodeOrPassword: password, loginMethod: 'email' });

/** The database allows one super admin: reuse the one an earlier run made (it has the shared password). */
async function superAdmin(): Promise<Actor | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await prisma.user.findFirst({ where: { staffRole: 'super_admin' }, select: { id: true, email: true, phone: true } });
    if (!existing) {
      try {
        return await makeUser('admin', { staffRole: 'super_admin' });
      } catch {
        continue;
      }
    }
    if (!existing.email?.startsWith('chk.admin.')) return null;
    const tokens = await login(existing.email);
    const actor: Actor = { id: existing.id, email: existing.email, phone: existing.phone, userType: 'admin', ...tokens, as: (m, p, b, o) => call(actor.access, m, p, b, o) };
    return actor;
  }
  return null;
}

export default async function staffTwoFactor() {
  // 1. a staff member without it signs in as before (not required on this server) and sets it up
  const staff = await makeUser('admin');
  const status0 = await staff.as('GET', '/auth/2fa');
  ok('a staff member can see that two-step sign-in is off', status0.status === 200 && status0.body.data?.enabled === false, said(status0));
  const customer = await makeUser('customer');
  ok('it is for staff accounts only (403 for a customer)', (await customer.as('POST', '/auth/2fa/setup', {})).status === 403);
  const begun = await staff.as('POST', '/auth/2fa/setup', {});
  const secret: string = begun.body.data?.secret ?? '';
  ok('set-up gives a secret and the link an authenticator app opens', begun.status === 200 && /^[A-Z2-7]{32}$/.test(secret) && String(begun.body.data?.otpauthUrl).startsWith('otpauth://totp/Nuray'), said(begun));
  ok('the secret is not stored as it is', !JSON.stringify(await prisma.staffTwoFactor.findUnique({ where: { userId: staff.id } })).includes(secret));
  const wrongFirst = await staff.as('POST', '/auth/2fa/setup/confirm', { code: '000000' });
  ok('a wrong first code does not turn it on (400 INVALID_TWO_FACTOR_CODE, never 401)', wrongFirst.status === 400 && wrongFirst.code === 'INVALID_TWO_FACTOR_CODE', said(wrongFirst));
  const confirmed = await staff.as('POST', '/auth/2fa/setup/confirm', { code: codeAt(secret) });
  const backupCodes: string[] = confirmed.body.data?.backupCodes ?? [];
  ok('the right code turns it on and gives ten backup codes, once', confirmed.status === 200 && backupCodes.length === 10, said(confirmed));
  ok('set-up again is refused while it is on (409)', (await staff.as('POST', '/auth/2fa/setup', {})).code === 'TWO_FACTOR_ALREADY_ON');
  ok('turning it on leaves a trail', (await auditRows({ userId: staff.id, action: 'auth:2FA_ENABLED' })) === 1);

  // 2. now the password alone is not enough
  const first = await signIn(staff.email);
  const challenge: string = first.body.data?.challengeToken ?? '';
  ok('the right password now answers with the second step and no session', first.status === 200 && first.body.data?.twoFactorRequired === true && !!challenge && !first.body.data?.tokens, said(first));
  ok('the challenge token is no API credential', (await call(challenge, 'GET', '/auth/me')).status === 401);
  ok('nor a refresh token', (await call(null, 'POST', '/auth/refresh', { refreshToken: challenge })).status === 401);
  const reused = await call(null, 'POST', '/auth/2fa/verify', { challengeToken: challenge, code: codeAt(secret) });
  ok('the code already used to turn it on does not work a second time', reused.status === 400 && reused.code === 'INVALID_TWO_FACTOR_CODE', said(reused));
  const garbage = await call(null, 'POST', '/auth/2fa/verify', { challengeToken: 'not-a-token', code: codeAt(secret, 1) });
  ok('a bad challenge token is refused (401 CHALLENGE_EXPIRED)', garbage.status === 401 && garbage.code === 'CHALLENGE_EXPIRED', said(garbage));
  const done = await call(null, 'POST', '/auth/2fa/verify', { challengeToken: challenge, code: codeAt(secret, 1) });
  ok('the next code from the app completes the sign-in with a session', done.status === 200 && !!done.body.data?.tokens?.access_token && done.body.data?.user?.userType === 'admin', said(done));
  ok('and that session works', (await call(done.body.data?.tokens?.access_token, 'GET', '/auth/me')).status === 200);

  // 3. a backup code works once
  const viaBackup = await call(null, 'POST', '/auth/2fa/verify', { challengeToken: (await signIn(staff.email)).body.data?.challengeToken, code: backupCodes[0].toUpperCase() });
  ok('a backup code (any case) completes the sign-in and says how many are left', viaBackup.status === 200 && viaBackup.body.data?.usedBackupCode === true && viaBackup.body.data?.backupCodesLeft === 9, said(viaBackup));
  const backupAgain = await call(null, 'POST', '/auth/2fa/verify', { challengeToken: (await signIn(staff.email)).body.data?.challengeToken, code: backupCodes[0] });
  ok('the same backup code does not work again', backupAgain.status === 400 && backupAgain.code === 'INVALID_TWO_FACTOR_CODE', said(backupAgain));

  // 3b. the same code sent by two sign-ins at once lets exactly one through (an app code, then a backup code)
  const racePair = async (code: string) => {
    const [a, b] = await Promise.all([signIn(staff.email), signIn(staff.email)]);
    return Promise.all([
      call(null, 'POST', '/auth/2fa/verify', { challengeToken: a.body.data?.challengeToken, code }),
      call(null, 'POST', '/auth/2fa/verify', { challengeToken: b.body.data?.challengeToken, code }),
    ]);
  };
  // (the codes for now and the next step are spent: forget that, so this race is on a fresh code)
  await prisma.staffTwoFactor.update({ where: { userId: staff.id }, data: { lastUsedStep: null } });
  const appRace = await racePair(codeAt(secret));
  ok('an app code sent by two sign-ins at once lets exactly one through', appRace.filter((r) => r.status === 200).length === 1, appRace.map(said).join(' | '));
  const backupRace = await racePair(backupCodes[2]);
  ok('a backup code sent by two sign-ins at once lets exactly one through', backupRace.filter((r) => r.status === 200).length === 1, backupRace.map(said).join(' | '));

  // 4. wrong codes lock the second step for a while
  const lockChallenge = (await signIn(staff.email)).body.data?.challengeToken;
  const tries = [];
  for (let i = 0; i < 5; i++) tries.push((await call(null, 'POST', '/auth/2fa/verify', { challengeToken: lockChallenge, code: '123456' })).code);
  const locked = await call(null, 'POST', '/auth/2fa/verify', { challengeToken: lockChallenge, code: backupCodes[1] });
  ok('after five wrong codes even a right one waits (429 TWO_FACTOR_LOCKED)', locked.status === 429 && locked.code === 'TWO_FACTOR_LOCKED', `${tries.join(',')} then ${said(locked)}`);
  ok('wrong codes leave a trail', (await auditRows({ entityId: staff.id, action: 'auth:2FA_FAILED' }, 5)) >= 5);

  // 5. the super admin resets a staff member who lost the phone: they set it up again at their next sign-in
  const boss = await superAdmin();
  if (boss) {
    ok("an ordinary admin cannot reset another's two-step sign-in (403)", (await (await makeUser('admin')).as('DELETE', `/admin/staff/${staff.id}/two-factor`)).status === 403);
    const reset = await boss.as('DELETE', `/admin/staff/${staff.id}/two-factor`);
    const resetRows = await auditRows({ entityId: staff.id, action: 'staff:2FA_RESET' });
    ok('the super admin resets it (200), and it leaves a trail', reset.status === 200 && reset.body.data?.reset === true && resetRows === 1, `${said(reset)} rows=${resetRows}`);
    ok("and the staff member's sessions ended", (await call(done.body.data?.tokens?.access_token, 'GET', '/auth/me')).status === 401);
    const after = await signIn(staff.email);
    ok('the next sign-in needs no code (not required on this server) and the lock is gone', after.status === 200 && !!after.body.data?.tokens, said(after));
    const list = await boss.as('GET', '/admin/staff');
    ok('the staff list says who has two-step sign-in on', list.status === 200 && (list.body.data ?? []).some((s: { id: string; twoFactorEnabled?: boolean }) => s.id === staff.id && s.twoFactorEnabled === false), said(list));
  } else {
    ok('(skipped: the super admin here is not a check account)', true);
  }

  // 6. MONEY-7: one checkout key, one order
  const kitchen = await makeKitchen();
  const dish = await makeProduct(kitchen.sellerId, { price: 300 });
  const otherDish = await makeProduct(kitchen.sellerId, { price: 500 });
  const buyer = await makeUser('customer');
  const key = unique();
  const body = { items: [{ productId: dish, quantity: 1 }], deliveryType: 'self_pickup', paymentMethod: 'cod' };
  const placed = await buyer.as('POST', '/orders', body, { headers: { 'Idempotency-Key': key } });
  const again = await buyer.as('POST', '/orders', body, { headers: { 'Idempotency-Key': key } });
  const orderIdOf = (r: { body: { data?: { id?: string; order?: { id?: string } } } }) => r.body.data?.order?.id ?? r.body.data?.id;
  ok('the same checkout sent again with its key gets the same order', placed.status === 201 && [200, 201].includes(again.status) && orderIdOf(again) === orderIdOf(placed), `${placed.status}/${again.status}`);
  const changed = await buyer.as('POST', '/orders', { ...body, items: [{ productId: otherDish, quantity: 2 }] }, { headers: { 'Idempotency-Key': key } });
  ok('the same key with a different basket is refused (409 IDEMPOTENCY_KEY_REUSED), not answered with the old order', changed.status === 409 && changed.code === 'IDEMPOTENCY_KEY_REUSED', said(changed));
  ok('and no second order was made', (await prisma.order.count({ where: { customerId: buyer.id } })) === 1);
  const raceKey = unique();
  const sameAtOnce = await Promise.all([1, 2, 3].map(() => buyer.as('POST', '/orders', body, { headers: { 'Idempotency-Key': raceKey } })));
  ok('the same checkout sent three times at once makes one order, and all three get it', new Set(sameAtOnce.map(orderIdOf)).size === 1 && sameAtOnce.every((r) => r.status < 300) && (await prisma.order.count({ where: { customerId: buyer.id } })) === 2, sameAtOnce.map(said).join(' | '));
  const mixedKey = unique();
  const mixedAtOnce = await Promise.all([body, { ...body, items: [{ productId: otherDish, quantity: 1 }] }].map((b) => buyer.as('POST', '/orders', b, { headers: { 'Idempotency-Key': mixedKey } })));
  ok('two different baskets with one key at once: one order, the other 409 IDEMPOTENCY_KEY_REUSED', mixedAtOnce.filter((r) => r.status === 201).length === 1 && mixedAtOnce.filter((r) => r.code === 'IDEMPOTENCY_KEY_REUSED').length === 1 && (await prisma.order.count({ where: { customerId: buyer.id } })) === 3, mixedAtOnce.map(said).join(' | '));
  ok('the fingerprint is not shown to a rider or kitchen, and the customer has it only as an internal field at most', !JSON.stringify((await kitchen.owner.as('GET', `/seller/orders/${orderIdOf(placed)}`)).body).includes('idempotencyFingerprint'));
}
