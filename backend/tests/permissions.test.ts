/** Staff roles: who may do what on the admin API. */
import { can, permissionForRequest, permissionsFor } from '../src/utils/permissions';

const allowed = (role: string, method: string, path: string) => can(role, permissionForRequest(method, path));

describe('the super admin', () => {
  it('may do everything, including staff, settings and corrections', () => {
    for (const [m, p] of [['POST', '/staff'], ['PATCH', '/settings'], ['POST', '/riders/r1/adjustments'], ['GET', '/audit-logs/export'], ['POST', '/orders/o1/refund'], ['GET', '/payouts']]) {
      expect(allowed('super_admin', m, p)).toBe(true);
    }
  });
});

describe('an admin', () => {
  it('runs the platform: approvals, orders, money actions, complaints, reading the audit log', () => {
    for (const [m, p] of [['POST', '/sellers/s1/approve'], ['POST', '/riders/r1/approve'], ['POST', '/products/p1/moderate'], ['POST', '/orders/o1/cancel'], ['POST', '/orders/o1/refund'], ['POST', '/refunds/f1/complete'], ['POST', '/payouts/p1/complete'], ['POST', '/riders/r1/settlements'], ['PATCH', '/riders/r1/cash-limit'], ['POST', '/support/tickets/t1/reply'], ['GET', '/audit-logs'], ['GET', '/riders/money'], ['GET', '/payouts'], ['GET', '/pending-sellers'], ['POST', '/users/u1/status']]) {
      expect(allowed('admin', m, p)).toBe(true);
    }
  });
  it('cannot manage staff, change settings, hand-correct a rider balance, or export the audit log', () => {
    for (const [m, p] of [['GET', '/staff'], ['POST', '/staff'], ['DELETE', '/staff/s1'], ['PATCH', '/settings'], ['POST', '/riders/r1/adjustments'], ['GET', '/audit-logs/export']]) {
      expect(allowed('admin', m, p)).toBe(false);
    }
  });
});

describe('a support person', () => {
  it('looks things up and handles complaints', () => {
    for (const [m, p] of [['GET', '/orders'], ['GET', '/orders/o1'], ['GET', '/users'], ['GET', '/sellers'], ['GET', '/riders'], ['GET', '/support/tickets'], ['POST', '/support/tickets/t1/reply'], ['GET', '/approvals'], ['GET', '/communities']]) {
      expect(allowed('support', m, p)).toBe(true);
    }
  });
  it('cannot move money', () => {
    for (const [m, p] of [['POST', '/orders/o1/refund'], ['POST', '/orders/o1/confirm-payment'], ['POST', '/refunds/f1/complete'], ['POST', '/payouts/p1/complete'], ['POST', '/riders/r1/settlements'], ['POST', '/riders/r1/payouts'], ['PATCH', '/riders/r1/cash-limit'], ['POST', '/riders/r1/adjustments'], ['GET', '/payouts'], ['GET', '/riders/money'], ['GET', '/riders/r1/money']]) {
      expect(allowed('support', m, p)).toBe(false);
    }
  });
  it('cannot approve, suspend, change orders or places, or read settings, analytics and the audit log', () => {
    for (const [m, p] of [['POST', '/sellers/s1/approve'], ['POST', '/riders/r1/reject'], ['POST', '/products/p1/moderate'], ['POST', '/users/u1/status'], ['POST', '/orders/o1/cancel'], ['PATCH', '/orders/o1/status'], ['POST', '/communities'], ['PATCH', '/settings'], ['GET', '/settings'], ['GET', '/analytics'], ['GET', '/audit-logs'], ['GET', '/staff']]) {
      expect(allowed('support', m, p)).toBe(false);
    }
  });
  it("cannot see applicants' ID documents (pending applications, a kitchen's file)", () => {
    expect(allowed('support', 'GET', '/pending-sellers')).toBe(false);
    expect(allowed('support', 'GET', '/pending-riders')).toBe(false);
    expect(allowed('support', 'GET', '/sellers/s1')).toBe(false);
  });
});

describe('defaults are closed', () => {
  it('a write route nobody listed needs ops.write, so support cannot use it', () => {
    expect(allowed('support', 'POST', '/some-new-thing')).toBe(false);
    expect(allowed('admin', 'POST', '/some-new-thing')).toBe(true);
  });
  it('people who are not staff have no permissions at all', () => {
    expect(permissionsFor(null)).toEqual([]);
    expect(permissionsFor('customer')).toEqual([]);
    expect(allowed('nonsense', 'GET', '/orders')).toBe(false);
  });
});
