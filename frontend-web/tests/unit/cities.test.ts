// Run with `npm test` (Node's own test runner, which reads TypeScript directly: no extra packages).
import test from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, CITY_CENTRES, cityFromCoords, cityFromGeocoder } from '../../lib/cities.ts';

test('every listed city is offered once and has a middle, and is the nearest to its own middle', () => {
  assert.equal(new Set(CITIES).size, CITIES.length);
  for (const city of CITIES) {
    const { lat, lng } = CITY_CENTRES[city];
    assert.equal(cityFromCoords(lat, lng), city, city);
  }
});

test('Rawalpindi and Islamabad, which touch, are told apart by the nearer middle', () => {
  assert.equal(cityFromCoords(33.5651, 73.0169), 'Rawalpindi', 'the middle of Rawalpindi (a box over Islamabad called it Islamabad)');
  assert.equal(cityFromCoords(33.5973, 73.0479), 'Rawalpindi', 'Saddar');
  assert.equal(cityFromCoords(33.6, 73.1), 'Rawalpindi', 'Chaklala');
  assert.equal(cityFromCoords(33.5239, 73.1017), 'Rawalpindi', 'Bahria Town, Rawalpindi');
  assert.equal(cityFromCoords(33.7294, 73.0786), 'Islamabad', 'F-6');
  assert.equal(cityFromCoords(33.678, 73.012), 'Islamabad', 'G-10');
});

test('the big cities are named from anywhere in them, not only their middle', () => {
  assert.equal(cityFromCoords(24.8138, 67.0299), 'Karachi', 'Clifton');
  assert.equal(cityFromCoords(25.0, 67.2), 'Karachi', 'the far side of Karachi');
  assert.equal(cityFromCoords(31.4720, 74.4530), 'Lahore', 'Askari 11');
  assert.equal(cityFromCoords(31.4700, 74.4000), 'Lahore', 'DHA Phase 5');
});

test('a pin in the countryside is not named after a city', () => {
  assert.equal(cityFromCoords(27.0, 70.0), null);
  assert.equal(cityFromCoords(Number.NaN, 74), null);
});

test("a city is read from the map's own words, in English and Urdu", () => {
  assert.equal(cityFromGeocoder({ city: 'Rawalpindi District' }, 0, 0), 'Rawalpindi');
  assert.equal(cityFromGeocoder({ state_district: 'Islamabad Capital Territory' }, 0, 0), 'Islamabad');
  assert.equal(cityFromGeocoder({ city: 'راولپنڈی' }, 0, 0), 'Rawalpindi');
  assert.equal(cityFromGeocoder({ city: 'ضلع لاہور' }, 0, 0), 'Lahore');
  assert.equal(cityFromGeocoder({ town: 'Rahim-Yar-Khan' }, 0, 0), 'Rahim Yar Khan');
  assert.equal(cityFromGeocoder({ county: 'Dera Ghazi Khan District' }, 0, 0), 'Dera Ghazi Khan');
});

test('the city field outranks a wider area that names another city', () => {
  assert.equal(cityFromGeocoder({ city: 'Islamabad', county: 'Rawalpindi District' }, 33.68, 73.05), 'Islamabad');
  assert.equal(cityFromGeocoder({ town: 'Gulshan Town', county: 'Karachi East' }, 24.92, 67.09), 'Karachi');
});

test('a name that says nothing falls back to where the pin is, then to the map\'s own city, then to nothing', () => {
  assert.equal(cityFromGeocoder({ town: 'Gulshan Town' }, 24.92, 67.09), 'Karachi');
  assert.equal(cityFromGeocoder({}, 31.5, 74.35), 'Lahore');
  assert.equal(cityFromGeocoder({ city: 'Bannu' }, 32.99, 70.6), 'Bannu', 'a real city we do not list is kept as the map wrote it');
  assert.equal(cityFromGeocoder({ village: 'Chak 123 GB' }, 27.0, 70.0), '', 'a village is not a city');
  assert.equal(cityFromGeocoder(null, 27.0, 70.0), '', 'and never "Karachi" by default');
  assert.equal(cityFromGeocoder(undefined, Number.NaN, Number.NaN), '');
});
