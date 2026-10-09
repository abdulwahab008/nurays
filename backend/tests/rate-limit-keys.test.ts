import type { Request } from 'express';
import { byIpAndAccount, byTokenOrIp } from '../src/middleware/rateLimiter';
import { generateToken } from '../src/utils/jwt';

const req = (over: Partial<Request> & { headers?: Record<string, string>; body?: unknown }) =>
  ({ ip: '203.0.113.7', headers: {}, body: {}, ...over }) as unknown as Request;

describe('rate-limit keys', () => {
  it('counts a signed-in caller by account, so one mobile-network address is not one bucket', () => {
    const token = generateToken({ userId: 'user-a', userType: 'customer' } as any);
    expect(byTokenOrIp(req({ headers: { authorization: `Bearer ${token}` } }))).toBe('u:user-a');
  });

  it('falls back to the address without a token, or with a forged or expired one', () => {
    expect(byTokenOrIp(req({}))).toBe('203.0.113.7');
    expect(byTokenOrIp(req({ headers: { authorization: 'Bearer not-a-token' } }))).toBe('203.0.113.7');
  });

  it('counts login attempts per address and account together', () => {
    expect(byIpAndAccount(req({ body: { phoneOrEmail: '  Someone@Example.com ' } }))).toBe('203.0.113.7:someone@example.com');
    expect(byIpAndAccount(req({ body: { phoneOrEmail: 'other@example.com' } }))).toBe('203.0.113.7:other@example.com');
    expect(byIpAndAccount(req({ body: {} }))).toBe('203.0.113.7:');
  });
});
