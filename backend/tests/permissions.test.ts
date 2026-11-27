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
    for (const [m, p] of [['POST', '/sellers/s1/approve'], ['POST', '/riders/r1/approve'], ['POST', '/products/p1/moderate'], ['POST', '/orders/o1/cancel'], ['POST', '/orders/o1/refund'], ['POST', '/refunds/f1/complete'], ['POST', '/payouts/p1/complete'], ['POST', '/riders/r1/settlements'], ['PATCH', '/riders/r1/cash-limit'], ['POST', '/support/tickets/t1/reply'], ['GET', '/audit-logs'], ['GET', '/riders/money'], ['GET', '/payouts'], ['GET', '/pending-sellers'], ['POST', '/users/u1/status'], ['GET', '/reviews'], ['POST', '/reviews/r1/hide']]) {
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
  it('looks things up and handles complaints and reported reviews', () => {
    for (const [m, p] of [['GET', '/orders'], ['GET', '/orders/o1'], ['GET', '/users'], ['GET', '/sellers'], ['GET', '/riders'], ['GET', '/support/tickets'], ['POST', '/support/tickets/t1/reply'], ['GET', '/approvals'], ['GET', '/communities'], ['GET', '/reviews'], ['POST', '/reviews/r1/hide'], ['POST', '/reviews/r1/keep'], ['POST', '/reviews/r1/restore']]) {
      expect(allowed('support', m, p)).toBe(true);
    }
  });
  it('cannot move money', () => {
    for (const [m, p] of [['POST', '/orders/o1/refund'], ['POST', '/orders/o1/confirm-payment'], ['POST', '/refunds/f1/complete'], ['POST', '/payouts/p1/complete'], ['POST', '/riders/r1/settlements'], ['POST', '/riders/r1/payouts'], ['PATCH', '/riders/r1/cash-limit'], ['POST', '/riders/r1/adjustments'], ['GET', '/payouts'], ['GET', '/riders/money'], ['GET', '/riders/r1/money']]) {
      expect(allowed('support', m, p)).toBe(false);
    }
  });
  it('cannot approve, suspend, change orders or places, or read settings, analytics and the audit log', () => {
    for (const [m, p] of [['POST', '/sellers/s1/approve'], ['POST', '/riders/r1/reject'], ['POST', '/products/p1/moderate'], ['POST', '/users/u1/status'], ['POST', '/orders/o1/cancel'], ['PATCH', '/orders/o1/status'], ['POST', '/communities'], ['PATCH', '/settings'], ['GET', '/settings'], ['GET', '/analytics'], ['GET', '/audit-logs'], ['GET', '/staff'], ['GET', '/refunds'], ['GET', '/refunds/']]) {
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
    // the review rules name hide, keep and restore and nothing else under /reviews
    expect(allowed('support', 'POST', '/reviews/r1/delete')).toBe(false);
    expect(allowed('support', 'POST', '/reviews/r1/hide/extra')).toBe(false);
    expect(allowed('admin', 'POST', '/some-new-thing')).toBe(true);
  });
  it('people who are not staff have no permissions at all', () => {
    expect(permissionsFor(null)).toEqual([]);
    expect(permissionsFor('customer')).toEqual([]);
    expect(allowed('nonsense', 'GET', '/orders')).toBe(false);
  });
});

describe('a path written the way the router still accepts it', () => {
  it('needs the same permission whatever its letter case, trailing slash or repeated slashes', () => {
    for (const path of ['/STAFF', '/staff/', '/Staff/abc/two-factor', '//staff', '/%73taff']) {
      expect(permissionForRequest('POST', path)).toBe('staff.manage');
      expect(allowed('admin', 'GET', path)).toBe(false);
    }
    expect(permissionForRequest('GET', '/audit-logs/export/')).toBe('audit.export');
    expect(permissionForRequest('GET', '/Audit-Logs/Export')).toBe('audit.export');
    expect(permissionForRequest('PATCH', '/Settings')).toBe('settings.write');
    expect(permissionForRequest('POST', '/riders/r1/adjustments/')).toBe('money.adjust');
    expect(permissionForRequest('POST', '/Refunds/x/Complete/')).toBe('money.write');
    expect(permissionForRequest('GET', '/pending-sellers/')).toBe('read.approvals');
    expect(allowed('support', 'POST', '/ORDERS/o1/refund/')).toBe(false);
  });

  it('survives a path that is not valid percent-encoding', () => {
    expect(permissionForRequest('GET', '/%E0%A4%A')).toBe('read.core');
    expect(permissionForRequest('POST', '/%')).toBe('ops.write');
  });
});

describe('the System health page', () => {
  it('is for admins, not support staff (failure reasons can quote email addresses)', () => {
    const { permissionForRequest, can } = jest.requireActual('../src/utils/permissions') as typeof import('../src/utils/permissions');
    const needs = permissionForRequest('GET', '/system-health');
    expect(needs).toBe('audit.read');
    expect(can('admin', needs)).toBe(true);
    expect(can('super_admin', needs)).toBe(true);
    expect(can('support', needs)).toBe(false);
  });
});
