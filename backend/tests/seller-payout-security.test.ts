import bcrypt from 'bcrypt';

/**
 * Customers pay straight into the accounts a kitchen saves, and the platform pays the kitchen out to the account it names in a
 * payout request. A stolen access token must not be enough to change either, so both ask for the password again (when the
 * account has one), and a number has to be one. The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/admin.service', () => ({ __esModule: true, default: { getSettingValue: jest.fn(async () => 100) } }));
jest.mock('../src/services/seller-balance.service', () => ({ computeSellerBalance: jest.fn(async () => ({ available: 5000 })) }));

import sellerService from '../src/services/seller.service';
import { requestPayoutSchema, updateSellerSchema, registerSellerSchema } from '../src/validators/seller.validator';

const IBAN = 'PK36SCBL0000001123456702';
const PASSWORD = 'Correct-Horse-1';
let hash: string;
beforeAll(async () => {
  hash = await bcrypt.hash(PASSWORD, 4);
});

/** A kitchen whose owner signs in with a password (or, with `passwordHash: null`, with a phone code or Google). */
function setup(opts: { passwordHash?: string | null; seller?: Record<string, unknown> } = {}) {
  const passwordHash = opts.passwordHash === undefined ? hash : opts.passwordHash;
  const seller = { id: 'seller-1', userId: 'owner-1', jazzcashNumber: '03001234567', jazzcashAccountTitle: 'Zainab', easypaisaNumber: null, easypaisaAccountTitle: null, bankAccountName: null, bankAccountNumber: null, bankName: null, ...opts.seller };
  const created: any[] = [];
  const tx = { $queryRaw: jest.fn(async () => []), sellerPayout: { create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'payout-1', status: 'pending', ...data }; }) } };
  Object.assign(db, {
    seller: { findUnique: jest.fn(async () => seller), update: jest.fn(async ({ data }: any) => ({ ...seller, ...data, freeDeliveryAreas: [], deliveryModes: ['delivery'], mealCategories: [], allowedPostalCodes: [] })) },
    user: { findUnique: jest.fn(async () => ({ id: 'owner-1', passwordHash })) },
    sellerPayoutSchedule: { findUnique: jest.fn(async () => null) },
    $transaction: jest.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  });
  return { seller, created, tx };
}
const saved = () => db.seller.update.mock.calls[0]?.[0]?.data as Record<string, unknown> | undefined;

