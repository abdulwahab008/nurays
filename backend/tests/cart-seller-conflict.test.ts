/**
 * A tray holds one kitchen. Adding a dish from another kitchen is a 409 whose details name both kitchens, because the window
 * the customer sees ("Start an order from a new kitchen?") reads them; it used to say "Previous Kitchen" because the server sent
 * only a sentence. The database is a hand-written double.
 */
const db: any = {};
jest.mock('../src/config/database', () => ({ __esModule: true, default: db }));
jest.mock('../src/services/delivery-pricing.service', () => ({ getPlatformDeliveryPricing: jest.fn() }));
jest.mock('../src/services/community.service', () => ({ communityService: {} }));
jest.mock('../src/services/promotion.service', () => ({ __esModule: true, default: {} }));

import cartService from '../src/services/cart.service';

const product = { id: 'p2', sellerId: 's2', isActive: true, approvalStatus: 'approved', name: 'Zafrani Biryani', menuType: 'fixed', availableDays: [], menuDate: null, seller: { id: 's2', businessName: "Naseem's Dum Pukht" } };

function givenTray() {
  db.cart = { findUnique: jest.fn(async () => ({ id: 'c1', userId: 'u1' })), create: jest.fn() };
  db.product = { findFirst: jest.fn(async () => product) };
  db.cartItem = {
    findMany: jest.fn(async () => [{ sellerId: 's1', seller: { id: 's1', businessName: "Zainab's Tandoor Kitchen" } }]),
    deleteMany: jest.fn(async () => ({ count: 1 })),
  };
}

describe('adding a dish from another kitchen to a tray', () => {
  it('is a 409 that names the kitchen the tray is from and the kitchen of the new dish', async () => {
    givenTray();
    const err: any = await cartService.addToCart('u1', { productId: 'p2', quantity: 1 }).then(() => null, (e) => e);
    expect(err).toMatchObject({ statusCode: 409, code: 'CART_SELLER_MISMATCH' });
    expect(err.details).toEqual({
      existingSeller: { id: 's1', name: "Zainab's Tandoor Kitchen" },
      newSeller: { id: 's2', name: "Naseem's Dum Pukht" },
    });
    expect(err.message).toContain("Zainab's Tandoor Kitchen");
    expect(db.cartItem.deleteMany).not.toHaveBeenCalled();
  });
});
