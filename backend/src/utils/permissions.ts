/**
 * Who on the staff may do what.
 *
 * Staff accounts are users with userType "admin" and a staffRole:
 *  - super_admin: exactly one. Everything, and the only one who adds, changes or removes staff,
 *    changes platform settings, or corrects a rider's balance by hand.
 *  - admin: runs the platform day to day: approvals, orders, people, money actions (refunds,
 *    payouts, settling up with riders), places, promo codes, complaints, and reads the audit log.
 *  - support: the customer support person. Handles complaints (reply, internal notes, resolve) and
 *    can look things up (orders, people, kitchens, riders), but cannot move money, approve
 *    anyone, change anything on an order, or see applicants' ID documents.
 */
export type StaffRole = 'super_admin' | 'admin' | 'support';
export const STAFF_ROLES: StaffRole[] = ['super_admin', 'admin', 'support'];

export type Permission =
  | 'read.core' // orders, people, kitchens, riders, products, complaints, places, promo codes (view)
  | 'read.approvals' // pending applications with their ID documents
  | 'read.finance' // payouts, rider money, analytics, settings, hub managers
  | 'audit.read'
  | 'audit.export'
  | 'support.handle' // reply to and resolve complaints
  | 'ops.write' // approvals, orders, suspensions, places, catalogue
  | 'money.write' // refunds, payment confirmation, payouts, settling up with riders
  | 'money.adjust' // hand corrections to a rider's balance
  | 'settings.write'
  | 'staff.manage';

const ALL: Permission[] = ['read.core', 'read.approvals', 'read.finance', 'audit.read', 'audit.export', 'support.handle', 'ops.write', 'money.write', 'money.adjust', 'settings.write', 'staff.manage'];

const BY_ROLE: Record<StaffRole, Permission[]> = {
  super_admin: ALL,
  admin: ['read.core', 'read.approvals', 'read.finance', 'audit.read', 'support.handle', 'ops.write', 'money.write'],
  support: ['read.core', 'support.handle'],
};

export const isStaffRole = (v: unknown): v is StaffRole => typeof v === 'string' && (STAFF_ROLES as string[]).includes(v);

export function permissionsFor(role: string | null | undefined): Permission[] {
  return isStaffRole(role) ? BY_ROLE[role] : [];
}

export const can = (role: string | null | undefined, permission: Permission): boolean => permissionsFor(role).includes(permission);

interface Rule {
  method: 'GET' | 'WRITE' | 'ANY';
  path: RegExp;
  permission: Permission;
}

/**
 * What each admin route needs. Paths are relative to /admin. The first match wins. A write no rule
 * names needs ops.write, and a read no rule names needs read.core, so a route added later is
 * closed to support staff by default.
 */
const RULES: Rule[] = [
  { method: 'ANY', path: /^\/staff(\/|$)/, permission: 'staff.manage' },
  { method: 'GET', path: /^\/audit-logs\/export$/, permission: 'audit.export' },
  { method: 'GET', path: /^\/audit-logs(\/|$)/, permission: 'audit.read' },
  { method: 'WRITE', path: /^\/settings(\/|$)/, permission: 'settings.write' },
  { method: 'GET', path: /^\/settings(\/|$)/, permission: 'read.finance' },
  { method: 'WRITE', path: /^\/riders\/[^/]+\/adjustments$/, permission: 'money.adjust' },
  { method: 'WRITE', path: /^\/riders\/[^/]+\/(settlements|payouts|cash-limit)$/, permission: 'money.write' },
  { method: 'WRITE', path: /^\/orders\/[^/]+\/(refund|confirm-payment)$/, permission: 'money.write' },
  { method: 'WRITE', path: /^\/refunds\/[^/]+\/(complete|dismiss)$/, permission: 'money.write' },
  { method: 'WRITE', path: /^\/payouts\/[^/]+\/(complete|fail)$/, permission: 'money.write' },
  { method: 'WRITE', path: /^\/support\/tickets\/[^/]+\/reply$/, permission: 'support.handle' },
  { method: 'WRITE', path: /^\/reviews\/[^/]+\/(hide|keep|restore)$/, permission: 'support.handle' },
  { method: 'GET', path: /^\/(pending-sellers|pending-riders)$/, permission: 'read.approvals' },
  { method: 'GET', path: /^\/sellers\/[^/]+$/, permission: 'read.approvals' },
  { method: 'GET', path: /^\/(riders\/money|riders\/[^/]+\/money|payouts|analytics|hub-managers)(\/|$)/, permission: 'read.finance' },
  { method: 'GET', path: /^\/approvals$/, permission: 'read.core' },
];

export function permissionForRequest(method: string, path: string): Permission {
  const write = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';
  for (const rule of RULES) {
    if (rule.method === 'GET' && write) continue;
    if (rule.method === 'WRITE' && !write) continue;
    if (rule.path.test(path)) return rule.permission;
  }
  return write ? 'ops.write' : 'read.core';
}