describe('saving the payout accounts', () => {
  it('does not ask for the password when no payout account changes', async () => {
    setup();
    await sellerService.updateSellerProfile('owner-1', { storeNotice: 'Closed on Friday', jazzcashNumber: '0300-1234567', jazzcashAccountTitle: 'Zainab' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(saved()).toEqual({ storeNotice: 'Closed on Friday' });
  });

  it('leaves an old account that would not pass today alone when something else is saved', async () => {
    setup({ seller: { bankAccountNumber: 'PK00BANK000000', bankName: 'Old Bank' } });
    await sellerService.updateSellerProfile('owner-1', { storeNotice: 'Open', bankAccountNumber: 'PK00BANK000000', bankName: 'Old Bank' });
    expect(saved()).toEqual({ storeNotice: 'Open' });
  });

  it('asks for the password first when a payout account changes, and saves nothing', async () => {
    setup();
    await expect(sellerService.updateSellerProfile('owner-1', { jazzcashNumber: '03339998887' })).rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_REQUIRED' });
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it('refuses a wrong password with 400, not 401, and saves nothing', async () => {
    setup();
    await expect(sellerService.updateSellerProfile('owner-1', { jazzcashNumber: '03339998887', currentPassword: 'nope' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
    expect(db.seller.update).not.toHaveBeenCalled();
  });

  it('saves the change in one form with the right password, and never stores the password', async () => {
    setup();
    await sellerService.updateSellerProfile('owner-1', { jazzcashNumber: '+92 333 9998887', bankAccountNumber: 'pk36 scbl 0000 0011 2345 6702', currentPassword: PASSWORD }, { ip: '203.0.113.7' });
    expect(saved()).toEqual({ jazzcashNumber: '03339998887', bankAccountNumber: IBAN });
  });

  it('asks again to clear an account, and to change the name customers see beside it', async () => {
    setup();
    await expect(sellerService.updateSellerProfile('owner-1', { jazzcashNumber: '' })).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    await expect(sellerService.updateSellerProfile('owner-1', { jazzcashAccountTitle: 'Someone Else' })).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    await sellerService.updateSellerProfile('owner-1', { jazzcashNumber: null, currentPassword: PASSWORD });
    expect(saved()).toEqual({ jazzcashNumber: null });
  });

  it('does not ask an account that signs in without a password (a phone code, Google), which has none to give', async () => {
    setup({ passwordHash: null });
    await sellerService.updateSellerProfile('owner-1', { easypaisaNumber: '0345-1234567' });
    expect(saved()).toEqual({ easypaisaNumber: '03451234567' });
  });

  it('says what is wrong with a number before asking for the password, and saves nothing', async () => {
    setup();
    await expect(sellerService.updateSellerProfile('owner-1', { jazzcashNumber: '12345', bankAccountNumber: 'PK36SCBL0000001123456703' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      details: [expect.objectContaining({ field: 'jazzcashNumber' }), expect.objectContaining({ field: 'bankAccountNumber' })],
    });
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.seller.update).not.toHaveBeenCalled();
  });
});

describe('requesting a payout', () => {
  const request = { amount: 1500, payoutMethod: 'jazzcash', accountNumber: '03339998887' };

  it('asks for the password first, and records nothing', async () => {
    const { created } = setup();
    await expect(sellerService.requestPayout('seller-1', request)).rejects.toMatchObject({ statusCode: 400, code: 'PASSWORD_REQUIRED' });
    expect(created).toHaveLength(0);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a wrong password, and records nothing', async () => {
    const { created } = setup();
    await expect(sellerService.requestPayout('seller-1', { ...request, currentPassword: 'nope' })).rejects.toMatchObject({ statusCode: 400, code: 'INVALID_PASSWORD' });
    expect(created).toHaveLength(0);
  });

  it('records the request with the right password, and keeps the password out of it', async () => {
    const { created } = setup();
    const out = await sellerService.requestPayout('seller-1', { ...request, currentPassword: PASSWORD });
    expect(out).toMatchObject({ payoutId: 'payout-1', status: 'pending' });
    expect(created).toHaveLength(1);
    expect(JSON.stringify(created[0])).not.toContain(PASSWORD);
    expect(created[0]).toMatchObject({ amount: 1500, payoutMethod: 'jazzcash', accountDetails: { accountNumber: '03339998887' } });
  });

  it('does not ask an account that signs in without a password', async () => {
    const { created } = setup({ passwordHash: null });
    await sellerService.requestPayout('seller-1', request);
    expect(created).toHaveLength(1);
  });

  it('still refuses an amount under the minimum first, without asking for the password', async () => {
    setup();
    await expect(sellerService.requestPayout('seller-1', { ...request, amount: 50 })).rejects.toMatchObject({ code: 'MINIMUM_PAYOUT_NOT_MET' });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('what the API accepts for a payout account', () => {
  const payout = (body: Record<string, unknown>) => requestPayoutSchema.safeParse({ amount: 1500, ...body });

  it('keeps a payout request’s account in one form, by the way the money is sent', () => {
    const wallet = payout({ payoutMethod: 'easypaisa', accountNumber: '+92 345 1234567' });
    expect(wallet.success && wallet.data.accountNumber).toBe('03451234567');
    const bank = payout({ payoutMethod: 'bank_transfer', accountNumber: 'pk36 scbl 0000 0011 2345 6702', currentPassword: PASSWORD });
    expect(bank.success && bank.data).toMatchObject({ accountNumber: IBAN, currentPassword: PASSWORD });
  });

  it('refuses an account that does not suit the way the money is sent, naming the field', () => {
    for (const body of [
      { payoutMethod: 'jazzcash', accountNumber: '1' },
      { payoutMethod: 'easypaisa', accountNumber: IBAN },
      { payoutMethod: 'bank_transfer', accountNumber: '1234567' },
      { payoutMethod: 'bank_transfer', accountNumber: 'PK36SCBL0000001123456703' },
      { payoutMethod: 'jazzcash', accountNumber: 'x'.repeat(61) },
    ]) {
      const r = payout(body);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].path).toEqual(['accountNumber']);
    }
    expect(payout({ payoutMethod: 'cheque', accountNumber: '03001234567' }).success).toBe(false);
  });

  it('takes the kitchen’s numbers at sign-up in one form, and refuses ones that are not', () => {
    const ok = registerSellerSchema.safeParse({ businessName: 'Aysha Kitchen', jazzcashNumber: '0300-1234567', easypaisaNumber: '', bankAccountNumber: 'pk36 scbl 0000 0011 2345 6702' });
    expect(ok.success && ok.data).toMatchObject({ jazzcashNumber: '03001234567', easypaisaNumber: '', bankAccountNumber: IBAN });
    for (const bad of [{ jazzcashNumber: '12345' }, { easypaisaNumber: 'call me' }, { bankAccountNumber: '1234' }]) {
      expect(registerSellerSchema.safeParse({ businessName: 'Aysha Kitchen', ...bad }).success).toBe(false);
    }
  });

  it('leaves the settings page’s numbers as typed (the service checks the ones that change) and takes the password', () => {
    const r = updateSellerSchema.safeParse({ jazzcashNumber: 'PK00BANK000000', bankAccountNumber: null, currentPassword: PASSWORD });
    expect(r.success && r.data).toMatchObject({ jazzcashNumber: 'PK00BANK000000', bankAccountNumber: null, currentPassword: PASSWORD });
  });
});
