// Run with `npm test` (Node's own test runner, which reads TypeScript directly: no extra packages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeFromGeocoder, reverseGeocode } from '../../lib/geocode.ts';

const RAWALPINDI = { lat: 33.5651, lng: 73.0169 };
const COUNTRYSIDE = { lat: 27.0, lng: 70.0 };

const answer = (body: unknown, init: { ok?: boolean; status?: number } = {}) =>
  (async () => ({ ok: init.ok ?? true, status: init.status ?? 200, json: async () => body })) as unknown as typeof fetch;

test('a full answer is read field by field', () => {
  const place = placeFromGeocoder(
    {
      display_name: 'House 12, Mall Road, Saddar, Rawalpindi, Pakistan',
      address: { house_number: '12', road: 'Mall Road', suburb: 'Saddar', city: 'Rawalpindi', postcode: '46000' },
    },
    RAWALPINDI.lat,
    RAWALPINDI.lng
  );
  assert.deepEqual(place, {
    city: 'Rawalpindi',
    area: 'Saddar',
    street: 'Mall Road',
    houseNumber: '12',
    postalCode: '46000',
    displayName: 'House 12, Mall Road, Saddar, Rawalpindi, Pakistan',
    fromService: true,
  });
});

test('the area is the first of suburb, neighbourhood, quarter and residential area that the service gave', () => {
  const area = (address: Record<string, string>) => placeFromGeocoder({ address }, RAWALPINDI.lat, RAWALPINDI.lng).area;
  assert.equal(area({ suburb: 'A', neighbourhood: 'B', quarter: 'C', residential: 'D' }), 'A');
  assert.equal(area({ neighbourhood: 'B', quarter: 'C', residential: 'D' }), 'B');
  assert.equal(area({ quarter: 'C', residential: 'D' }), 'C');
  assert.equal(area({ residential: 'D' }), 'D');
  assert.equal(area({ road: 'Mall Road' }), '', 'a road is a street, not an area');
  assert.equal(placeFromGeocoder({ address: { suburb: 'Saddar' } }, RAWALPINDI.lat, RAWALPINDI.lng).street, '', 'an area is not a street');
});

test('the city is the one the map names, else the one the pin is in, else the service\'s own, never a guess', () => {
  // the map names a listed city in a wider field
  assert.equal(placeFromGeocoder({ address: { county: 'Rawalpindi District' } }, COUNTRYSIDE.lat, COUNTRYSIDE.lng).city, 'Rawalpindi');
  // it names nothing, but the pin is inside a listed city
  assert.equal(placeFromGeocoder({ address: { road: 'Mall Road' } }, RAWALPINDI.lat, RAWALPINDI.lng).city, 'Rawalpindi');
  // a real city that is not listed is kept as the map wrote it
  assert.equal(placeFromGeocoder({ address: { city: 'Bannu' } }, 32.9889, 70.6045).city, 'Bannu');
  // nothing at all, in the countryside: the person chooses
  assert.equal(placeFromGeocoder({ address: { village: 'Chak 123 GB' } }, COUNTRYSIDE.lat, COUNTRYSIDE.lng).city, '');
  // Urdu
  assert.equal(placeFromGeocoder({ address: { city: 'کراچی' } }, COUNTRYSIDE.lat, COUNTRYSIDE.lng).city, 'Karachi');
});

test('an empty address still counts as an answer, and names the city the pin is in', () => {
  const place = placeFromGeocoder({ address: {} }, RAWALPINDI.lat, RAWALPINDI.lng);
  assert.equal(place.fromService, true);
  assert.equal(place.city, 'Rawalpindi');
  assert.equal(place.area, '');
});

test('no address in the answer: only the pin\'s own city, and the answer is marked as not from the service', () => {
  for (const data of [null, undefined, {}, 'nothing', 42, { address: null }, { address: 'Rawalpindi' }]) {
    const inCity = placeFromGeocoder(data, RAWALPINDI.lat, RAWALPINDI.lng);
    assert.equal(inCity.fromService, false, JSON.stringify(data));
    assert.equal(inCity.city, 'Rawalpindi', JSON.stringify(data));
    assert.equal(inCity.area + inCity.street + inCity.houseNumber + inCity.postalCode + inCity.displayName, '', JSON.stringify(data));
    assert.equal(placeFromGeocoder(data, COUNTRYSIDE.lat, COUNTRYSIDE.lng).city, '', 'the countryside names no city');
  }
});

test('text is trimmed, and a field that is not text is ignored', () => {
  const place = placeFromGeocoder(
    { display_name: '  Mall Road, Rawalpindi  ', address: { road: '  Mall Road ', house_number: 12, postcode: null, suburb: '   ', neighbourhood: 'Saddar' } },
    RAWALPINDI.lat,
    RAWALPINDI.lng
  );
  assert.equal(place.street, 'Mall Road');
  assert.equal(place.displayName, 'Mall Road, Rawalpindi');
  assert.equal(place.houseNumber, '', 'a number is not text');
  assert.equal(place.postalCode, '');
  assert.equal(place.area, 'Saddar', 'a blank suburb is skipped');
});

test('the request carries the pin, encoded', async () => {
  let seen = '';
  const request = (async (url: string) => {
    seen = url;
    return { ok: true, status: 200, json: async () => ({ address: { city: 'Lahore' } }) };
  }) as unknown as typeof fetch;
  const place = await reverseGeocode(31.52, -74.36, request);
  assert.equal(seen, '/api/geocode/reverse?lat=31.52&lon=-74.36');
  assert.equal(place.city, 'Lahore');
  assert.equal(place.fromService, true);
});

test('when the service cannot be asked or does not answer, the pin\'s own city is the answer and nothing throws', async () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    const refused = await reverseGeocode(RAWALPINDI.lat, RAWALPINDI.lng, answer({ error: 'rate limited' }, { ok: false, status: 429 }));
    assert.equal(refused.fromService, false);
    assert.equal(refused.city, 'Rawalpindi', 'an error answer is not read as an address, even one with an address in it');

    const refusedWithAddress = await reverseGeocode(RAWALPINDI.lat, RAWALPINDI.lng, answer({ address: { city: 'Lahore' } }, { ok: false, status: 502 }));
    assert.equal(refusedWithAddress.city, 'Rawalpindi');
    assert.equal(refusedWithAddress.fromService, false);

    const down = await reverseGeocode(RAWALPINDI.lat, RAWALPINDI.lng, (async () => {
      throw new TypeError('network down');
    }) as unknown as typeof fetch);
    assert.equal(down.fromService, false);
    assert.equal(down.city, 'Rawalpindi');

    const garbled = await reverseGeocode(COUNTRYSIDE.lat, COUNTRYSIDE.lng, (async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    })) as unknown as typeof fetch);
    assert.equal(garbled.fromService, false);
    assert.equal(garbled.city, '');
  } finally {
    console.error = quiet;
  }
});
