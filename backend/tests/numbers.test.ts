import { finiteOrNull } from '../src/utils/numbers';

describe('finiteOrNull', () => {
  it('reads a number, a numeric string and a database Decimal', () => {
    expect(finiteOrNull(12.5)).toBe(12.5);
    expect(finiteOrNull('12.5')).toBe(12.5);
    expect(finiteOrNull({ toString: () => '31.5204', valueOf: () => 31.5204 })).toBe(31.5204);
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(-3)).toBe(-3);
  });

  it('is null for what is not there or not a number, so a missing place or fee never becomes 0 or NaN', () => {
    for (const value of [null, undefined, 'abc', NaN, Infinity, -Infinity, {}, [1, 2]]) expect(finiteOrNull(value)).toBeNull();
  });
});
