/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // Test files live under tests/ (mirrors src/) or alongside as *.test.ts
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  clearMocks: true,
  // A test env needs JWT_SECRET (utils/jwt validates it at import time).
  setupFiles: ['<rootDir>/tests/setup.ts'],
};
