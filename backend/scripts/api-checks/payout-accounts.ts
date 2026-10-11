/**
 * Customers pay straight into the accounts a kitchen saves, and the platform pays a kitchen out to the account it names in a
 * payout request. As the outside sees it: a number has to be a real one, a change to the saved accounts or a payout request
 * asks for the password again (so a stolen access token cannot re-point the money), a wrong password is a 400 (a 401 would
 * make the web app refresh its session and retry), and saving something unrelated never trips over an account.
 */
import { call, makeKitchen, ok, PASSWORD, prisma, Reply } from './lib';

const said = (r: Reply) => `${r.status} ${r.code}`;
const IBAN = 'PK36SCBL0000001123456702';

export default async function payoutAccounts() {
  const kitchen = await makeKitchen();
  const me = kitchen.owner;
  const stored = () => prisma.seller.findUniqueOrThrow({ where: { id: kitchen.sellerId }, select: { jazzcashNumber: true, easypaisaNumber: true, bankAccountNumber: true, jazzcashAccountTitle: true, storeNotice: true } });

  // 1. saving the accounts
  const unasked = await me.as('PATCH', '/sellers/me', { jazzcashNumber: '0300-1234567' });
  ok('changing a payout account without the password is refused with 400 PASSWORD_REQUIRED', unasked.status === 400 && unasked.code === 'PASSWORD_REQUIRED', said(unasked));
  ok('and nothing was saved', (await stored()).jazzcashNumber === null);

  const wrong = await me.as('PATCH', '/sellers/me', { jazzcashNumber: '0300-1234567', currentPassword: 'not-the-password' });
  ok('a wrong password is refused with 400 INVALID_PASSWORD, not 401', wrong.status === 400 && wrong.code === 'INVALID_PASSWORD', said(wrong));
  ok('and nothing was saved', (await stored()).jazzcashNumber === null);

  const set = await me.as('PATCH', '/sellers/me', { jazzcashNumber: '+92 300 1234567', jazzcashAccountTitle: 'Zainab Bukhari', bankAccountNumber: 'pk36 scbl 0000 0011 2345 6702', currentPassword: PASSWORD });
  const row = await stored();
  ok('with the right password the accounts are saved (200), each in one form', set.status === 200 && row.jazzcashNumber === '03001234567' && row.bankAccountNumber === IBAN && row.jazzcashAccountTitle === 'Zainab Bukhari', `${said(set)} ${JSON.stringify(row)}`);
  ok('the answer never carries the password back', !JSON.stringify(set.body).includes(PASSWORD), '');

  const sameAgain = await me.as('PATCH', '/sellers/me', { storeNotice: 'Closed on Friday', jazzcashNumber: '0300 123 4567', bankAccountNumber: IBAN, jazzcashAccountTitle: 'Zainab Bukhari' });
  ok('saving something else, with the accounts sent back as they are, asks for no password (200)', sameAgain.status === 200 && (await stored()).storeNotice === 'Closed on Friday', said(sameAgain));

  const title = await me.as('PATCH', '/sellers/me', { jazzcashAccountTitle: 'Somebody Else' });
  ok('changing the name shown beside an account asks for the password too', title.status === 400 && title.code === 'PASSWORD_REQUIRED', said(title));

  const cleared = await me.as('PATCH', '/sellers/me', { easypaisaNumber: '', jazzcashNumber: '', currentPassword: PASSWORD });
  const afterClear = await stored();
  ok('clearing an account is a change too, and with the password it clears (null)', cleared.status === 200 && afterClear.jazzcashNumber === null, `${said(cleared)} ${JSON.stringify(afterClear)}`);

  // 2. a number has to be one
  const bads: Array<[string, Record<string, unknown>, string]> = [
    ['a JazzCash number that is not a mobile number', { jazzcashNumber: '12345' }, 'jazzcashNumber'],
    ['an EasyPaisa number with letters', { easypaisaNumber: 'call me' }, 'easypaisaNumber'],
    ['an IBAN with a mistyped digit', { bankAccountNumber: 'PK36SCBL0000001123456703' }, 'bankAccountNumber'],
    ['a bank account number that is too short', { bankAccountNumber: '1234' }, 'bankAccountNumber'],
  ];
  for (const [what, body, field] of bads) {
    const r = await me.as('PATCH', '/sellers/me', { ...body, currentPassword: PASSWORD });
    const named = (r.body?.error?.details ?? []).some((d: { field?: string }) => d.field === field);
    ok(`${what} is refused with 400 VALIDATION_ERROR naming ${field}`, r.status === 400 && r.code === 'VALIDATION_ERROR' && named, `${said(r)} ${JSON.stringify(r.body?.error?.details ?? '')}`);
  }
  const untouched = await stored();
  ok('and none of them was saved', untouched.easypaisaNumber === null && untouched.jazzcashNumber === null, JSON.stringify(untouched));

  // 3. an old value that would not pass today is not re-checked when something else is saved
  await prisma.seller.update({ where: { id: kitchen.sellerId }, data: { bankAccountNumber: 'PK00BANK000000' } });
  const legacy = await me.as('PATCH', '/sellers/me', { storeNotice: 'Open again', bankAccountNumber: 'PK00BANK000000' });
  ok('an account saved before the numbers were checked does not block saving anything else (200)', legacy.status === 200 && (await stored()).bankAccountNumber === 'PK00BANK000000', said(legacy));

  // 4. payout requests
  const request = (extra: Record<string, unknown> = {}) => me.as('POST', '/sellers/me/payouts', { amount: 1500, payoutMethod: 'jazzcash', accountNumber: '0333-9998887', ...extra });
  const payoutsBefore = await prisma.sellerPayout.count({ where: { sellerId: kitchen.sellerId } });
  const noPassword = await request();
  ok('a payout request without the password is refused with 400 PASSWORD_REQUIRED', noPassword.status === 400 && noPassword.code === 'PASSWORD_REQUIRED', said(noPassword));
  const wrongPassword = await request({ currentPassword: 'not-the-password' });
  ok('with a wrong password, 400 INVALID_PASSWORD', wrongPassword.status === 400 && wrongPassword.code === 'INVALID_PASSWORD', said(wrongPassword));
  const badAccounts = [await request({ currentPassword: PASSWORD, accountNumber: '1' }), await request({ currentPassword: PASSWORD, payoutMethod: 'bank_transfer', accountNumber: '1' }), await request({ currentPassword: PASSWORD, payoutMethod: 'easypaisa', accountNumber: IBAN })];
  ok('an account that does not suit the way the money is sent is refused with 400 VALIDATION_ERROR', badAccounts.every((r) => r.status === 400 && r.code === 'VALIDATION_ERROR'), badAccounts.map(said).join(', '));
  const noBalance = await request({ currentPassword: PASSWORD });
  ok('with the right password and a good account the request reaches the balance check (400 INSUFFICIENT_BALANCE: this kitchen has earned nothing)', noBalance.status === 400 && noBalance.code === 'INSUFFICIENT_BALANCE', said(noBalance));
  ok('and none of these recorded a payout request', (await prisma.sellerPayout.count({ where: { sellerId: kitchen.sellerId } })) === payoutsBefore, '');

  // 5. an account that signs in without a password (a phone code, Google) has none to give
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: null } });
  const phoneOnly = await me.as('PATCH', '/sellers/me', { easypaisaNumber: '0345-1234567' });
  ok('an account with no password is not asked for one (200)', phoneOnly.status === 200 && (await stored()).easypaisaNumber === '03451234567', said(phoneOnly));
  const phoneOnlyPayout = await request();
  ok('nor for a payout request (it reaches the balance check)', phoneOnlyPayout.status === 400 && phoneOnlyPayout.code === 'INSUFFICIENT_BALANCE', said(phoneOnlyPayout));

  // 6. nobody else's token changes these
  const stranger = await call(null, 'PATCH', '/sellers/me', { jazzcashNumber: '0300-1234567', currentPassword: PASSWORD });
  ok('without signing in, 401', stranger.status === 401, said(stranger));
}
