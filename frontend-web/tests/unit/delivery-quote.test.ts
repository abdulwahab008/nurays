import test from 'node:test';
import assert from 'node:assert/strict';
import { kitchensForArea, quoteOf, quoteParams, type QuotedSeller } from '../../components/marketplace/delivery-quote.ts';

const kitchen = (id: string, area: string, deliverable: boolean | null): QuotedSeller =>
  ({
    id,
    community: { id: area, name: area, slug: area, city: 'Karachi', deliveryBaseFee: 50 },
    delivery:
      deliverable == null
        ? null
        : { deliverable, fee: 50, distanceKm: null, reason: null, estimatedMinMinutes: 40, estimatedMaxMinutes: 65 },
  }) as unknown as QuotedSeller;

test('with an area: its own kitchens first, then the others that deliver there; the rest are left out', () => {
  const list = [kitchen('lahore', 'askari', false), kitchen('pechs', 'pechs', true), kitchen('gul', 'gulshan', true)];
  assert.deepEqual(kitchensForArea(list, 'gulshan').map((k) => k.id), ['gul', 'pechs']);
});

test('without an area the list is unchanged and nothing is quoted', () => {
  const list = [kitchen('a', 'x', null), kitchen('b', 'y', null)];
  assert.deepEqual(kitchensForArea(list, null).map((k) => k.id), ['a', 'b']);
  assert.deepEqual(quoteParams(null), {});
  assert.deepEqual(quoteParams('gulshan'), { customerCommunityId: 'gulshan' });
});

test('a quote is only given for a kitchen that delivers', () => {
  assert.deepEqual(quoteOf(kitchen('a', 'x', true).delivery), { fee: 50, min: 40, max: 65 });
  assert.equal(quoteOf(kitchen('a', 'x', false).delivery), null);
  assert.equal(quoteOf(null), null);
});
