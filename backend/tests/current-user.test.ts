import type { Request } from 'express';
import { currentUserId } from '../src/middleware/auth.middleware';

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
