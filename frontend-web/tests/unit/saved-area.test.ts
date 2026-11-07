import test from 'node:test';
import assert from 'node:assert/strict';
import { findSavedArea, groupAreasByCity } from '../../components/community/saved-area.ts';

const areas = [
  { id: 'a10', name: 'Askari 10', slug: 'askari-10', city: 'Lahore', sellerCount: 0 },
  { id: 'a11', name: 'Askari 11', slug: 'askari-11', city: 'Lahore', sellerCount: 1 },
  { id: 'gul', name: 'Gulshan-e-Iqbal', slug: 'gulshan-e-iqbal', city: 'Karachi', sellerCount: 5 },
  { id: 'pechs', name: 'PECHS', slug: 'pechs', city: 'Karachi', sellerCount: 2 },
];

test('the area chosen before comes back from the profile', () => {
  assert.equal(findSavedArea(areas, [{ area: 'Gulshan-e-Iqbal', city: 'Karachi' }])?.id, 'gul');
  assert.equal(findSavedArea(areas, [{ area: 'gulshan e iqbal', city: 'karachi' }])?.id, 'gul');
});

test('an area in another city is not taken for this one', () => {
  assert.equal(findSavedArea(areas, [{ area: 'PECHS', city: 'Lahore' }]), null);
});

test('the first hint that names an area wins; an address can name it by id or by a longer area', () => {
  assert.equal(findSavedArea(areas, [{ area: 'Shanti Nagar', city: 'Karachi' }, { communityId: 'pechs' }])?.id, 'pechs');
  assert.equal(findSavedArea(areas, [{ area: 'Askari 11 Phase 2', city: 'Lahore' }])?.id, 'a11');
  assert.equal(findSavedArea(areas, [{ area: 'Askari 111', city: 'Lahore' }]), null);
  assert.equal(findSavedArea(areas, [{}]), null);
});

test('the picker lists the customer’s city first, else the city with the most kitchens', () => {
  assert.deepEqual(groupAreasByCity(areas).map((g) => g.city), ['Karachi', 'Lahore']);
  assert.deepEqual(groupAreasByCity(areas, 'Lahore').map((g) => g.city), ['Lahore', 'Karachi']);
  assert.deepEqual(groupAreasByCity(areas)[0].areas.map((a) => a.id), ['gul', 'pechs']);
});
