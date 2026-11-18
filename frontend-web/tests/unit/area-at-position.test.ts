import test from 'node:test';
import assert from 'node:assert/strict';
import { areaAtPosition } from '../../lib/utils/location-resolver.ts';
import type { Community } from '../../lib/services/community.service.ts';

const area = (name: string, lat: number, lng: number, radiusKm: number) =>
  ({ id: name, name, slug: name, city: 'Lahore', centerLatitude: lat, centerLongitude: lng, radiusKm }) as unknown as Community;
const areas = [area('DHA 9 Town', 31.442, 74.455, 3.5), area('Askari 11', 31.472, 74.453, 3.5)];

test('a phone inside an area picks it', () => {
  assert.equal(areaAtPosition(31.445, 74.456, areas)?.name, 'DHA 9 Town');
});

test('a phone in another city picks no area, not the nearest one', () => {
  assert.equal(areaAtPosition(33.6844, 73.0479, areas), null); // Islamabad
});
