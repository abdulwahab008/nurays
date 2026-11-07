/**
 * A kitchen's new-order alert names what its own dishes come to, not the order total: the total also holds other kitchens'
 * dishes, tax and the delivery fee.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: { order: { findUnique: jest.fn() } } }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { emitToUser: jest.fn(), emitToRole: jest.fn(), emitToRooms: jest.fn() } }));
jest.mock('../src/services/notify.service', () => ({ notify: jest.fn(), notifyMany: jest.fn() }));

import prisma from '../src/config/database';
import socketManager from '../src/config/socket';
import { notify } from '../src/services/notify.service';
import realtimeOrderService from '../src/services/realtime-order.service';

const db = prisma as any;
const item = (sellerUserId: string, name: string, totalPrice: string) => ({ quantity: 1, totalPrice, productName: name, product: { name }, seller: { userId: sellerUserId, businessName: sellerUserId } });

it("tells each kitchen its own dishes' total, in the alert and in the live event", async () => {
  db.order.findUnique.mockResolvedValue({
    id: 'o1',
    orderNumber: 'FN1',
    customerId: null,
    totalAmount: '2150',
    paymentMethod: 'cod',
    paymentStatus: 'pending',
    createdAt: new Date('2026-11-06T10:00:00Z'),
    items: [item('kitchen-a', 'Biryani', '800'), item('kitchen-a', 'Raita', '150.5'), item('kitchen-b', 'Nihari', '900')],
  });
  await realtimeOrderService.emitNewOrderNotification('o1');

  const messages = Object.fromEntries((notify as jest.Mock).mock.calls.map(([n]) => [n.userId, n.message]));
  expect(messages['kitchen-a']).toContain('Rs 950.5 of your dishes');
  expect(messages['kitchen-b']).toContain('Rs 900 of your dishes');
  expect(messages['kitchen-a']).not.toContain('2,150');

  const events = Object.fromEntries((socketManager.emitToUser as jest.Mock).mock.calls.map(([userId, , payload]) => [userId, payload]));
  expect(events['kitchen-a']).toMatchObject({ dishesTotal: 950.5, totalAmount: 2150 });
  expect(events['kitchen-b']).toMatchObject({ dishesTotal: 900 });
});
