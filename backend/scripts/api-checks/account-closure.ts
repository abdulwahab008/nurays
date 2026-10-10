/**
 * Closing your own account (DELETE /users/me): what sign-up asks of a password, who may close an
 * account, what stops it, what a closed account can no longer do, and how many wrong passwords the
 * confirmation puts up with before it refuses even the right one.
 */
import { acceptOrder, call, claimJob, makeRider, makeUser, ok, PASSWORD, placeHomeOrder, prisma, type Reply, unique } from './lib';

const WRONG = 'Wrong-Password-1';
const register = (email: string, password: string) => call(null, 'POST', '/auth/register', { email, password, full_name: 'Closure Check', user_type: 'customer' });
const signIn = (email: string) => call(null, 'POST', '/auth/login', { phoneOrEmail: email, otpCodeOrPassword: PASSWORD, loginMethod: 'email' });
/** The body of a close-my-account request: the word DELETE and, when given, the password. */
const closing = (password?: string) => ({ confirm: 'DELETE', ...(password === undefined ? {} : { password }) });
/** An answer in one line for a check's detail: the status, and the error code when there is one. */
const answer = (r: Reply) => (typeof r.code === 'string' ? `${r.status} ${r.code}` : String(r.status));
const rowOf = async (id?: string) => (id ? prisma.user.findUnique({ where: { id }, select: { status: true, email: true, passwordHash: true } }) : null);

