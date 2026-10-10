/**
 * The address an order is delivered to is frozen when it is placed. One rule serves every reader: a
 * field the snapshot has is final (even an empty one), a field it lacks comes from the saved address.
 */
import { ADDRESS_FIELDS, addressAsOrdered, doorField } from '../src/utils/addressSnapshot';

const saved = { id: 'a1', userId: 'u1', label: 'Home', addressLine1: 'Plot 1, Lane 2', addressLine2: 'Lane 2', houseNumber: '99', landmark: 'Green gate', area: 'Gulshan', city: 'Karachi', postalCode: '75000', latitude: '24.9', longitude: '67.1' };
const full = { addressLine1: 'Street 5', addressLine2: null, houseNumber: null, landmark: null, area: 'Askari 11', city: 'Lahore', postalCode: '54000', latitude: 31.4, longitude: 74.4 };

describe('doorField', () => {
  it('takes every field from the snapshot once it has them, even the empty ones', () => {
    for (const key of ADDRESS_FIELDS) expect(doorField(full, saved, key)).toBe((full as Record<string, unknown>)[key]);
    expect(doorField(full, saved, 'houseNumber')).toBeNull(); // the customer left it empty: not the 99 typed in later
  });

  it('takes a field the snapshot does not have from the saved address', () => {
    const older = { addressLine1: 'Street 5', area: 'Askari 11', city: 'Lahore', postalCode: '54000' }; // placed before house number and landmark were kept
    expect(doorField(older, saved, 'houseNumber')).toBe('99');
    expect(doorField(older, saved, 'landmark')).toBe('Green gate');
    expect(doorField(older, saved, 'addressLine1')).toBe('Street 5');
  });

  it('uses the saved address for an order with no snapshot, and nothing when there is neither', () => {
    expect(doorField(null, saved, 'addressLine1')).toBe('Plot 1, Lane 2');
    expect(doorField(undefined, saved, 'city')).toBe('Karachi');
    expect(doorField(full, null, 'city')).toBe('Lahore');
    expect(doorField(null, null, 'city')).toBeUndefined();
    // not an object: treated as absent
    expect(doorField('x', saved, 'city')).toBe('Karachi');
    expect(doorField([1], saved, 'city')).toBe('Karachi');
  });
});

describe('addressAsOrdered', () => {
  it('lays the snapshot over the saved row and keeps the row\'s other fields', () => {
    expect(addressAsOrdered(full, saved)).toEqual({ id: 'a1', userId: 'u1', label: 'Home', ...full });
  });

  it('leaves the saved row as it is where the snapshot is silent', () => {
    expect(addressAsOrdered({ area: 'Askari 11' }, saved)).toEqual({ ...saved, area: 'Askari 11' });
    expect(addressAsOrdered(null, saved)).toEqual(saved);
  });

  it('is the snapshot alone when the saved address was deleted, and nothing when there is neither', () => {
    expect(addressAsOrdered(full, null)).toEqual(full);
    expect(addressAsOrdered(null, null)).toBeNull();
    expect(addressAsOrdered(undefined, undefined)).toBeNull();
  });

  it('ignores keys of the snapshot that are not address fields', () => {
    expect(addressAsOrdered({ area: 'X', somethingElse: 'y' }, null)).toEqual({ area: 'X' });
  });
});
