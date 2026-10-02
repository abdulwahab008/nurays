/**
 * Notifications: preferences over defaults, one notification per event, and only the
 * channels an event is worth that the person also wants (and the server can send).
 */
import { Prisma } from '@prisma/client';

const mockPrisma: any = {
  notification: { create: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  pushSubscription: { findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockEmitToUser = jest.fn();
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { emitToUser: (...a: unknown[]) => mockEmitToUser(...a) } }));

const mockQueueDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/jobs/notify.jobs', () => ({ queueDelivery: (...a: unknown[]) => mockQueueDelivery(...a) }));

const mockSendNotification = jest.fn();
jest.mock('web-push', () => ({ __esModule: true, default: { setVapidDetails: jest.fn(), sendNotification: (...a: unknown[]) => mockSendNotification(...a) } }));

import { notify, resolvePreferences, updatePreferences } from '../src/services/notify.service';
import { sendPushToUser } from '../src/services/push.service';

const created = (over: Record<string, unknown> = {}) => ({ id: 'n1', type: 'order', title: 'T', message: 'M', actionUrl: '/orders/o1', createdAt: new Date(), ...over });

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_PUBLIC_KEY = 'BPublicKeyForTests';
  process.env.VAPID_PRIVATE_KEY = 'privateKeyForTests';
  process.env.SMS_PROVIDER = 'console';
  mockPrisma.notification.create.mockResolvedValue(created());
  mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: null });
});

afterAll(() => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  delete process.env.SMS_PROVIDER;
});

describe('preferences', () => {
  it('fill anything missing or malformed with the defaults', () => {
    const prefs = resolvePreferences({ orders: { sms: false, email: 'yes' }, junk: { push: false } });
    expect(prefs.orders).toEqual({ push: true, email: true, sms: false });
    expect(prefs.payments).toEqual({ push: true, email: true, sms: true });
    expect(prefs.deliveries.email).toBe(false);
  });

  it('are merged onto what is stored, so one screen never resets another kind', async () => {
    mockPrisma.user.findUnique
      .mockResolvedValueOnce({ notificationPreferences: { payments: { email: false } } })
      .mockResolvedValue({ userType: 'customer', email: 'a@b.c', emailVerified: true, phone: '+923001234567', phoneVerified: true, notificationPreferences: null });
    await updatePreferences('u1', { orders: { sms: false } });
    const saved = mockPrisma.user.update.mock.calls[0][0].data.notificationPreferences;
    expect(saved.orders.sms).toBe(false);
    expect(saved.payments.email).toBe(false);
  });
});

describe('notify', () => {
  it('creates the in-app notification, updates open tabs, and queues the channels the event is worth', async () => {
    const id = await notify({ userId: 'u1', category: 'orders', type: 'order', title: 'T', message: 'M', channels: ['push', 'email', 'sms'], dedupeKey: 'order:o1:new:u1' });
    expect(id).toBe('n1');
    expect(mockPrisma.notification.create.mock.calls[0][0].data.dedupeKey).toBe('order:o1:new:u1');
    expect(mockEmitToUser).toHaveBeenCalledWith('u1', 'notification:new', expect.objectContaining({ id: 'n1' }));
    expect(mockQueueDelivery.mock.calls.map((c) => c[1])).toEqual(['push', 'email', 'sms']);
  });

  it('sends nothing twice for the same event', async () => {
    mockPrisma.notification.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    expect(await notify({ userId: 'u1', category: 'orders', type: 'order', title: 'T', message: 'M', channels: ['push'], dedupeKey: 'k' })).toBeNull();
    expect(mockEmitToUser).not.toHaveBeenCalled();
    expect(mockQueueDelivery).not.toHaveBeenCalled();
  });

  it("respects what the person turned off", async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: { orders: { email: false, sms: false } } });
    await notify({ userId: 'u1', category: 'orders', type: 'order', title: 'T', message: 'M', channels: ['push', 'email', 'sms'] });
    expect(mockQueueDelivery.mock.calls.map((c) => c[1])).toEqual(['push']);
  });

  it("skips channels the server can't send (no VAPID keys, no SMS provider)", async () => {
    delete process.env.VAPID_PUBLIC_KEY;
    process.env.SMS_PROVIDER = 'none';
    await notify({ userId: 'u1', category: 'orders', type: 'order', title: 'T', message: 'M', channels: ['push', 'email', 'sms'] });
    expect(mockQueueDelivery.mock.calls.map((c) => c[1])).toEqual(['email']);
  });

  it('never throws (a notification must not fail what triggered it)', async () => {
    mockPrisma.notification.create.mockRejectedValue(new Error('database down'));
    await expect(notify({ userId: 'u1', category: 'orders', type: 'order', title: 'T', message: 'M' })).resolves.toBeNull();
  });
});

describe('push delivery', () => {
  it('sends to every device and forgets devices that unsubscribed', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValue([
      { id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' },
      { id: 's2', endpoint: 'https://push.example/2', p256dh: 'k2', auth: 'a2' },
    ]);
    mockPrisma.pushSubscription.update.mockResolvedValue({});
    mockPrisma.pushSubscription.delete.mockResolvedValue({});
    mockSendNotification.mockResolvedValueOnce({}).mockRejectedValueOnce(Object.assign(new Error('gone'), { statusCode: 410 }));
    expect(await sendPushToUser('u1', { title: 'T', body: 'B', url: '/x' })).toBe(1);
    expect(mockPrisma.pushSubscription.delete).toHaveBeenCalledWith({ where: { id: 's2' } });
    expect(JSON.parse(mockSendNotification.mock.calls[0][1])).toEqual({ title: 'T', body: 'B', url: '/x' });
  });

  it('fails (so the job retries) only when no device could be reached', async () => {
    mockPrisma.pushSubscription.findMany.mockResolvedValue([{ id: 's1', endpoint: 'https://push.example/1', p256dh: 'k1', auth: 'a1' }]);
    mockSendNotification.mockRejectedValue(Object.assign(new Error('push service down'), { statusCode: 503 }));
    await expect(sendPushToUser('u1', { title: 'T', body: 'B' })).rejects.toThrow('push service down');
  });
});
