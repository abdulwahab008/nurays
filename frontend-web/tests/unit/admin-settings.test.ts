import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSettingsForm, type SettingsForm } from '../../lib/admin-settings.ts';

const GOOD: SettingsForm = {
  platformName: 'Nuray',
  supportEmail: 'help@nuray.pk',
  supportPhone: '+92 300 1234567',
  commissionRate: '15',
  minPayoutAmount: '1000',
  deliveryPerKm: '20',
  deliveryIncludedKm: '3',
  deliveryMaxKm: '20',
  deliveryFallbackFee: '150',
};

const refused = (over: Partial<SettingsForm>) => {
  const result = checkSettingsForm({ ...GOOD, ...over });
  assert.equal(result.ok, false);
  return result.ok ? null : result;
};

test('a form that is right is sent with every number as a number, text trimmed', () => {
  const result = checkSettingsForm({ ...GOOD, platformName: '  Nuray  ', commissionRate: '12.5' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.body.platformName, 'Nuray');
    assert.equal(result.body.commissionRate, 12.5);
    assert.equal(result.body.deliveryMaxKm, 20);
  }
});

test('a box left empty is refused by name, never sent as 0', () => {
  for (const key of ['commissionRate', 'minPayoutAmount', 'deliveryPerKm', 'deliveryIncludedKm', 'deliveryMaxKm', 'deliveryFallbackFee'] as const) {
    for (const blank of ['', '   ']) {
      const result = refused({ [key]: blank });
      assert.equal(result?.field, key);
      assert.match(result?.message ?? '', /can't be empty/);
    }
  }
  assert.equal(refused({ platformName: ' ' })?.field, 'platformName');
  assert.equal(refused({ supportPhone: '' })?.field, 'supportPhone');
});

test('a number outside what the API accepts is refused with the range', () => {
  assert.equal(refused({ commissionRate: '101' })?.message, 'Commission rate must be a number from 0 to 100.');
  assert.equal(refused({ commissionRate: '-1' })?.field, 'commissionRate');
  assert.equal(refused({ deliveryMaxKm: '0' })?.message, 'Farthest a Nuray rider delivers must be a number from 1 to 200.');
  assert.equal(refused({ minPayoutAmount: '10000001' })?.field, 'minPayoutAmount');
  assert.equal(refused({ deliveryFallbackFee: '5001' })?.field, 'deliveryFallbackFee');
});

test('words, infinity and not-a-number are not numbers', () => {
  for (const typed of ['abc', 'Infinity', 'NaN', '1e999', '12px']) {
    assert.equal(refused({ commissionRate: typed })?.field, 'commissionRate', typed);
  }
});

test('the bounds themselves are accepted', () => {
  const edge = checkSettingsForm({ ...GOOD, commissionRate: '0', deliveryMaxKm: '1', minPayoutAmount: '10000000', deliveryPerKm: '1000', deliveryIncludedKm: '100', deliveryFallbackFee: '5000' });
  assert.equal(edge.ok, true);
});

test('an e-mail address that is not one is refused', () => {
  for (const email of ['help', 'help@', '@nuray.pk', 'a b@nuray.pk']) assert.equal(refused({ supportEmail: email })?.field, 'supportEmail', email);
});
