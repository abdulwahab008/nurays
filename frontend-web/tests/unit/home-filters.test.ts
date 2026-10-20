import test from 'node:test';
import assert from 'node:assert/strict';
import { filterKitchens, isKitchenFilter, matchesText, parseStats, type HomeKitchen } from '../../lib/home-filters.ts';

const kitchen = (over: Partial<HomeKitchen>): HomeKitchen => ({
  id: 'k',
  name: 'K',
  chef: '',
  area: '',
  rating: null,
  ratingValue: 0,
  reviewsCount: 0,
  prepMinutes: null,
  isOpen: true,
  statusLabel: null,
  closesAt: null,
  opensAt: null,
  deal: null,
  deliveryFee: null,
  offersFreeDelivery: false,
  minOrder: null,
  cuisine: [],
  coverPhoto: null,
  avatar: null,
  badge: '',
  hasFrozen: false,
  searchText: '',
  href: '/kitchens/k',
  ...over,
});

const biryani = kitchen({ id: 'b', searchText: 'biryani house dha', ratingValue: 4.8, reviewsCount: 12, prepMinutes: 20, deal: 'Deal' });
const frozen = kitchen({ id: 'f', searchText: 'samosa stop gulberg', hasFrozen: true, offersFreeDelivery: true, ratingValue: 4.6, reviewsCount: 3 });
const slow = kitchen({ id: 's', searchText: 'karahi corner', prepMinutes: 45 });
const all = [biryani, frozen, slow];
const ids = (list: HomeKitchen[]) => list.map((k) => k.id);

test('each filter chip lets through only the kitchens it names', () => {
  assert.deepEqual(ids(filterKitchens(all, '', '', 'all')), ['b', 'f', 's']);
  // Top rated needs 4.5 and at least 5 reviews: 4.6 from 3 reviews is not enough.
  assert.deepEqual(ids(filterKitchens(all, '', '', 'top_rated')), ['b']);
  // Quick means under 30 minutes; a kitchen with no prep time set is not counted as quick.
  assert.deepEqual(ids(filterKitchens(all, '', '', 'fast')), ['b']);
  assert.deepEqual(ids(filterKitchens(all, '', '', 'free_delivery')), ['f']);
  assert.deepEqual(ids(filterKitchens(all, '', '', 'deals')), ['b']);
  assert.deepEqual(ids(filterKitchens(all, '', '', 'frozen')), ['f']);
});

test('the search box and the cuisine both narrow the list, and "frozen" finds kitchens with frozen dishes', () => {
  assert.deepEqual(ids(filterKitchens(all, '  DHA ', '', 'all')), ['b']);
  assert.deepEqual(ids(filterKitchens(all, '', 'karahi', 'all')), ['s']);
  assert.deepEqual(ids(filterKitchens(all, 'house', 'karahi', 'all')), []);
  assert.equal(matchesText(frozen, 'frozen'), true);
  assert.equal(matchesText(biryani, ''), true);
});

test('only the known filter names are filters', () => {
  assert.equal(isKitchenFilter('deals'), true);
  assert.equal(isKitchenFilter('cheapest'), false);
});

test('the platform numbers are shown only when the counts are real numbers', () => {
  assert.deepEqual(parseStats({ kitchens: 12, communities: 3, dishes: 140, reviews: 50, averageRating: 4.6 }), {
    kitchens: 12,
    communities: 3,
    dishes: 140,
    reviews: 50,
    averageRating: 4.6,
  });
  assert.equal(parseStats({ kitchens: '12', communities: 3, dishes: 1 }), null);
  assert.equal(parseStats({ kitchens: -1, communities: 3, dishes: 1 }), null);
  assert.equal(parseStats(null), null);
  assert.deepEqual(parseStats({ kitchens: 1, communities: 1, dishes: 1 }), { kitchens: 1, communities: 1, dishes: 1, reviews: 0, averageRating: null });
});
