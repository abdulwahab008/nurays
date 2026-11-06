import test from 'node:test';
import assert from 'node:assert/strict';
import { longEnough, usesPersonalDetails } from '../../app/register/password-hints.ts';

test('length counts characters as a person does', () => {
  assert.equal(longEnough('1234567'), false);
  assert.equal(longEnough('12345678'), true);
});

test('a password made from the person’s own details is caught before the server refuses it', () => {
  const owner = { name: 'Audit Discovery', email: 'audit.disc@nuray.test', phone: '+923001234567' };
  assert.equal(usesPersonalDetails('AuditPass123!', owner), true);
  assert.equal(usesPersonalDetails('x-3001234567-y', owner), true);
  assert.equal(usesPersonalDetails('Nuray-Secret-99', {}), true);
  assert.equal(usesPersonalDetails('purple-giraffe-42', owner), false);
  assert.equal(usesPersonalDetails('', owner), false);
});
