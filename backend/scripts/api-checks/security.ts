/**
 * Security fixes as the outside sees them: how long a token lives, what a rider and the customer get
 * of one order, who may read a kitchen's raw variants, what logging out ends, what changing an
 * e-mail address needs, and where a password-reset link is not sent.
 */
import { call, deepKeys, makeKitchen, makeProduct, makeRider, makeUser, ok, PASSWORD, placeHomeOrder, acceptOrder, claimJob, prisma, sleep, unique } from './lib';

const claims = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

export default async function security() {
  // 1. access tokens are short-lived
  const someone = await makeUser('customer');
  const c = claims(someone.access);
  ok('access tokens expire after one hour', c.exp - c.iat === 3600, c.exp - c.iat);

  // 2. a rider sees no payment-submission details on its order, the customer keeps theirs
  const placed = await placeHomeOrder();
  const paid = {
    paymentReferenceNumber: `TX-${unique()}`,
    paymentSenderName: `Sender ${unique()}`,
    paymentSenderAccount: '03001234567',
    paymentNotes: `note ${unique()}`,
    paymentTransactionId: `gw-${unique()}`,
  };
  await prisma.order.update({ where: { id: placed.orderId }, data: paid });
  const deliveryId = await acceptOrder(placed);
  const rider = await makeRider();
  await claimJob(rider, deliveryId!);

  const riderView = await rider.as('GET', `/orders/${placed.orderId}`);
  const riderKeys = deepKeys(riderView.body.data);
  const leaked = ['paymentReferenceNumber', 'paymentSenderName', 'paymentSenderAccount', 'paymentNotes', 'paymentDisputeReason', 'paymentTransactionId', 'idempotencyKey', 'deliveryFeeBreakdown', 'sellerDeliveryCharge'].filter((k) => riderKeys.has(k));
  ok('the rider can still open its order', riderView.status === 200, riderView.code);
  ok('but gets none of the bank-transfer details, fee breakdown or internal keys', leaked.length === 0, leaked.join(','));
  ok('and none of their values anywhere in the answer', !Object.values(paid).some((v) => JSON.stringify(riderView.body).includes(v)));
  ok('and no receipt link or address-owner id', riderView.body.data?.paymentProofUrl == null && !riderKeys.has('userId'));
  ok('what it needs is still there: total, payment method, address, delivery', ['totalAmount', 'paymentMethod', 'paymentStatus', 'deliveryAddress', 'delivery'].every((k) => k in (riderView.body.data ?? {})));

  const customerView = await placed.customer.as('GET', `/orders/${placed.orderId}`);
  ok('the customer still sees their own full order, payment fields included', customerView.status === 200 && customerView.body.data?.paymentReferenceNumber === paid.paymentReferenceNumber, customerView.code);

  // 3. variants are private to the kitchen
  const kitchen = await makeKitchen();
  const productId = await makeProduct(kitchen.sellerId);
  const asCustomer = await someone.as('GET', `/product-variants/product/${productId}`);
  ok("a customer cannot read a kitchen's raw variants (cost prices)", asCustomer.status === 403, asCustomer.code);
  const asOwner = await kitchen.owner.as('GET', `/product-variants/product/${productId}`);
  ok('the kitchen itself still can', asOwner.status === 200, asOwner.code);

  // 4. logging out ends the session: access token and refresh token, and no device goes on receiving the account's push notifications
  const leaver = await makeUser('customer');
  const staying = await makeUser('customer');
  const device = (who: string, n: number) => ({ endpoint: `https://push.example.test/${who}/${n}`, keys: { p256dh: `p256dh-${who}-${n}-0123456789`, auth: `auth-${who}-${n}-012345` } });
  const subscribed = [];
  for (const sub of [device(leaver.id, 1), device(leaver.id, 2)]) subscribed.push(await leaver.as('POST', '/notifications/push/subscriptions', sub));
  subscribed.push(await staying.as('POST', '/notifications/push/subscriptions', device(staying.id, 1)));
  ok('two devices of one account and one of another are subscribed to push', subscribed.every((r) => r.status === 201) && (await prisma.pushSubscription.count({ where: { userId: leaver.id } })) === 2, subscribed.map((r) => r.status).join());
  await sleep(1100); // tokens are dated to the second; the logout must come after
  const out = await leaver.as('POST', '/auth/logout', {});
  ok('logout answers 200', out.status === 200, out.code);
  ok("and the account's push subscriptions are forgotten, on every device (nobody is signed in on any of them any more), the other account's are not", (await prisma.pushSubscription.count({ where: { userId: leaver.id } })) === 0 && (await prisma.pushSubscription.count({ where: { userId: staying.id } })) === 1);
  const meAfter = await leaver.as('GET', '/auth/me');
  ok('the access token is dead after logout', meAfter.status === 401 || meAfter.status === 403, meAfter.code);
  const refreshAfter = await call(null, 'POST', '/auth/refresh', { refreshToken: leaver.refresh });
  ok('and so is the refresh token', refreshAfter.status === 401, refreshAfter.code);

  // 5. changing the e-mail address needs the password
  const owner = await makeUser('customer');
  const newEmail = `chk.new.${unique()}@nuray.test`;
  const noPassword = await owner.as('PATCH', '/users/me', { email: newEmail });
  ok('an e-mail change with only the token is refused (PASSWORD_REQUIRED)', noPassword.status === 400 && noPassword.code === 'PASSWORD_REQUIRED', noPassword.code);
  const wrongPassword = await owner.as('PATCH', '/users/me', { email: newEmail, currentPassword: 'Nope-Nope-1' });
  ok('a wrong password is refused with 400 INVALID_PASSWORD (a 401 would make the web app refresh and retry)', wrongPassword.status === 400 && wrongPassword.code === 'INVALID_PASSWORD', `${wrongPassword.status} ${wrongPassword.code}`);
  const changed = await owner.as('PATCH', '/users/me', { email: newEmail, currentPassword: PASSWORD });
  const row = await prisma.user.findUnique({ where: { id: owner.id }, select: { email: true, emailVerified: true } });
  ok('the right password changes it, unverified until confirmed', changed.status === 200 && row?.email === newEmail && row.emailVerified === false, changed.code);
  const renamed = await owner.as('PATCH', '/users/me', { fullName: 'Check Renamed' });
  ok('editing the name alone needs no password', renamed.status === 200, renamed.code);

  // 6. a password-reset link is never sent to an unverified address
  const stranger = await call(null, 'POST', '/auth/forgot-password', { email: newEmail });
  ok('forgot-password still answers 200 for it (no way to tell which addresses exist)', stranger.status === 200, stranger.code);
  // The positive control: a verified address does get a link, so waiting for none to appear means something.
  const verified = await makeUser('customer');
  const control = await call(null, 'POST', '/auth/forgot-password', { email: verified.email });
  let controlRows = 0;
  for (let i = 0; i < 40 && controlRows === 0; i++) {
    controlRows = await prisma.passwordReset.count({ where: { userId: verified.id } });
    if (controlRows === 0) await sleep(250);
  }
  ok('a verified address does get a reset link', control.status === 200 && controlRows === 1, `${control.status} rows=${controlRows}`);
  ok('but the unverified one gets none', (await prisma.passwordReset.count({ where: { userId: owner.id } })) === 0);
}