export default async function accountClosure() {
  // 1. sign-up asks for a decent password, and the new customer can sign in
  const email = `chk.closure.${unique()}@nuray.test`;
  const short = await register(email, 'Abc1234'); // 7 characters
  const shortDetails = short.body.error?.details;
  // The sign-up form's own length rule answers first (VALIDATION_ERROR naming the password field); the strength rules would say TOO_SHORT. Either refuses it.
  const refusedAsShort = short.status === 400 && (short.code === 'WEAK_PASSWORD' ? shortDetails?.reason === 'TOO_SHORT' : JSON.stringify(shortDetails ?? '').includes('password'));
  ok('a 7-character password is refused at registration (400) and the answer names the password', refusedAsShort, `${answer(short)} ${JSON.stringify(shortDetails)}`);
  const reasonOf = (r: Reply) => `${r.code}/${r.body.error?.details?.reason}`;
  const common = await register(email, 'password123');
  const personal = await register(email, 'Closure-Check-9'); // built from the person's own name
  ok('a common password is refused with WEAK_PASSWORD and the reason COMMON', reasonOf(common) === 'WEAK_PASSWORD/COMMON', reasonOf(common));
  ok('one made from the person\'s own name is refused with WEAK_PASSWORD and the reason PERSONAL', reasonOf(personal) === 'WEAK_PASSWORD/PERSONAL', reasonOf(personal));
  ok('none of the refused sign-ups left an account behind', (await prisma.user.count({ where: { email } })) === 0);
  const reg = await register(email, PASSWORD);
  const firstId: string | undefined = reg.body.data?.user?.id;
  ok('a good password registers the customer', reg.status === 201 && !!firstId, answer(reg));
  const signedIn = await signIn(email);
  const token: string = signedIn.body.data?.tokens?.access_token;
  ok('the new customer can sign in', signedIn.status === 200 && !!token, answer(signedIn));
  const asNew = (method: string, path: string, body?: unknown) => call(token, method, path, body);

  // 2. what the confirmation asks for
  const unconfirmed = [await asNew('DELETE', '/users/me', {}), await asNew('DELETE', '/users/me', { confirm: 'delete', password: PASSWORD })];
  ok('closing the account without typing DELETE is refused (400), even with the right password', unconfirmed.every((r) => r.status === 400), unconfirmed.map(answer).join(', '));
  const noPassword = await asNew('DELETE', '/users/me', closing());
  ok('closing it without the password is refused with 400 PASSWORD_REQUIRED', noPassword.status === 400 && noPassword.code === 'PASSWORD_REQUIRED', answer(noPassword));
  const wrong = await asNew('DELETE', '/users/me', closing(WRONG));
  ok('a wrong password is refused with 400 INVALID_PASSWORD (a 401 would make the web app refresh and retry)', wrong.status === 400 && wrong.code === 'INVALID_PASSWORD', answer(wrong));
  ok('none of those refusals closed the account', (await rowOf(firstId))?.status === 'active');

  // 3. who may not close an account, and what blocks it
  const staff = await (await makeUser('admin')).as('DELETE', '/users/me', closing(PASSWORD));
  ok('a staff account cannot close itself (the super admin removes staff): 403 STAFF_ACCOUNT', staff.status === 403 && staff.code === 'STAFF_ACCOUNT', answer(staff));

  const job = await placeHomeOrder();
  const rider = await makeRider();
  const claimed = await claimJob(rider, (await acceptOrder(job))!);
  const riding = await rider.as('DELETE', '/users/me', closing(PASSWORD));
  ok('a rider with an active delivery is refused: 409 ACTIVE_DELIVERIES', claimed.status === 200 && riding.status === 409 && riding.code === 'ACTIVE_DELIVERIES', `claim ${answer(claimed)}; close ${answer(riding)}`);

  const waiting = await placeHomeOrder();
  const busy = await waiting.customer.as('DELETE', '/users/me', closing(PASSWORD));
  ok('a customer with an order in progress is refused: 409 OPEN_ORDERS', busy.status === 409 && busy.code === 'OPEN_ORDERS', answer(busy));
  await waiting.customer.as('POST', `/orders/${waiting.orderId}/cancel`, { reason: 'Changed my mind' });
  const freed = await waiting.customer.as('DELETE', '/users/me', closing(PASSWORD));
  ok('once that order is cancelled the same customer can close the account', freed.status === 200, answer(freed));
  ok('the order stays as a record while the customer\'s saved address goes', (await prisma.order.count({ where: { id: waiting.orderId } })) === 1 && (await prisma.userAddress.count({ where: { userId: waiting.customer.id } })) === 0);

  // 4. the happy path: closing works, and ends what it should
  const done = await asNew('DELETE', '/users/me', closing(PASSWORD));
  ok('the customer closes their account (200, status deleted)', done.status === 200 && done.body.data?.status === 'deleted', answer(done));
  const after = await asNew('GET', '/users/me');
  ok('their old token no longer works', after.status === 401 || after.status === 403, answer(after));
  const relogin = await signIn(email);
  ok('they cannot sign in again (the same answer as for an unknown account)', relogin.status === 401 && relogin.code === 'INVALID_CREDENTIALS', answer(relogin));
  const row = await rowOf(firstId);
  ok('the account row stays but holds no e-mail address and no password', row?.status === 'deleted' && row.email === null && row.passwordHash === null, row);
  const second = await register(email, PASSWORD);
  ok('the same e-mail address can be registered again, as a new account', second.status === 201 && !!second.body.data?.user?.id && second.body.data.user.id !== firstId, answer(second));

  // 5. five wrong passwords stop even the right one (a throwaway customer: the count is kept per account)
  const guesser = await makeUser('customer');
  const wrongOnes: Reply[] = [];
  let blank: Reply | undefined;
  for (let i = 0; i < 5; i++) {
    wrongOnes.push(await guesser.as('DELETE', '/users/me', closing(WRONG)));
    if (i === 1) blank = await guesser.as('DELETE', '/users/me', closing()); // no password at all is not a wrong password, so it is not counted
  }
  ok('each of the first five wrong passwords is answered 400 INVALID_PASSWORD, with a missing password in between not counted', wrongOnes.every((r) => r.status === 400 && r.code === 'INVALID_PASSWORD') && blank?.code === 'PASSWORD_REQUIRED', wrongOnes.map((r) => r.code).join(','));
  const sixth = await guesser.as('DELETE', '/users/me', closing(PASSWORD));
  ok('the sixth attempt is refused with 429 RATE_LIMITED even with the right password', sixth.status === 429 && sixth.code === 'RATE_LIMITED', answer(sixth));
  ok('and the account was not closed', (await rowOf(guesser.id))?.status === 'active');
  const emailChange = await guesser.as('PATCH', '/users/me', { email: `chk.new.${unique()}@nuray.test`, currentPassword: PASSWORD });
  ok('the same count stops the e-mail change screen too', emailChange.status === 429 && emailChange.code === 'RATE_LIMITED', answer(emailChange));
  const bystander = await (await makeUser('customer')).as('DELETE', '/users/me', closing(WRONG));
  ok('another account is not affected by it', bystander.status === 400 && bystander.code === 'INVALID_PASSWORD', answer(bystander));
}
