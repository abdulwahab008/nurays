import { cashAtDoor, isCashAtDoor } from '../src/utils/paymentCustody';
import { cashToCollect } from '../src/utils/riderJobs';

// One rule for "money is still to be taken at the door", shared by the rider's cash limit, the job offer, the delivery
// that marks the order paid and a kitchen's own handover: a cash-on-delivery order that is not paid yet.
const order = (paymentMethod: string, paymentStatus: string, totalAmount: unknown = 1250) => ({ paymentMethod, paymentStatus, totalAmount });

describe('isCashAtDoor', () => {
  it('is true for cash on delivery that is not paid, whatever else its payment status says', () => {
    for (const status of ['pending', 'failed', 'payment_submitted', 'disputed']) expect(isCashAtDoor(order('cod', status))).toBe(true);
  });

  it('is false once it is paid, and for every other way of paying', () => {
    expect(isCashAtDoor(order('cod', 'paid'))).toBe(false);
    for (const method of ['wallet', 'safepay', 'card', 'jazzcash', 'easypaisa', 'bank']) {
      expect(isCashAtDoor(order(method, 'pending'))).toBe(false);
      expect(isCashAtDoor(order(method, 'paid'))).toBe(false);
    }
  });
});

describe('cashAtDoor', () => {
  it('is the order total for cash at the door, from a number or a database Decimal, and 0 otherwise', () => {
    expect(cashAtDoor(order('cod', 'pending', 1250))).toBe(1250);
    expect(cashAtDoor(order('cod', 'pending', { toString: () => '1250.00', valueOf: () => 1250 }))).toBe(1250);
    expect(cashAtDoor(order('cod', 'paid'))).toBe(0);
    expect(cashAtDoor(order('safepay', 'pending'))).toBe(0);
  });
});

describe('cashToCollect (the rider\'s jobs)', () => {
  it('adds up only the jobs that are cash at the door', () => {
    const jobs = [
      { order: order('cod', 'pending', 800) },
      { order: order('cod', 'paid', 5000) },
      { order: order('wallet', 'paid', 3000) },
      { order: order('cod', 'pending', 450) },
    ];
    expect(cashToCollect(jobs)).toBe(1250);
    expect(cashToCollect([])).toBe(0);
  });
});
