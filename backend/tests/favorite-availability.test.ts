/**
 * Saved kitchens: one a customer can no longer order from (suspended, not approved, or in an area Nuray has switched off)
 * is left out of the list and cannot be saved, but the saved row is kept so it comes back if the kitchen reopens.
 * The database is a hand-written double; what is under test is what each read asks for.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));

import { favoriteService } from '../src/services/favorite.service';

const available = { isVerified: true, status: 'active', verificationStatus: 'approved', NOT: { community: { is: { isActive: false } } } };

beforeEach(() => {
  db.favoriteSeller = { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), create: jest.fn(), deleteMany: jest.fn() };
  db.seller = { findFirst: jest.fn(async () => null) };
});

it('lists only saved kitchens customers can still order from, without deleting the others', async () => {
  await favoriteService.getFavorites('u1');
  expect(db.favoriteSeller.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1', seller: available });
  expect(db.favoriteSeller.deleteMany).not.toHaveBeenCalled();
});

it('refuses to save a kitchen customers cannot order from, as its page does (404)', async () => {
  await expect(favoriteService.addFavorite('u1', 's1')).rejects.toMatchObject({ statusCode: 404, code: 'SELLER_NOT_FOUND' });
  expect(db.seller.findFirst.mock.calls[0][0].where).toEqual({ id: 's1', ...available });
  expect(db.favoriteSeller.create).not.toHaveBeenCalled();
});

it('saves an available kitchen', async () => {
  db.seller.findFirst.mockResolvedValue({ id: 's1' });
  await expect(favoriteService.addFavorite('u1', 's1')).resolves.toMatchObject({ isFavorite: true });
  expect(db.favoriteSeller.create).toHaveBeenCalledWith({ data: { userId: 'u1', sellerId: 's1' } });
});
