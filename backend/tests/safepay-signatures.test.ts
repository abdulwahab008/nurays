/**
 * Safepay's signatures: the right one passes, and nothing else does, in particular not the right one with something
 * written after it (Buffer.from(text, 'hex') stops at the first character that is not a hex digit, so it used to be accepted).
 * The controller answers a bad webhook in the standard error shape and never leaves the customer on a raw error page.
 */
import crypto from 'crypto';
import type { Request, Response } from 'express';

jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));
jest.mock('../src/config/sentry', () => ({ reportError: jest.fn() }));
const attemptByTracker = jest.fn();
const settleAttempt = jest.fn();
jest.mock('../src/services/online-payment.service', () => ({
  settleAttempt: (...a: unknown[]) => settleAttempt(...a),
  attemptByTracker: (...a: unknown[]) => attemptByTracker(...a),
  landingUrlFor: (r: { outcome: string }, ok: boolean) => `http://web.test/payment/return?result=${r.outcome}&ok=${ok}`,
  successfulTrackerFromWebhook: (b: any) => b?.data?.tracker ?? null,
  startWalletTopup: jest.fn(),
  orderPaymentStatus: jest.fn(),
  onlinePaymentsAvailable: jest.fn(),
  TOPUP_MIN: 100,
  TOPUP_MAX: 50000,
}));

import { verifySafepayReturn, verifySafepayWebhook } from '../src/gateways/safepay.gateway';
import { safepayReturn, safepayWebhook } from '../src/controllers/payment.controller';

const SECRET = 'sk_test_secret';
const HOOK = 'whsec_test_secret';
beforeAll(() => {
  process.env.SAFEPAY_SECRET_KEY = SECRET;
  process.env.SAFEPAY_WEBHOOK_SECRET = HOOK;
});
beforeEach(() => jest.clearAllMocks());

const returnSig = (tracker: string) => crypto.createHmac('sha256', SECRET).update(tracker).digest('hex');
const data = { tracker: 'track_123', state: 'TRACKER_PAID' };
const hookSig = (d: unknown = data) => crypto.createHmac('sha512', HOOK).update(Buffer.from(JSON.stringify(d))).digest('hex');

describe('the signature on the customer\'s return', () => {
  it('accepts the right one (in either case of letters, with spaces around it)', () => {
    expect(verifySafepayReturn('track_123', returnSig('track_123'))).toBe(true);
    expect(verifySafepayReturn('track_123', returnSig('track_123').toUpperCase())).toBe(true);
    expect(verifySafepayReturn('track_123', ` ${returnSig('track_123')} `)).toBe(true);
  });

  it.each([
    ['anything after it', (s: string) => `${s}, anything-at-all`],
    ['a second copy of it', (s: string) => `${s}${s}`],
    ['a non-hex tail', (s: string) => `${s}zz`],
    ['a non-hex character inside', (s: string) => `${s.slice(0, 10)}g${s.slice(11)}`],
    ['a cut-short one', (s: string) => s.slice(0, 40)],
    ['an empty one', () => ''],
  ])('refuses %s', (_name, bad) => {
    expect(verifySafepayReturn('track_123', bad(returnSig('track_123')))).toBe(false);
  });

  it('refuses the signature of another tracker', () => {
    expect(verifySafepayReturn('track_123', returnSig('track_999'))).toBe(false);
  });
});

describe('the signature on a webhook', () => {
  it('accepts the right one and refuses it with anything after it', () => {
    expect(verifySafepayWebhook({ data }, hookSig())).toBe(true);
    expect(verifySafepayWebhook({ data }, `${hookSig()}, trailing`)).toBe(false);
    expect(verifySafepayWebhook({ data: { ...data, state: 'OTHER' } }, hookSig())).toBe(false);
  });
});

const res = () => {
  const r: any = { redirect: jest.fn(), status: jest.fn(() => r), json: jest.fn() };
  return r as Response & { redirect: jest.Mock; status: jest.Mock; json: jest.Mock };
};

describe('safepayReturn', () => {
  it('sends the customer to the landing page even when the database refuses the tracker it was given', async () => {
    attemptByTracker.mockRejectedValue(new Error('invalid byte sequence for encoding "UTF8": 0x00'));
    const out = res();
    await safepayReturn({ query: { tracker: 'a\u0000b', sig: 'bad' }, body: {} } as unknown as Request, out);
    expect(out.redirect).toHaveBeenCalledWith(303, 'http://web.test/payment/return?result=unknown&ok=false');
  });

  it('settles a correctly signed return and redirects', async () => {
    settleAttempt.mockResolvedValue({ outcome: 'paid' });
    const out = res();
    await safepayReturn({ query: { tracker: 'track_123', sig: returnSig('track_123') }, body: {} } as unknown as Request, out);
    expect(settleAttempt).toHaveBeenCalledWith('track_123', 'return', null);
    expect(out.redirect).toHaveBeenCalledWith(303, 'http://web.test/payment/return?result=paid&ok=true');
  });
});

describe('safepayWebhook', () => {
  const req = (body: unknown, signature?: string) => ({ body, get: (h: string) => (h.toLowerCase() === 'x-sfpy-signature' ? signature : undefined) }) as unknown as Request;

  it('answers a bad signature with the usual error shape (a 401 AppError), not a hand-written body', async () => {
    const out = res();
    await expect(safepayWebhook(req({ data }, 'nope'), out)).rejects.toMatchObject({ statusCode: 401, code: 'INVALID_WEBHOOK_SIGNATURE' });
    expect(out.json).not.toHaveBeenCalled();
  });

  it('hands a failure to settle on to the error handler (500), so Safepay retries', async () => {
    settleAttempt.mockRejectedValue(new Error('database down'));
    await expect(safepayWebhook(req({ data }, hookSig()), res())).rejects.toThrow('database down');
  });

  it('settles a good one and answers 200', async () => {
    settleAttempt.mockResolvedValue({ outcome: 'paid' });
    const out = res();
    await safepayWebhook(req({ data }, hookSig()), out);
    expect(out.status).toHaveBeenCalledWith(200);
    expect(out.json).toHaveBeenCalledWith({ received: true, outcome: 'paid' });
  });
});
