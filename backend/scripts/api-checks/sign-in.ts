/**
 * Sign-up and sign-in hardening as the outside sees it: which new passwords are refused, that a wrong
 * password and an unknown account look the same, that a password-reset link works once, how many wrong
 * passwords "confirm with your password" puts up with, how often an e-mail address can be changed,
 * that staff need longer passwords, which Google sign-in requests are refused, how a signed-in person
 * changes their password (and what that does to their other devices), and which one-time codes can be
 * asked for. The limits per
 * address, phone number and e-mail address are relaxed on a development server (see live() in
 * src/middleware/rateLimiter.ts), so they are not tried.
 */
import { createHash, randomBytes } from 'crypto';
import { Actor, call, login, makeUser, ok, PASSWORD, prisma, Reply, sleep, unique } from './lib';

const STRONG = 'Marble-Orchard-58';
const TWELVE = 'Orchid-Mapl8'; // the shortest password a staff member may have
const ELEVEN = TWELVE.slice(1);

const register = (email: string, password: string) => call(null, 'POST', '/auth/register', { email, password, user_type: 'customer', full_name: 'Sam Li' });
const tryLogin = (email: string, password: string) => call(null, 'POST', '/auth/login', { phoneOrEmail: email, otpCodeOrPassword: password, loginMethod: 'email' });
const resetWith = (token: string, password: string) => call(null, 'POST', '/auth/reset-password', { token, password });
/** The part of an address before the @ as the password rules read it (letters and digits only). */
const nameOf = (email: string) => email.split('@')[0].replace(/[^a-z0-9]/gi, '');
const said = (r: Reply) => [r.status, r.code === r.status ? '' : r.code, r.body?.error?.details ? JSON.stringify(r.body.error.details) : ''].filter(Boolean).join(' ');
/** A refusal of a weak new password: 400 WEAK_PASSWORD, with why and the length that is asked for. */
const weak = (r: Reply, reason: string, minLength: number) => r.status === 400 && r.code === 'WEAK_PASSWORD' && r.body?.error?.details?.reason === reason && r.body.error.details.minLength === minLength;
/** A too-short password is stopped by the request validator before the password rules see it. */
const validatorRefusesPassword = (r: Reply) => r.status === 400 && r.code === 'VALIDATION_ERROR' && String(JSON.stringify(r.body?.error?.details)).includes('assword');

/** A password-reset link made the way the API stores one: a random token, of which only the hash is kept. */
async function resetLink(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await prisma.passwordReset.create({ data: { userId, tokenHash: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3_600_000) } });
  return token;
}

/** The database allows one super admin, so reuse the one an earlier run made (it has the shared password). Null when it is not one of ours. */
async function superAdmin(): Promise<Actor | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await prisma.user.findFirst({ where: { staffRole: 'super_admin' }, select: { id: true, email: true, phone: true } });
    if (!existing) {
      try {
        return await makeUser('admin', { staffRole: 'super_admin' });
      } catch {
        continue; // another suite made it a moment ago
      }
    }
    if (!existing.email?.startsWith('chk.admin.')) return null;
    const tokens = await login(existing.email);
    const actor: Actor = { id: existing.id, email: existing.email, phone: existing.phone, userType: 'admin', ...tokens, as: (method, path, body, opts) => call(actor.access, method, path, body, opts) };
    return actor;
  }
  return null;
}

