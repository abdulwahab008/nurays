// Jest global setup — provide env that modules validate at import time.
// utils/jwt throws if JWT_SECRET is missing or < 32 chars.
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-secret-key-for-jest-at-least-32-characters-long';
process.env.NODE_ENV = 'test';
