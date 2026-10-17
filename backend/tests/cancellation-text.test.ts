/**
 * The customer's notice that an order was cancelled used to say only "has been cancelled", whoever did it and why: a kitchen's
 * rejection, the system's timeout and a support person's decision all read the same. A reason is repeated only when it was
 * written for the customer to read.
 */
import { cancellationReasonForCustomer, cancelledNotice } from '../src/utils/cancellationText';

describe('why an order was cancelled, as told to the customer', () => {
  it('repeats the kitchen\'s reason without the internal prefix', () => {
    expect(cancellationReasonForCustomer('seller', 'Rejected by kitchen: Too busy / High kitchen load')).toBe('Too busy / High kitchen load');
    expect(cancellationReasonForCustomer('seller', 'Rejected by kitchen: Item unavailable: out of rice')).toBe('Item unavailable: out of rice');
  });

  it('repeats what the system wrote (a timeout)', () => {
    expect(cancellationReasonForCustomer('system', 'The kitchen did not accept the order within 30 minutes')).toBe('The kitchen did not accept the order within 30 minutes');
  });

  it('never repeats a support person\'s note or the customer\'s own words', () => {
    expect(cancellationReasonForCustomer('admin', 'Suspected fraud, see ticket 4411')).toBeNull();
    expect(cancellationReasonForCustomer('customer', 'Ordered by mistake')).toBeNull();
    expect(cancellationReasonForCustomer(null, 'something')).toBeNull();
  });

  it('has nothing to say for an empty reason', () => {
    expect(cancellationReasonForCustomer('seller', '   ')).toBeNull();
    expect(cancellationReasonForCustomer('seller', 'Rejected by kitchen:  ')).toBeNull();
    expect(cancellationReasonForCustomer('seller', undefined)).toBeNull();
  });
});

describe('the notification sentence', () => {
  it('says the kitchen could not take the order, and why', () => {
    expect(cancelledNotice('FN1', 'seller', 'Rejected by kitchen: Too busy / High kitchen load')).toBe('The kitchen could not take your order #FN1: Too busy / High kitchen load. It has been cancelled.');
  });

  it('says the system cancelled it, and why', () => {
    expect(cancelledNotice('FN2', 'system', 'The kitchen did not accept the order within 30 minutes')).toBe('Your order #FN2 was cancelled automatically: The kitchen did not accept the order within 30 minutes.');
  });

  it('keeps the plain sentence for everything else, and never leaks a support note', () => {
    expect(cancelledNotice('FN3', 'admin', 'Suspected fraud, see ticket 4411')).toBe('Your order #FN3 has been cancelled.');
    expect(cancelledNotice('FN4', 'customer', 'Ordered by mistake')).toBe('Your order #FN4 has been cancelled.');
    expect(cancelledNotice('FN5', undefined, undefined)).toBe('Your order #FN5 has been cancelled.');
  });
});
