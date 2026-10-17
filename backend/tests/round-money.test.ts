import { roundMoney } from '../src/utils/pricing';

// One rounding rule for every amount of money (it used to be written out six times, one of them guarding against -0).
describe('roundMoney', () => {
  it('rounds to whole paisa', () => {
    expect(roundMoney(1234.5678)).toBe(1234.57);
    expect(roundMoney(1234.5649)).toBe(1234.56);
    expect(roundMoney(7)).toBe(7);
    expect(roundMoney(0)).toBe(0);
  });

  it('takes the float dust out of sums and products of prices', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(100.1 * 3)).toBe(300.3);
    expect(roundMoney(19.99 + 5.01 + 0.1 + 0.2)).toBe(25.3);
  });

  it('treats a negative amount the same way (an adjustment, a refund still owed)', () => {
    expect(roundMoney(-1234.5678)).toBe(-1234.57);
    expect(roundMoney(-0.1 - 0.2)).toBe(-0.3);
  });

  it('is never negative zero, which a ledger would print as "-0"', () => {
    expect(Object.is(roundMoney(-0.004), 0)).toBe(true);
    expect(Object.is(roundMoney(-0), 0)).toBe(true);
    expect(Object.is(roundMoney(0.1 + 0.2 - 0.3), 0)).toBe(true);
  });
});