export default async function signIn() {
  // 1. sign-up refuses weak passwords and accepts a strong one
  const email = `chk.signup.${unique()}@nuray.test`;
  const common = await register(email, 'password123');
  ok('a common password is refused with WEAK_PASSWORD / COMMON and the length asked for', weak(common, 'COMMON', 8), said(common));
  const personal = await register(email, `${nameOf(email)}-Tulip7`);
  ok("a password built from the person's own e-mail name is refused with PERSONAL", weak(personal, 'PERSONAL', 8), said(personal));
  const short = await register(email, 'Ab3-xyz');
  ok('a 7-character password is refused', weak(short, 'TOO_SHORT', 8) || validatorRefusesPassword(short), said(short));
  ok('and none of the refused tries made an account', (await prisma.user.count({ where: { email } })) === 0);
  const created = await register(email, STRONG);
  ok('a strong password makes the account (201) and signs the person in', created.status === 201 && created.body.data?.user?.email === email && !!created.body.data?.tokens?.access_token, said(created));
  ok('and they can sign in again with it', (await tryLogin(email, STRONG)).status === 200);

  // 2. signing in: a wrong password and an unknown account get the same answer
  const person = await makeUser('customer');
  const right = await tryLogin(person.email, PASSWORD);
  const wrong = await tryLogin(person.email, 'Wrong-Wrong-9');
  const ghost = await tryLogin(`chk.ghost.${unique()}@nuray.test`, 'Wrong-Wrong-9');
  ok('signing in with the right password works', right.status === 200 && !!right.body.data?.tokens?.access_token, said(right));
  ok('a wrong password answers 401 INVALID_CREDENTIALS', wrong.status === 401 && wrong.code === 'INVALID_CREDENTIALS', said(wrong));
  ok('an unknown account gets the same status, code and message (no way to tell which accounts exist)', ghost.status === wrong.status && ghost.code === wrong.code && !!wrong.body.error?.message && ghost.body.error?.message === wrong.body.error.message, `${said(ghost)} / ${said(wrong)}`);

  // 3. resetting a password
  const forgetful = await makeUser('customer');
  const link = await resetLink(forgetful.id);
  const tooWeak = await resetWith(link, 'password123');
  ok('a reset to a common password is refused with WEAK_PASSWORD / COMMON', weak(tooWeak, 'COMMON', 8), said(tooWeak));
  const ownName = await resetWith(link, `${nameOf(forgetful.email)}-Tulip7`);
  ok("so is one built from the account's e-mail name", weak(ownName, 'PERSONAL', 8), said(ownName));
  ok('and refused tries do not use up the link', (await prisma.passwordReset.count({ where: { userId: forgetful.id, usedAt: null } })) === 1);
  const changed = await resetWith(link, STRONG);
  ok('a strong password resets it', changed.status === 200, said(changed));
  const reused = await resetWith(link, 'Cedar-Bridge-77');
  ok('the link cannot be used twice', reused.status === 400 && reused.code === 'INVALID_RESET_TOKEN', said(reused));
  const [fresh, stale] = [await tryLogin(forgetful.email, STRONG), await tryLogin(forgetful.email, PASSWORD)];
  ok('the new password signs in and the old one does not', fresh.status === 200 && stale.status === 401, `${fresh.status} / ${stale.status}`);
  const oldSession = await forgetful.as('GET', '/auth/me');
  ok('every session the account had before is ended by the reset', oldSession.status === 401, said(oldSession));

  // 4. "confirm with your password": wrong passwords answer 400, five of them stop even the right one, and only for that account
  const newAddress = () => `chk.move.${unique()}@nuray.test`;
  const changeEmail = (who: Actor, password: string) => who.as('PATCH', '/users/me', { email: newAddress(), currentPassword: password });
  const guesser = await makeUser('customer');
  const bystander = await makeUser('customer');
  const wrongTries: Reply[] = [];
  for (let i = 0; i < 5; i++) wrongTries.push(await changeEmail(guesser, 'Wrong-Wrong-9'));
  ok('wrong passwords answer 400 INVALID_PASSWORD, never 401', wrongTries.every((r) => r.status === 400 && r.code === 'INVALID_PASSWORD'), wrongTries.map(said).join(' | '));
  const locked = await changeEmail(guesser, PASSWORD);
  ok('after five wrong ones the next attempt is 429 RATE_LIMITED even with the right password', locked.status === 429 && locked.code === 'RATE_LIMITED', said(locked));
  ok('and the e-mail address did not change', (await prisma.user.findUniqueOrThrow({ where: { id: guesser.id }, select: { email: true } })).email === guesser.email);
  const unaffected = await changeEmail(bystander, PASSWORD);
  ok('a different user is not affected', unaffected.status === 200, said(unaffected));
  const forgiving = await makeUser('customer');
  for (let i = 0; i < 4; i++) await changeEmail(forgiving, 'Wrong-Wrong-9');
  const cleared = await changeEmail(forgiving, PASSWORD);
  const afterwards: Reply[] = [];
  for (let i = 0; i < 4; i++) afterwards.push(await changeEmail(forgiving, 'Wrong-Wrong-9'));
  ok('a right password clears the count of wrong ones', cleared.status === 200 && afterwards.every((r) => r.status === 400 && r.code === 'INVALID_PASSWORD'), `${said(cleared)} then ${afterwards.map((r) => r.status).join()}`);

  // 5. an e-mail address can be changed three times an hour (MAX_EMAIL_CHANGES_PER_HOUR in user-profile.service.ts)
  const mover = await makeUser('customer');
  const moves: Reply[] = [];
  for (let i = 0; i < 4; i++) moves.push(await changeEmail(mover, PASSWORD));
  ok('three e-mail changes in an hour go through', moves.slice(0, 3).every((r) => r.status === 200), moves.map((r) => r.status).join());
  ok('the fourth is refused with 429 RATE_LIMITED', moves[3].status === 429 && moves[3].code === 'RATE_LIMITED', said(moves[3]));
  ok('and the address stays the third one', (await prisma.user.findUniqueOrThrow({ where: { id: mover.id }, select: { email: true } })).email === moves[2].body.data?.email);

  // 6. staff passwords need twelve characters, not eight
  const staff = await makeUser('admin');
  const staffLink = await resetLink(staff.id);
  const staffShort = await resetWith(staffLink, ELEVEN);
  ok('a staff password of 11 characters is refused by a reset link (WEAK_PASSWORD / TOO_SHORT, 12 asked for)', weak(staffShort, 'TOO_SHORT', 12), said(staffShort));
  const staffReset = await resetWith(staffLink, TWELVE);
  ok('and one of 12 characters is accepted, on the same link', staffReset.status === 200, said(staffReset));
  const [staffNew, staffOld] = [await tryLogin(staff.email, TWELVE), await tryLogin(staff.email, PASSWORD)];
  ok('the staff member signs in with the new password only', staffNew.status === 200 && staffOld.status === 401, `${staffNew.status} / ${staffOld.status}`);
  const boss = await superAdmin();
  if (!boss) console.log('SKIP  a super admin setting a staff password: the database has a super admin this check cannot sign in as');
  else {
    const setPassword = (password: string) => boss.as('POST', `/admin/staff/${staff.id}/password`, { password });
    const tooShort = await setPassword(ELEVEN);
    ok('a super admin setting a staff password of 11 characters is refused', tooShort.status === 400 && (weak(tooShort, 'TOO_SHORT', 12) || validatorRefusesPassword(tooShort)), said(tooShort));
    const commonStaff = await setPassword('password1234');
    ok('a common staff password of 12 characters is refused with WEAK_PASSWORD / COMMON', weak(commonStaff, 'COMMON', 12), said(commonStaff));
    ok('refused tries change nothing', (await tryLogin(staff.email, TWELVE)).status === 200);
    const accepted = await setPassword('Pewter-Lamp9');
    ok('a staff password of 12 characters is accepted', accepted.status === 200, said(accepted));
    const [replaced, former] = [await tryLogin(staff.email, 'Pewter-Lamp9'), await tryLogin(staff.email, TWELVE)];
    ok('and the staff member signs in with it only', replaced.status === 200 && former.status === 401, `${replaced.status} / ${former.status}`);
  }

  // 7. Google sign-in takes an access token (the web button) or an ID token (a native app): not both, not neither, and nothing forged
  const longString = (c: string) => c.repeat(24);
  const both = await call(null, 'POST', '/auth/google', { accessToken: longString('a'), idToken: longString('b') });
  ok('Google sign-in with an access token and an ID token together is refused', both.status === 400 && both.code === 'VALIDATION_ERROR', said(both));
  const neither = await call(null, 'POST', '/auth/google', {});
  ok('and with neither', neither.status === 400 && neither.code === 'VALIDATION_ERROR', said(neither));
  const tooLong = await call(null, 'POST', '/auth/google', { idToken: 'x'.repeat(9000) });
  ok('an ID token beyond any real size is refused before it is looked at', tooLong.status === 400 && tooLong.code === 'VALIDATION_ERROR', said(tooLong));
  const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"iss":"https://accounts.google.com","email":"victim@example.com","email_verified":true}').toString('base64url')}.`;
  for (const [what, idToken] of [['junk', 'this.is-not.a-jwt'], ['an unsigned token that claims a verified Google e-mail', unsigned]] as const) {
    const r = await call(null, 'POST', '/auth/google', { idToken });
    // 401 when a Google client is configured; 503 while none is (and the token is never looked at): either way nobody is signed in
    ok(`an ID token that is ${what} signs nobody in`, (r.status === 401 || r.status === 503) && !r.body?.data?.tokens, said(r));
  }

  // 8. changing the password while signed in
  const changePassword = (who: Actor, currentPassword: string, newPassword: string) => who.as('POST', '/auth/change-password', { currentPassword, newPassword });
  const refreshWith = (refreshToken: string) => call(null, 'POST', '/auth/refresh', { refreshToken });
  const anonymous = await call(null, 'POST', '/auth/change-password', { currentPassword: PASSWORD, newPassword: STRONG });
  ok('changing a password needs a signed-in account (401)', anonymous.status === 401, said(anonymous));

  const changer = await makeUser('customer');
  const otherDevice = await login(changer.email); // the same account signed in somewhere else
  const wrongCurrent = await changePassword(changer, 'Wrong-Wrong-9', STRONG);
  ok('a wrong current password answers 400 INVALID_PASSWORD (never 401) and changes nothing', wrongCurrent.status === 400 && wrongCurrent.code === 'INVALID_PASSWORD' && (await tryLogin(changer.email, PASSWORD)).status === 200, said(wrongCurrent));
  const commonNew = await changePassword(changer, PASSWORD, 'password123');
  ok('a common new password is refused with WEAK_PASSWORD / COMMON', weak(commonNew, 'COMMON', 8), said(commonNew));
  const personalNew = await changePassword(changer, PASSWORD, `${nameOf(changer.email)}-Tulip7`);
  ok("one built from the account's e-mail name is refused with PERSONAL", weak(personalNew, 'PERSONAL', 8), said(personalNew));
  const shortNew = await changePassword(changer, PASSWORD, 'Ab3-xyz');
  ok('a 7-character one is refused with TOO_SHORT', weak(shortNew, 'TOO_SHORT', 8), said(shortNew));
  const sameAgain = await changePassword(changer, PASSWORD, PASSWORD);
  ok('the same password again is refused with 400 PASSWORD_UNCHANGED', sameAgain.status === 400 && sameAgain.code === 'PASSWORD_UNCHANGED', said(sameAgain));
  ok('and none of those refusals changed the password or ended a session', (await tryLogin(changer.email, PASSWORD)).status === 200 && (await changer.as('GET', '/auth/me')).status === 200 && (await call(otherDevice.access, 'GET', '/auth/me')).status === 200);

  const didChange = await changePassword(changer, PASSWORD, STRONG);
  const issued = didChange.body?.data?.tokens;
  ok('a good new password changes it (200) and hands back tokens for this session', didChange.status === 200 && !!issued?.access_token && !!issued?.refresh_token && issued.expires_in > 0, said(didChange));
  const [signsInNew, signsInOld] = [await tryLogin(changer.email, STRONG), await tryLogin(changer.email, PASSWORD)];
  ok('the new password signs in and the old one does not', signsInNew.status === 200 && signsInOld.status === 401, `${signsInNew.status} / ${signsInOld.status}`);
  const [oldHere, oldThere] = [await changer.as('GET', '/auth/me'), await call(otherDevice.access, 'GET', '/auth/me')];
  ok('the tokens from before the change are void, on this device and on the other one', oldHere.status === 401 && oldThere.status === 401, `${oldHere.status} / ${oldThere.status}`);
  const oldRefresh = await refreshWith(otherDevice.refresh);
  ok("and the other device's refresh token cannot get a new session", oldRefresh.status === 401 && oldRefresh.code === 'SESSION_REVOKED', said(oldRefresh));
  const [newHere, newRefresh] = [await call(issued?.access_token, 'GET', '/auth/me'), await refreshWith(issued?.refresh_token ?? 'none')];
  ok('the tokens it handed back work, and refresh', newHere.status === 200 && newRefresh.status === 200 && !!newRefresh.body?.data?.accessToken, `${newHere.status} / ${newRefresh.status}`);
  let trail = 0;
  for (let i = 0; i < 10 && trail === 0; i++) {
    trail = await prisma.auditLog.count({ where: { userId: changer.id, action: 'auth:PASSWORD_CHANGED' } });
    if (trail === 0) await sleep(200);
  }
  ok('the change leaves a trail in the audit log', trail === 1, String(trail));

  const googleOnly = await makeUser('customer');
  await prisma.user.update({ where: { id: googleOnly.id }, data: { passwordHash: null } });
  const passwordless = await changePassword(googleOnly, PASSWORD, STRONG);
  ok('an account with no password cannot be given one by a token alone (400 NO_PASSWORD_SET)', passwordless.status === 400 && passwordless.code === 'NO_PASSWORD_SET' && (await prisma.user.findUniqueOrThrow({ where: { id: googleOnly.id }, select: { passwordHash: true } })).passwordHash === null, said(passwordless));

  const pestered = await makeUser('customer');
  const guesses: Reply[] = [];
  for (let i = 0; i < 5; i++) guesses.push(await changePassword(pestered, 'Wrong-Wrong-9', STRONG));
  const afterGuesses = await changePassword(pestered, PASSWORD, STRONG);
  ok('five wrong current passwords stop even the right one (429 RATE_LIMITED), as on the other confirm-with-password screens', guesses.every((r) => r.code === 'INVALID_PASSWORD') && afterGuesses.status === 429 && afterGuesses.code === 'RATE_LIMITED', `${guesses.map((r) => r.status).join()} then ${said(afterGuesses)}`);

  const staffMember = await makeUser('admin');
  const staffShortNew = await changePassword(staffMember, PASSWORD, ELEVEN);
  ok('a staff member needs 12 characters for the new password too', weak(staffShortNew, 'TOO_SHORT', 12), said(staffShortNew));
  const staffChanged = await changePassword(staffMember, PASSWORD, TWELVE);
  ok('and 12 are accepted', staffChanged.status === 200, said(staffChanged));

  // 9. a one-time code is asked for to register or to sign in, and for nothing else
  const number = `+92301${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const unusedPurpose = await call(null, 'POST', '/auth/otp/request', { phone: number, purpose: 'reset_password' });
  ok('a code "for a password reset" is not offered (a reset goes through the link sent by e-mail): 400, and no code is made or sent', unusedPurpose.status === 400 && unusedPurpose.code === 'VALIDATION_ERROR' && (await prisma.otpVerification.count({ where: { phone: number } })) === 0, said(unusedPurpose));
}
