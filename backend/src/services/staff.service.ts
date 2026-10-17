import bcrypt from 'bcrypt';
import prisma from '../config/database';
import socketManager from '../config/socket';
import { AppError } from '../middleware/errorHandler';
import { placeholderPhone } from './auth.service';
import { realPhoneOrNull } from '../utils/otp';
import { permissionsFor, StaffRole } from '../utils/permissions';
import { assertPasswordStrength, MIN_STAFF_PASSWORD_LENGTH } from '../utils/password-policy';

/**
 * The staff: the one super admin, admins, and customer support people. Only the super admin manages
 * them (route permission staff.manage). The super admin is the only one who can't be changed here.
 */
const ASSIGNABLE: StaffRole[] = ['admin', 'support'];

const present = (u: {
  id: string;
  email: string | null;
  phone: string;
  staffRole: string | null;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  profile: { fullName: string | null } | null;
}) => ({
  id: u.id,
  name: u.profile?.fullName ?? null,
  email: u.email,
  phone: realPhoneOrNull(u.phone),
  role: u.staffRole,
  permissions: permissionsFor(u.staffRole),
  status: u.status,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

const SELECT = { id: true, email: true, phone: true, staffRole: true, status: true, lastLoginAt: true, createdAt: true, profile: { select: { fullName: true } } } as const;

/** A staff password: long (twelve characters), not a common one, not made of the person's own name or e-mail. */
function assertPassword(password: string, who: { email?: string | null; name?: string | null } = {}) {
  assertPasswordStrength(password, { minLength: MIN_STAFF_PASSWORD_LENGTH, email: who.email, name: who.name });
}

async function loadTarget(actorId: string, staffId: string) {
  if (staffId === actorId) throw new AppError("You can't change your own account here", 400, 'CANNOT_CHANGE_SELF');
  const target = await prisma.user.findUnique({ where: { id: staffId }, select: { id: true, userType: true, staffRole: true, status: true, email: true, profile: { select: { fullName: true } } } });
  if (!target || target.userType !== 'admin') throw new AppError('Staff member not found', 404, 'STAFF_NOT_FOUND');
  if (target.staffRole === 'super_admin') throw new AppError('The super admin account cannot be changed here', 403, 'CANNOT_CHANGE_SUPER_ADMIN');
  return target;
}

export async function listStaff() {
  const rows = await prisma.user.findMany({ where: { userType: 'admin' }, select: SELECT, orderBy: [{ createdAt: 'asc' }] });
  const order = { super_admin: 0, admin: 1, support: 2 } as Record<string, number>;
  return rows.map(present).sort((a, b) => (order[a.role ?? ''] ?? 9) - (order[b.role ?? ''] ?? 9));
}

/** The super admin creates an admin or a support person with a first password they hand over. */
export async function createStaff(input: { email: string; fullName: string; role: string; password: string }) {
  if (!ASSIGNABLE.includes(input.role as StaffRole)) throw new AppError('Role must be admin or support', 400, 'INVALID_ROLE');
  assertPassword(input.password, { email: input.email, name: input.fullName });
  const email = input.email.toLowerCase().trim();
  if (await prisma.user.findFirst({ where: { email }, select: { id: true } })) {
    throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
  }
  const user = await prisma.user.create({
    data: {
      email,
      phone: placeholderPhone(email),
      passwordHash: await bcrypt.hash(input.password, 10),
      userType: 'admin',
      staffRole: input.role,
      emailVerified: true,
      phoneVerified: false,
      status: 'active',
      profile: { create: { fullName: input.fullName.trim() } },
    },
    select: SELECT,
  });
  return present(user);
}

export async function changeStaffRole(actorId: string, staffId: string, role: string) {
  if (!ASSIGNABLE.includes(role as StaffRole)) throw new AppError('Role must be admin or support', 400, 'INVALID_ROLE');
  await loadTarget(actorId, staffId);
  // Their sessions end so the new role applies at once.
  const user = await prisma.user.update({ where: { id: staffId }, data: { staffRole: role, tokensValidAfter: new Date() }, select: SELECT });
  socketManager.disconnectUser(staffId);
  return present(user);
}

export async function setStaffStatus(actorId: string, staffId: string, status: string) {
  if (!['active', 'suspended'].includes(status)) throw new AppError('Status must be active or suspended', 400, 'INVALID_STATUS');
  await loadTarget(actorId, staffId);
  const user = await prisma.user.update({
    where: { id: staffId },
    data: { status, ...(status === 'suspended' ? { tokensValidAfter: new Date() } : {}) },
    select: SELECT,
  });
  if (status === 'suspended') socketManager.disconnectUser(staffId);
  return present(user);
}

export async function resetStaffPassword(actorId: string, staffId: string, password: string) {
  const target = await loadTarget(actorId, staffId);
  assertPassword(password, { email: target.email, name: target.profile?.fullName });
  await prisma.user.update({ where: { id: staffId }, data: { passwordHash: await bcrypt.hash(password, 10), tokensValidAfter: new Date() } });
  socketManager.disconnectUser(staffId);
  return { id: staffId };
}

/** Takes the staff role away: the account stays as an ordinary customer account and is signed out. */
export async function removeStaff(actorId: string, staffId: string) {
  await loadTarget(actorId, staffId);
  await prisma.user.update({ where: { id: staffId }, data: { userType: 'customer', staffRole: null, tokensValidAfter: new Date() } });
  socketManager.disconnectUser(staffId);
  return { id: staffId, userType: 'customer' };
}
