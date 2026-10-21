/**
 * Security fixes as the outside sees them: how long a token lives, what a rider and the customer get
 * of one order, who may read a kitchen's raw variants, what logging out ends, what changing an
 * e-mail address needs, and where a password-reset link is not sent.
 */
import { call, deepKeys, login, makeKitchen, makeProduct, makeRider, makeUser, ok, PASSWORD, placeHomeOrder, acceptOrder, claimJob, prisma, sleep, unique } from './lib';

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

  // 4. logging out ends this device's session (access and refresh token, and this device's push), not the others';
  //    "sign out everywhere" ends them all (SEC-2)
  const leaver = await makeUser('customer');
  const leaverPhone = await login(leaver.email); // the same account on a second device
  const staying = await makeUser('customer');
  const device = (who: string, n: number) => ({ endpoint: `https://push.example.test/${who}/${n}`, keys: { p256dh: `p256dh-${who}-${n}-0123456789`, auth: `auth-${who}-${n}-012345` } });
  const subscribed = [
    await leaver.as('POST', '/notifications/push/subscriptions', device(leaver.id, 1)),
    await call(leaverPhone.access, 'POST', '/notifications/push/subscriptions', device(leaver.id, 2)),
    await staying.as('POST', '/notifications/push/subscriptions', device(staying.id, 1)),
  ];
  ok('two devices of one account and one of another are subscribed to push', subscribed.every((r) => r.status === 201) && (await prisma.pushSubscription.count({ where: { userId: leaver.id } })) === 2, subscribed.map((r) => r.status).join());
  const out = await leaver.as('POST', '/auth/logout', { pushEndpoint: device(leaver.id, 1).endpoint });
  ok('logout answers 200', out.status === 200, out.code);
  const leftSubs = await prisma.pushSubscription.findMany({ where: { userId: { in: [leaver.id, staying.id] } }, select: { endpoint: true } });
  ok("and only this device's push subscription is forgotten (the account's other device and the other account keep theirs)", leftSubs.map((x) => x.endpoint).sort().join() === [device(leaver.id, 2).endpoint, device(staying.id, 1).endpoint].sort().join(), leftSubs.map((x) => x.endpoint).join());
  const meAfter = await leaver.as('GET', '/auth/me');
  ok('the access token is dead at once after logout (not an hour later)', meAfter.status === 401 && meAfter.code === 'SESSION_REVOKED', meAfter.code);
  const refreshAfter = await call(null, 'POST', '/auth/refresh', { refreshToken: leaver.refresh });
  ok('and so is the refresh token', refreshAfter.status === 401 && refreshAfter.code === 'SESSION_REVOKED', refreshAfter.code);
  ok("the account's other device is still signed in", (await call(leaverPhone.access, 'GET', '/auth/me')).status === 200);
  const everywhere = await call(leaverPhone.access, 'POST', '/auth/logout-all', {});
  ok('"sign out everywhere" answers 200', everywhere.status === 200, everywhere.code);
  ok('and ends every session and forgets every push subscription of the account', (await call(leaverPhone.access, 'GET', '/auth/me')).status === 401 && (await call(null, 'POST', '/auth/refresh', { refreshToken: leaverPhone.refresh })).status === 401 && (await prisma.pushSubscription.count({ where: { userId: leaver.id } })) === 0 && (await prisma.pushSubscription.count({ where: { userId: staying.id } })) === 1);
  ok('"sign out everywhere" leaves a trail', (await prisma.auditLog.count({ where: { userId: leaver.id, action: 'auth:LOGOUT_ALL' } })) === 1);

  // 4b. refresh tokens rotate: each works once, and a copied one that comes back ends its session (SEC-2)
  const rotator = await makeUser('customer');
  const r1 = await call(null, 'POST', '/auth/refresh', { refreshToken: rotator.refresh });
  const t1 = r1.body?.data;
  ok('a refresh hands out a new access token and a new refresh token in the same session', r1.status === 200 && !!t1?.refreshToken && t1.refreshToken !== rotator.refresh && claims(t1.accessToken).sid === claims(rotator.access).sid, r1.code);
  const twin = await call(null, 'POST', '/auth/refresh', { refreshToken: rotator.refresh });
  ok('the same refresh token again within a few seconds (another tab refreshing at once) still works', twin.status === 200, twin.code);
  await prisma.refreshToken.updateMany({ where: { id: claims(rotator.refresh).jti }, data: { usedAt: new Date(Date.now() - 60_000) } }); // as if it was spent a minute ago
  const replay = await call(null, 'POST', '/auth/refresh', { refreshToken: rotator.refresh });
  ok('a spent refresh token that comes back later is refused with 401 REFRESH_TOKEN_REUSED', replay.status === 401 && replay.code === 'REFRESH_TOKEN_REUSED', replay.code);
  const afterReplay = [await call(t1?.accessToken ?? 'none', 'GET', '/auth/me'), await call(null, 'POST', '/auth/refresh', { refreshToken: t1?.refreshToken ?? 'none' })];
  ok('and the whole session ends: the newest access and refresh tokens stop working too', afterReplay.every((r) => r.status === 401), afterReplay.map((r) => r.code).join());
  ok('the reuse leaves a trail', (await prisma.auditLog.count({ where: { userId: rotator.id, action: 'auth:REFRESH_REUSE' } })) === 1);

  // 4c. the signed-in devices list (SEC-2)
  const owner2 = await makeUser('customer');
  const laptop = await login(owner2.email);
  const other = await makeUser('customer');
  const listed = await owner2.as('GET', '/auth/sessions');
  const sessions: Array<{ id: string; current: boolean; userAgent: string | null }> = listed.body?.data?.sessions ?? [];
  ok('GET /auth/sessions lists both devices, marking this one', listed.status === 200 && sessions.length === 2 && sessions.filter((x) => x.current).length === 1 && sessions.find((x) => x.current)?.id === claims(owner2.access).sid, JSON.stringify(sessions.map((x) => x.current)));
  ok('the list says nothing about tokens', !deepKeys(listed.body).has('refreshToken') && !deepKeys(listed.body).has('familyId'));
  const laptopSid = claims(laptop.access).sid;
  const notYours = await other.as('DELETE', `/auth/sessions/${laptopSid}`);
  ok("another account cannot sign out someone else's device (404)", notYours.status === 404 && notYours.code === 'SESSION_NOT_FOUND' && (await call(laptop.access, 'GET', '/auth/me')).status === 200, notYours.code);
  const ended = await owner2.as('DELETE', `/auth/sessions/${laptopSid}`);
  ok('the owner signs the laptop out from the phone (200): the laptop is out, the phone stays in', ended.status === 200 && (await call(laptop.access, 'GET', '/auth/me')).status === 401 && (await owner2.as('GET', '/auth/me')).status === 200, ended.code);
  ok('and the list shows one device now', ((await owner2.as('GET', '/auth/sessions')).body?.data?.sessions ?? []).length === 1);
  ok('the sessions list needs a signed-in account (401)', (await call(null, 'GET', '/auth/sessions')).status === 401);

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
  // The link is made by a background job: normally in a few milliseconds, but a job that fails once is retried after a pause and a
  // busy shared runner can hold it for seconds, so the wait is generous (it fails only if no link is ever made).
  for (let i = 0; i < 120 && controlRows === 0; i++) {
    controlRows = await prisma.passwordReset.count({ where: { userId: verified.id } });
    if (controlRows === 0) await sleep(250);
  }
  ok('a verified address does get a reset link', control.status === 200 && controlRows === 1, `${control.status} rows=${controlRows}`);
  ok('but the unverified one gets none', (await prisma.passwordReset.count({ where: { userId: owner.id } })) === 0);
}
