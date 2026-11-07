/**
 * A server-made notification is written in its recipient's language: Urdu for someone whose profile says 'ur', English for
 * everyone else. The stored row and the live event carry the same words. Staff alerts stay English like the admin area.
 */
const mockPrisma: any = {
  notification: { create: jest.fn() },
  user: { findUnique: jest.fn() },
};
jest.mock('../src/config/database', () => ({ __esModule: true, default: mockPrisma }));

const mockEmitToUser = jest.fn();
jest.mock('../src/config/socket', () => ({ __esModule: true, default: { emitToUser: (...a: unknown[]) => mockEmitToUser(...a) } }));
jest.mock('../src/jobs/notify.jobs', () => ({ queueDelivery: jest.fn().mockResolvedValue(undefined) }));

import { notify } from '../src/services/notify.service';
import { NotificationText, notificationText } from '../src/utils/notificationText';

beforeEach(() => {
  jest.clearAllMocks();
  mockPrisma.notification.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'n1', type: data.type, title: data.title, message: data.message, actionUrl: data.actionUrl, createdAt: new Date() })
  );
});

const speaking = (languagePreference: string | null) =>
  mockPrisma.user.findUnique.mockResolvedValue({ notificationPreferences: null, profile: languagePreference ? { languagePreference } : null });

async function sent(text: NotificationText) {
  await notify({ userId: 'u1', category: 'orders', type: 'order', text });
  const stored = mockPrisma.notification.create.mock.calls[0][0].data;
  const live = mockEmitToUser.mock.calls.find((c) => c[1] === 'notification:new')![2];
  return { stored: { title: stored.title, message: stored.message }, live: { title: live.title, message: live.message } };
}

const delivered = () => notificationText('order.delivered', { orderNumber: 'FN1', pickup: false, cancelledBy: null, reason: null });

describe('the language of a notification', () => {
  it('is Urdu, in the stored row and the live event, for someone who chose Urdu', async () => {
    speaking('ur');
    const { stored, live } = await sent(delivered());
    expect(stored).toEqual({ title: 'آرڈر پہنچ گیا', message: 'آپ کا آرڈر ⁦#FN1⁩ پہنچ گیا ہے۔ مزے سے کھائیں!' });
    expect(live).toEqual(stored);
  });

  it.each([['en'], [null]])('is English for everyone else (preference %s)', async (preference) => {
    speaking(preference);
    const { stored, live } = await sent(delivered());
    expect(stored).toEqual({ title: 'Order delivered', message: 'Your order #FN1 has been delivered. Enjoy!' });
    expect(live).toEqual(stored);
  });

  it('is English for staff alerts even when the admin chose Urdu', async () => {
    speaking('ur');
    const { stored, live } = await sent(notificationText('approval.newDish', { name: 'Chicken Karahi' }));
    expect(stored).toEqual({ title: 'New dish to approve', message: '"Chicken Karahi" was added and is waiting for approval.' });
    expect(live).toEqual(stored);
  });
});

describe('reasons the apps and the server wrote themselves', () => {
  const cancelled = (cancelledBy: string, reason: string) => notificationText('order.cancelled', { orderNumber: 'FN2', pickup: false, cancelledBy, reason });

  it("translate the kitchen's chosen reason and keep the words it added", async () => {
    speaking('ur');
    const { stored } = await sent(cancelled('seller', 'Rejected by kitchen: Item unavailable: out of rice'));
    expect(stored.message).toBe('کچن آپ کا آرڈر ⁦#FN2⁩ نہیں لے سکا: ڈش دستیاب نہیں — out of rice۔ آرڈر منسوخ کر دیا گیا ہے۔');
  });

  it("translate the sweep's timeout reason", async () => {
    speaking('ur');
    const { stored } = await sent(cancelled('system', "The payment wasn't completed in time."));
    expect(stored.message).toBe('آپ کا آرڈر ⁦#FN2⁩ خود بخود منسوخ ہو گیا: ادائیگی وقت پر مکمل نہیں ہوئی۔');
  });

  it('stay in English for an English reader', async () => {
    speaking('en');
    const { stored } = await sent(cancelled('seller', 'Rejected by kitchen: Too busy / High kitchen load'));
    expect(stored.message).toBe('The kitchen could not take your order #FN2: Too busy / High kitchen load. It has been cancelled.');
  });

  it("leave a kitchen's own words as written", async () => {
    speaking('ur');
    const { stored } = await sent(cancelled('seller', 'Rejected by kitchen: ran out of gas'));
    expect(stored.message).toContain(': ran out of gas۔');
  });

  it("translate the dispute button's reason", async () => {
    speaking('ur');
    const { stored } = await sent(notificationText('payment.disputed', { orderNumber: 'FN3', reason: 'Payment transfer not found in kitchen account' }));
    expect(stored.message).toContain('"کچن کے اکاؤنٹ میں ٹرانسفر نہیں ملی"');
  });
});
