import type { Request } from 'express';

const findUnique = jest.fn();
jest.mock('../src/config/database', () => ({ __esModule: true, default: { seller: { findUnique: (...args: unknown[]) => findUnique(...args) } } }));

import { currentSellerId, currentUserId } from '../src/middleware/auth.middleware';

// Controllers behind `authenticate` read the signed-in user through this: a missing user is a 401, not a TypeError (a 500).
const asRequest = (user?: unknown) => ({ user }) as unknown as Request;

describe('currentUserId', () => {
  it('is the signed-in user\'s id', () => {
    expect(currentUserId(asRequest({ userId: 'u-1', id: 'u-1', userType: 'customer' }))).toBe('u-1');
  });

  it('is a 401 AUTH_REQUIRED when nobody is signed in', () => {
    expect(() => currentUserId(asRequest(undefined))).toThrow(expect.objectContaining({ statusCode: 401, code: 'AUTH_REQUIRED' }));
  });
});

// Seller routes that must stay open to a kitchen still awaiting approval look the kitchen up through this, not through `requireSeller`.
describe('currentSellerId', () => {
  beforeEach(() => findUnique.mockReset());

  it('is the id of the kitchen that belongs to the signed-in user', async () => {
    findUnique.mockResolvedValue({ id: 's-9' });
    await expect(currentSellerId(asRequest({ userId: 'u-1', id: 'u-1', userType: 'seller' }))).resolves.toBe('s-9');
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: 'u-1' }, select: { id: true } });
  });

  it('is a 404 SELLER_NOT_FOUND for an account with no kitchen', async () => {
    findUnique.mockResolvedValue(null);
    await expect(currentSellerId(asRequest({ userId: 'u-2', id: 'u-2', userType: 'seller' }))).rejects.toMatchObject({
      statusCode: 404,
      code: 'SELLER_NOT_FOUND',
      message: 'Seller account not found',
    });
  });

  it('is a 401 AUTH_REQUIRED, without asking the database, when nobody is signed in', async () => {
    await expect(currentSellerId(asRequest(undefined))).rejects.toMatchObject({ statusCode: 401, code: 'AUTH_REQUIRED' });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
