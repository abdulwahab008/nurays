import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { formatPhoneNumber } from '../utils/otp';

/**
 * People, for admins: every account (search, suspend, reactivate), riders' standing, and the
 * hub-manager role. Changes are recorded by the admin audit trail (routes/admin.routes.ts).
 */

const ACCOUNT_STATUSES = ['active', 'suspended'] as const;
type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export async function listUsers(opts: { search?: string; type?: string; status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, Math.trunc(Number(opts.page)) || 1);
  const limit = Math.min(100, Math.max(1, Math.trunc(Number(opts.limit)) || 25));
  const search = (opts.search ?? '').trim().slice(0, 100);
  const where: Prisma.UserWhereInput = {
    ...(opts.type ? { userType: opts.type } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search.replace(/[^\d+]/g, '') || search } },
            { profile: { fullName: { contains: search, mode: 'insensitive' } } },
            { seller: { businessName: { contains: search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        phone: true,
        email: true,
        userType: true,
        status: true,
        emailVerified: true,
        phoneVerified: true,
        lastLoginAt: true,
        createdAt: true,
        profile: { select: { fullName: true, city: true } },
        seller: { select: { id: true, businessName: true, status: true, verificationStatus: true } },
        managedHubs: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  // Rider has no relation on User: one query for the riders on this page.
  const riders = await prisma.rider.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { id: true, userId: true, status: true, verificationStatus: true },
  });
  const riderByUser = new Map(riders.map((r) => [r.userId, r]));
  return {
    users: users.map((u) => ({
      id: u.id,
      name: u.profile?.fullName ?? null,
      phone: u.phone,
      email: u.email,
      userType: u.userType,
      status: u.status,
      emailVerified: u.emailVerified,
      phoneVerified: u.phoneVerified,
      city: u.profile?.city ?? null,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      orderCount: u._count.orders,
      seller: u.seller,
      rider: riderByUser.get(u.id) ?? null,
      managedHubs: u.managedHubs,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

/**
 * Suspend or reactivate an account. Suspending signs the person out everywhere and also
 * suspends their kitchen or rider account, so a suspended seller stops receiving orders;
 * reactivating restores both. Admin accounts (and your own) can't be changed here.
 */
export async function setUserStatus(adminId: string, userId: string, status: string) {
  if (!ACCOUNT_STATUSES.includes(status as AccountStatus)) throw new AppError('Status must be active or suspended', 400, 'INVALID_STATUS');
  if (userId === adminId) throw new AppError("You can't change your own account here", 400, 'CANNOT_CHANGE_SELF');
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, userType: true, status: true } });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  if (user.userType === 'admin') throw new AppError("Admin accounts can't be suspended here", 403, 'CANNOT_CHANGE_ADMIN');
  if (!ACCOUNT_STATUSES.includes(user.status as AccountStatus)) {
    throw new AppError(`This account is ${user.status}; it can't be changed here`, 409, 'ACCOUNT_CLOSED');
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { status, ...(status === 'suspended' ? { tokensValidAfter: new Date() } : {}) },
    }),
    prisma.seller.updateMany({ where: { userId }, data: { status } }),
    prisma.rider.updateMany({ where: { userId }, data: { status } }),
  ]);
  return { id: userId, status };
}

/**
 * A rider's standing. Suspending takes them off the road: jobs they haven't picked up yet go
 * back to the pool for other riders; jobs with food on board stay with them and are listed
 * so an admin can resolve them from the order.
 */
