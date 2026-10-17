import bcrypt from 'bcrypt';

/**
 * Closing one's own account: who may, what blocks it, and what is scrubbed. The database is a
 * hand-written double so each rule is checked without a server.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/middleware/audit', () => ({ recordAudit: jest.fn(() => Promise.resolve()) }));
jest.mock('../src/services/rider-ledger.service', () => ({ riderMoney: jest.fn(async () => ({ balance: 0, cashHeld: 0, unpaid: 0, earned: 0, paidOut: 0 })) }));

import { deleteOwnAccount } from '../src/services/account-deletion.service';
import { recordAudit } from '../src/middleware/audit';
import { riderMoney } from '../src/services/rider-ledger.service';

const USER = 'user-1';
let hash: string;

function reset(user: Record<string, unknown>, opts: { openOrders?: number; wallet?: number | null; rider?: boolean; activeDeliveries?: number; openItems?: number; pendingPayouts?: number } = {}) {
  const tx: any = {
    userAddress: { deleteMany: jest.fn() },
    favoriteSeller: { deleteMany: jest.fn() },
    pushSubscription: { deleteMany: jest.fn() },
    passwordReset: { deleteMany: jest.fn() },
    emailVerification: { deleteMany: jest.fn() },
    cart: { findUnique: jest.fn(async () => ({ id: 'cart-1' })), delete: jest.fn() },
    userProfile: { updateMany: jest.fn() },
    riderDocument: { deleteMany: jest.fn(), findMany: jest.fn(async () => []) },
    rider: { update: jest.fn() },
    sellerDocument: { deleteMany: jest.fn(), findMany: jest.fn(async () => []) },
    product: { updateMany: jest.fn() },
    seller: { update: jest.fn() },
    user: { update: jest.fn(async (args: any) => args) },
  };
  Object.assign(db, {
    user: { findUnique: jest.fn(async () => ({ id: USER, status: 'active', userType: 'customer', passwordHash: hash, seller: null, ...user })) },
    order: { count: jest.fn(async () => opts.openOrders ?? 0) },
    wallet: { findUnique: jest.fn(async () => (opts.wallet == null ? null : { balance: opts.wallet })) },
    rider: { findUnique: jest.fn(async () => (opts.rider ? { id: 'rider-1' } : null)) },
    delivery: { count: jest.fn(async () => opts.activeDeliveries ?? 0) },
    orderItem: { count: jest.fn(async () => opts.openItems ?? 0) },
    sellerPayout: { count: jest.fn(async () => opts.pendingPayouts ?? 0) },
    $transaction: jest.fn(async (fn: (t: any) => Promise<void>) => fn(tx)),
  });
  return tx;
}

beforeAll(async () => {
  hash = await bcrypt.hash('Correct-Horse-1', 4);
});

describe('deleteOwnAccount', () => {
  it('refuses staff accounts', async () => {
    reset({ userType: 'admin' });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'STAFF_ACCOUNT', statusCode: 403 });
  });

  it('needs the password when the account has one, and checks it', async () => {
    reset({});
    await expect(deleteOwnAccount(USER)).rejects.toMatchObject({ code: 'PASSWORD_REQUIRED' });
    // 400, not 401: the web app treats a 401 as an expired session and would refresh its tokens and retry.
    await expect(deleteOwnAccount(USER, 'wrong')).rejects.toMatchObject({ code: 'INVALID_PASSWORD', statusCode: 400 });
  });

  it('stops after five wrong passwords, even for the right one, and a right one clears the count', async () => {
    reset({ id: 'user-guessed' });
    for (let i = 0; i < 4; i++) await expect(deleteOwnAccount('user-guessed', 'nope')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    // a right password in between clears the count (it then fails for another reason: an order is open)
    reset({ id: 'user-guessed' }, { openOrders: 1 });
    await expect(deleteOwnAccount('user-guessed', 'Correct-Horse-1')).rejects.toMatchObject({ code: 'OPEN_ORDERS' });
    reset({ id: 'user-guessed' });
    for (let i = 0; i < 5; i++) await expect(deleteOwnAccount('user-guessed', 'nope')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
    await expect(deleteOwnAccount('user-guessed', 'Correct-Horse-1')).rejects.toMatchObject({ code: 'RATE_LIMITED', statusCode: 429 });
    // another account is not affected
    reset({ id: 'user-other' });
    await expect(deleteOwnAccount('user-other', 'nope')).rejects.toMatchObject({ code: 'INVALID_PASSWORD' });
  });

  it('does not need a password for an OTP-only account', async () => {
    const tx = reset({ passwordHash: null });
    await expect(deleteOwnAccount(USER)).resolves.toEqual({ id: USER, status: 'deleted' });
    expect(tx.user.update).toHaveBeenCalled();
  });

  it('is blocked by an order in progress, wallet money, active deliveries, rider balance, open kitchen orders or a pending payout', async () => {
    reset({}, { openOrders: 1 });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'OPEN_ORDERS', statusCode: 409 });
    reset({}, { wallet: 250 });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'WALLET_BALANCE' });
    reset({}, { rider: true, activeDeliveries: 1 });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'ACTIVE_DELIVERIES' });
    (riderMoney as jest.Mock).mockResolvedValueOnce({ balance: 0, cashHeld: 1200, unpaid: 0, earned: 0, paidOut: 0 });
    reset({}, { rider: true });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'RIDER_BALANCE' });
    reset({ seller: { id: 'seller-1' } }, { openItems: 2 });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'OPEN_ORDERS' });
    reset({ seller: { id: 'seller-1' } }, { pendingPayouts: 1 });
    await expect(deleteOwnAccount(USER, 'Correct-Horse-1')).rejects.toMatchObject({ code: 'PENDING_PAYOUT' });
  });

  it('scrubs the person but keeps the account row, ends every session and records it', async () => {
    const tx = reset({ seller: { id: 'seller-1' } }, { rider: true, wallet: 0 });
    await deleteOwnAccount(USER, 'Correct-Horse-1');
    const data = tx.user.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ status: 'deleted', email: null, passwordHash: null, emailVerified: false, phoneVerified: false });
    expect(data.phone).toMatch(/^\+999/); // a placeholder, never shown as a real number
    expect(data.tokensValidAfter).toBeInstanceOf(Date);
    expect(tx.userAddress.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(tx.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { userId: USER } });
    expect(tx.cart.delete).toHaveBeenCalledWith({ where: { id: 'cart-1' } });
    expect(tx.userProfile.updateMany).toHaveBeenCalledWith({ where: { userId: USER }, data: { fullName: 'Deleted user', avatarUrl: null, city: null, area: null } });
    expect(tx.riderDocument.deleteMany).toHaveBeenCalledWith({ where: { riderId: 'rider-1' } });
    expect(tx.rider.update).toHaveBeenCalledWith({ where: { id: 'rider-1' }, data: expect.objectContaining({ status: 'closed', isAvailable: false, licenseNumber: null, vehicleNumber: null }) });
    expect(tx.sellerDocument.deleteMany).toHaveBeenCalledWith({ where: { sellerId: 'seller-1' } });
    expect(tx.product.updateMany).toHaveBeenCalledWith({ where: { sellerId: 'seller-1' }, data: { isActive: false } });
    expect(tx.seller.update).toHaveBeenCalledWith({ where: { id: 'seller-1' }, data: expect.objectContaining({ status: 'closed', bankAccountNumber: null, jazzcashNumber: null, easypaisaNumber: null, latitude: null, longitude: null }) });
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ userId: USER, action: 'auth:ACCOUNT_DELETED' }));
  });
});
