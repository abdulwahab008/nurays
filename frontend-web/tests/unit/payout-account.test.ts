import test from 'node:test';
import assert from 'node:assert/strict';
import { bankAccountIsWrong, normalizeBankAccount, normalizeWalletNumber, payoutDestinationIsWrong, walletNumberIsWrong } from '../../lib/payout-account.ts';

// The same cases the API's own tests use (backend/tests/payout-account.test.ts): the form and the server must agree on what a number is.
const IBAN = 'PK36SCBL0000001123456702';

test('a mobile wallet number is read in every way it is written in Pakistan', () => {
  for (const typed of ['03001234567', '0300-1234567', '0300 123 4567', '+923001234567', '+92 300 1234567', '923001234567', '00923001234567', '(0300) 1234567', '  03001234567  ']) {
    assert.equal(normalizeWalletNumber(typed), '03001234567', typed);
  }
});

test('a number that is not a Pakistani mobile number is refused', () => {
  for (const typed of ['', '0300123456', '030012345678', '02001234567', '+913001234567', '0300-ABCDEFG', '0300 1234567 ext 4', IBAN, '3001234567']) {
    assert.equal(normalizeWalletNumber(typed), null, typed);
  }
});

test('an IBAN is accepted when its check digits hold, however it is spaced or cased', () => {
  assert.equal(normalizeBankAccount(IBAN), IBAN);
  assert.equal(normalizeBankAccount('pk36 scbl 0000 0011 2345 6702'), IBAN);
  assert.equal(normalizeBankAccount('PK36-SCBL-0000-0011-2345-6702'), IBAN);
});

test('an IBAN with a mistyped digit, the wrong length or the wrong shape is refused', () => {
  for (const typed of ['PK36SCBL0000001123456703', 'PK36SCBL000000112345670', 'PK36SCBL00000011234567022', 'PK36S1BL0000001123456702', 'PK00HABB0000000000000000', 'GB82WEST12345698765432']) {
    assert.equal(normalizeBankAccount(typed), null, typed);
  }
});

test('a local account number is 8 to 20 digits', () => {
  assert.equal(normalizeBankAccount('12345678'), '12345678');
  assert.equal(normalizeBankAccount('0123-4567-8901-2345'), '0123456789012345');
  for (const typed of ['', '1234567', '123456789012345678901', '1234abcd5678', 'account']) assert.equal(normalizeBankAccount(typed), null, typed);
});

test('a blank number means none, and is not wrong in a form that can leave it empty', () => {
  assert.equal(walletNumberIsWrong(''), false);
  assert.equal(walletNumberIsWrong('   '), false);
  assert.equal(bankAccountIsWrong(''), false);
  assert.equal(walletNumberIsWrong('12345'), true);
  assert.equal(walletNumberIsWrong('0300-1234567'), false);
  assert.equal(bankAccountIsWrong('PK36SCBL0000001123456703'), true);
  assert.equal(bankAccountIsWrong(IBAN), false);
});

test('a payout request needs an account that suits the way the money is sent, and a blank one does not', () => {
  assert.equal(payoutDestinationIsWrong('jazzcash', '+92 300 1234567'), false);
  assert.equal(payoutDestinationIsWrong('easypaisa', '0345-1234567'), false);
  assert.equal(payoutDestinationIsWrong('bank_transfer', IBAN), false);
  assert.equal(payoutDestinationIsWrong('bank_transfer', '03001234567'), false);
  assert.equal(payoutDestinationIsWrong('jazzcash', IBAN), true);
  assert.equal(payoutDestinationIsWrong('bank_transfer', '1'), true);
  assert.equal(payoutDestinationIsWrong('jazzcash', ''), true);
});