export async function setRiderStatus(riderId: string, status: string) {
  if (!ACCOUNT_STATUSES.includes(status as AccountStatus)) throw new AppError('Status must be active or suspended', 400, 'INVALID_STATUS');
  const rider = await prisma.rider.findUnique({ where: { id: riderId }, select: { id: true } });
  if (!rider) throw new AppError('Rider not found', 404, 'RIDER_NOT_FOUND');

  return prisma.$transaction(async (tx) => {
    await tx.rider.update({ where: { id: riderId }, data: { status, ...(status === 'suspended' ? { isAvailable: false } : {}) } });
    const none: Array<{ deliveryId: string; orderId: string }> = [];
    if (status !== 'suspended') return { id: riderId, status, releasedJobs: none, jobsWithFood: none };
    const toRelease = await tx.delivery.findMany({
      where: { riderId, status: { in: ['assigned', 'arrived_at_pickup'] } },
      select: { id: true, orderId: true },
    });
    if (toRelease.length) {
      await tx.delivery.updateMany({
        where: { id: { in: toRelease.map((d) => d.id) }, riderId, status: { in: ['assigned', 'arrived_at_pickup'] } },
        data: { riderId: null, status: 'pending', riderFee: null, riderBonus: null, arrivedAtPickup: null, riderLatitude: null, riderLongitude: null, riderLocationAt: null },
      });
    }
    const withFood = await tx.delivery.findMany({
      where: { riderId, status: { in: ['picked_up', 'in_transit', 'arrived_at_customer'] } },
      select: { id: true, orderId: true },
    });
    const shape = (d: { id: string; orderId: string }) => ({ deliveryId: d.id, orderId: d.orderId });
    return { id: riderId, status, releasedJobs: toRelease.map(shape), jobsWithFood: withFood.map(shape) };
  });
}

async function findAccount(identifier: string) {
  const value = identifier.trim();
  if (!value) throw new AppError('Enter an email address or phone number', 400, 'IDENTIFIER_REQUIRED');
  return value.includes('@')
    ? prisma.user.findUnique({ where: { email: value.toLowerCase() } })
    : prisma.user.findUnique({ where: { phone: formatPhoneNumber(value) } });
}

/**
 * Give an existing customer account the hub-manager role (they sign in again to use it).
 * Only plain customer accounts: never a seller, rider or admin.
 */
export async function makeHubManager(identifier: string) {
  const user = await findAccount(identifier);
  if (!user) throw new AppError('No account with that email or phone. Ask them to sign up first.', 404, 'USER_NOT_FOUND');
  if (user.userType === 'hub_manager') throw new AppError('This account is already a hub manager', 409, 'ALREADY_HUB_MANAGER');
  if (user.userType !== 'customer') throw new AppError(`This is a ${user.userType} account; only a customer account can become a hub manager`, 409, 'ROLE_NOT_ALLOWED');
  if (user.status !== 'active') throw new AppError(`This account is ${user.status}`, 409, 'ACCOUNT_NOT_ACTIVE');
  const hasRider = await prisma.rider.count({ where: { userId: user.id } });
  if (hasRider) throw new AppError('This account has a rider application; it cannot become a hub manager', 409, 'ROLE_NOT_ALLOWED');
  await prisma.user.update({ where: { id: user.id }, data: { userType: 'hub_manager', tokensValidAfter: new Date() } });
  return { id: user.id, userType: 'hub_manager' };
}

/** Take the hub-manager role away: back to a customer account, and off every hub it ran. */
export async function removeHubManager(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { userType: true } });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  if (user.userType !== 'hub_manager') throw new AppError('This account is not a hub manager', 409, 'NOT_HUB_MANAGER');
  await prisma.$transaction([
    prisma.hubCenter.updateMany({ where: { managerId: userId }, data: { managerId: null } }),
    prisma.user.update({ where: { id: userId }, data: { userType: 'customer', tokensValidAfter: new Date() } }),
  ]);
  return { id: userId, userType: 'customer' };
}

export async function listHubManagers() {
  const managers = await prisma.user.findMany({
    where: { userType: 'hub_manager' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, phone: true, email: true, status: true, profile: { select: { fullName: true } }, managedHubs: { select: { id: true, name: true } } },
  });
  return managers.map((m) => ({
    id: m.id,
    name: m.profile?.fullName ?? null,
    phone: m.phone,
    email: m.email,
    status: m.status,
    hubs: m.managedHubs,
  }));
}
