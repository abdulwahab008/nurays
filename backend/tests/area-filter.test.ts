/**
 * Browsing an area (product.service.ts): a saved address elsewhere does not stand in for it, so a Karachi home does not
 * make Lahore kitchens look 0.5 km away.
 */
jest.mock('../src/config/database', () => ({ __esModule: true, default: {} }));
jest.mock('../src/config/socket', () => ({ __esModule: true, default: {} }));

import { inArea } from '../src/services/product.service';

const dha9Lahore = { centerLatitude: 31.442, centerLongitude: 74.455, radiusKm: 3.5 };

it('an address inside the area, or on its edge, counts; one in another city does not', () => {
  expect(inArea(31.45, 74.46, dha9Lahore)).toBe(true);
  expect(inArea(31.49, 74.455, dha9Lahore)).toBe(true); // about 5.3 km north: within 3.5 km + 2 km
  expect(inArea(24.92, 67.09, dha9Lahore)).toBe(false); // Gulshan-e-Iqbal, Karachi
});
