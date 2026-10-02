import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { invalidateDeliveryPricing } from './delivery-pricing.service';
import { AppError } from '../middleware/errorHandler';

/**
 * Communities (the neighbourhoods buyers and kitchens belong to) and hubs (frozen-stock
 * centres), managed by admins. Neither is ever deleted: kitchens, addresses and orders point
 * at them, so they are switched off instead.
 */

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);

function inRange(value: number | undefined, min: number, max: number, what: string) {
  if (value === undefined) return;
  if (!Number.isFinite(value) || value < min || value > max) throw new AppError(`${what} must be between ${min} and ${max}`, 400, 'INVALID_VALUE');
}

function checkPoint(lat?: number, lng?: number) {
  inRange(lat, -90, 90, 'Latitude');
  inRange(lng, -180, 180, 'Longitude');
}

// ---------- communities ----------

export interface CommunityInput {
  name?: string;
  slug?: string;
  city?: string;
  areaDescription?: string | null;
  centerLatitude?: number;
  centerLongitude?: number;
  radiusKm?: number;
  deliveryBaseFee?: number;
  crossCommunityBaseFee?: number;
  crossCommunityEnabled?: boolean;
  neighborCommunityIds?: string[];
  isActive?: boolean;
}

export async function listCommunitiesForAdmin() {
  const rows = await prisma.community.findMany({
    orderBy: [{ isActive: 'desc' }, { city: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { sellers: true, users: true, addresses: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    city: c.city,
    areaDescription: c.areaDescription,
    centerLatitude: Number(c.centerLatitude),
    centerLongitude: Number(c.centerLongitude),
    radiusKm: c.radiusKm,
    deliveryBaseFee: Number(c.deliveryBaseFee),
    crossCommunityBaseFee: Number(c.crossCommunityBaseFee),
    crossCommunityEnabled: c.crossCommunityEnabled,
    neighborCommunityIds: c.neighborCommunityIds,
    isActive: c.isActive,
    sellerCount: c._count.sellers,
    memberCount: c._count.users,
    addressCount: c._count.addresses,
  }));
}

async function checkCommunityInput(data: CommunityInput, selfId?: string) {
  checkPoint(data.centerLatitude, data.centerLongitude);
  inRange(data.radiusKm, 0.2, 50, 'Radius (km)');
  inRange(data.deliveryBaseFee, 0, 5000, 'Delivery fee');
  inRange(data.crossCommunityBaseFee, 0, 5000, 'Cross-community delivery fee');
  if (data.neighborCommunityIds) {
    const ids = [...new Set(data.neighborCommunityIds)].filter((id) => id !== selfId);
    const found = await prisma.community.count({ where: { id: { in: ids } } });
    if (found !== ids.length) throw new AppError('Some neighbouring communities were not found', 400, 'INVALID_NEIGHBORS');
    data.neighborCommunityIds = ids;
  }
}

async function uniqueSlug(base: string, selfId?: string) {
  const root = slugify(base) || 'community';
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`;
    const taken = await prisma.community.findFirst({ where: { slug: candidate, ...(selfId ? { id: { not: selfId } } : {}) }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw new AppError('Could not find a free web address for this community; enter one', 409, 'SLUG_TAKEN');
}

export async function createCommunity(data: CommunityInput) {
  if (!data.name?.trim()) throw new AppError('Name is required', 400, 'NAME_REQUIRED');
  if (!data.city?.trim()) throw new AppError('City is required', 400, 'CITY_REQUIRED');
  if (data.centerLatitude === undefined || data.centerLongitude === undefined) {
    throw new AppError('Pick the centre of the community on the map', 400, 'CENTER_REQUIRED');
  }
  await checkCommunityInput(data);
  const slug = data.slug?.trim() ? slugify(data.slug) : await uniqueSlug(data.name);
  if (data.slug?.trim() && (await prisma.community.findUnique({ where: { slug } }))) {
    throw new AppError('That web address is already used by another community', 409, 'SLUG_TAKEN');
  }
  invalidateDeliveryPricing();
  const created = await prisma.community.create({
    data: {
      name: data.name.trim(),
      slug,
      city: data.city.trim(),
      areaDescription: data.areaDescription?.trim() || null,
      centerLatitude: data.centerLatitude,
      centerLongitude: data.centerLongitude,
      radiusKm: data.radiusKm ?? 3,
      deliveryBaseFee: data.deliveryBaseFee ?? 100,
      crossCommunityBaseFee: data.crossCommunityBaseFee ?? 150,
      crossCommunityEnabled: data.crossCommunityEnabled ?? true,
      neighborCommunityIds: data.neighborCommunityIds ?? [],
      isActive: data.isActive ?? true,
    },
  });
  return { id: created.id, slug: created.slug };
}

export async function updateCommunity(id: string, data: CommunityInput) {
  const existing = await prisma.community.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('Community not found', 404, 'COMMUNITY_NOT_FOUND');
  await checkCommunityInput(data, id);
  let slug: string | undefined;
  if (data.slug !== undefined) {
    slug = slugify(data.slug);
    if (!slug) throw new AppError('Enter a web address (letters, numbers and dashes)', 400, 'INVALID_SLUG');
    if (await prisma.community.findFirst({ where: { slug, id: { not: id } }, select: { id: true } })) {
      throw new AppError('That web address is already used by another community', 409, 'SLUG_TAKEN');
    }
  }
  const data2: Prisma.CommunityUpdateInput = {
    ...(data.name !== undefined ? { name: data.name.trim() } : {}),
    ...(slug !== undefined ? { slug } : {}),
    ...(data.city !== undefined ? { city: data.city.trim() } : {}),
    ...(data.areaDescription !== undefined ? { areaDescription: data.areaDescription?.trim() || null } : {}),
    ...(data.centerLatitude !== undefined ? { centerLatitude: data.centerLatitude } : {}),
    ...(data.centerLongitude !== undefined ? { centerLongitude: data.centerLongitude } : {}),
    ...(data.radiusKm !== undefined ? { radiusKm: data.radiusKm } : {}),
    ...(data.deliveryBaseFee !== undefined ? { deliveryBaseFee: data.deliveryBaseFee } : {}),
    ...(data.crossCommunityBaseFee !== undefined ? { crossCommunityBaseFee: data.crossCommunityBaseFee } : {}),
    ...(data.crossCommunityEnabled !== undefined ? { crossCommunityEnabled: data.crossCommunityEnabled } : {}),
    ...(data.neighborCommunityIds !== undefined ? { neighborCommunityIds: data.neighborCommunityIds } : {}),
    ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
  };
  if (data2.name !== undefined && !String(data2.name)) throw new AppError('Name is required', 400, 'NAME_REQUIRED');
  await prisma.community.update({ where: { id }, data: data2 });
  invalidateDeliveryPricing();
  return { id };
}

// ---------- hubs ----------

export interface HubInput {
  name?: string;
  code?: string;
  city?: string;
  area?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  capacityCubicFeet?: number;
  freezerUnits?: number;
  contactPhone?: string | null;
  status?: 'active' | 'inactive' | 'maintenance';
}

export async function listHubsForAdmin() {
  const hubs = await prisma.hubCenter.findMany({
    orderBy: [{ status: 'asc' }, { city: 'asc' }, { name: 'asc' }],
    include: {
      manager: { select: { id: true, phone: true, email: true, profile: { select: { fullName: true } } } },
      _count: { select: { riders: true, orders: true } },
    },
  });
  return hubs.map((h) => ({
    id: h.id,
    name: h.name,
    code: h.code,
    city: h.city,
    area: h.area,
    address: h.address,
    latitude: Number(h.latitude),
    longitude: Number(h.longitude),
    capacityCubicFeet: h.capacityCubicFeet,
    freezerUnits: h.freezerUnits,
    currentUtilization: Number(h.currentUtilization),
    contactPhone: h.contactPhone,
    status: h.status,
    manager: h.manager ? { id: h.manager.id, name: h.manager.profile?.fullName ?? null, phone: h.manager.phone, email: h.manager.email } : null,
    riderCount: h._count.riders,
    orderCount: h._count.orders,
  }));
}

function checkHubInput(data: HubInput) {
  checkPoint(data.latitude, data.longitude);
  inRange(data.capacityCubicFeet, 1, 1_000_000, 'Capacity (cubic feet)');
  inRange(data.freezerUnits, 1, 500, 'Freezer units');
  if (data.status !== undefined && !['active', 'inactive', 'maintenance'].includes(data.status)) {
    throw new AppError('Status must be active, inactive or maintenance', 400, 'INVALID_STATUS');
  }
}

export async function createHub(data: HubInput) {
  for (const [field, label] of [['name', 'Name'], ['code', 'Code'], ['city', 'City'], ['area', 'Area'], ['address', 'Address']] as const) {
    if (!String(data[field] ?? '').trim()) throw new AppError(`${label} is required`, 400, 'FIELD_REQUIRED');
  }
  if (data.latitude === undefined || data.longitude === undefined) throw new AppError("Pick the hub's location on the map", 400, 'LOCATION_REQUIRED');
  if (data.capacityCubicFeet === undefined) throw new AppError('Capacity is required', 400, 'FIELD_REQUIRED');
  checkHubInput(data);
  const code = data.code!.trim().toUpperCase().replace(/\s+/g, '-');
  if (await prisma.hubCenter.findUnique({ where: { code }, select: { id: true } })) {
    throw new AppError('Another hub already uses that code', 409, 'HUB_CODE_TAKEN');
  }
  const hub = await prisma.hubCenter.create({
    data: {
      name: data.name!.trim(),
      code,
      city: data.city!.trim(),
      area: data.area!.trim(),
      address: data.address!.trim(),
      latitude: data.latitude,
      longitude: data.longitude,
      capacityCubicFeet: Math.trunc(data.capacityCubicFeet),
      freezerUnits: Math.trunc(data.freezerUnits ?? 1),
      contactPhone: data.contactPhone?.trim() || null,
      status: data.status ?? 'active',
    },
  });
  return { id: hub.id, code: hub.code };
}

export async function updateHub(id: string, data: HubInput) {
  const existing = await prisma.hubCenter.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new AppError('Hub center not found', 404, 'HUB_NOT_FOUND');
  checkHubInput(data);
  let code: string | undefined;
  if (data.code !== undefined) {
    code = data.code.trim().toUpperCase().replace(/\s+/g, '-');
    if (!code) throw new AppError('Code is required', 400, 'FIELD_REQUIRED');
    if (await prisma.hubCenter.findFirst({ where: { code, id: { not: id } }, select: { id: true } })) {
      throw new AppError('Another hub already uses that code', 409, 'HUB_CODE_TAKEN');
    }
  }
  const text = (v: string | undefined, label: string) => {
    if (v === undefined) return undefined;
    if (!v.trim()) throw new AppError(`${label} is required`, 400, 'FIELD_REQUIRED');
    return v.trim();
  };
  await prisma.hubCenter.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: text(data.name, 'Name') } : {}),
      ...(code !== undefined ? { code } : {}),
      ...(data.city !== undefined ? { city: text(data.city, 'City') } : {}),
      ...(data.area !== undefined ? { area: text(data.area, 'Area') } : {}),
      ...(data.address !== undefined ? { address: text(data.address, 'Address') } : {}),
      ...(data.latitude !== undefined ? { latitude: data.latitude } : {}),
      ...(data.longitude !== undefined ? { longitude: data.longitude } : {}),
      ...(data.capacityCubicFeet !== undefined ? { capacityCubicFeet: Math.trunc(data.capacityCubicFeet) } : {}),
      ...(data.freezerUnits !== undefined ? { freezerUnits: Math.trunc(data.freezerUnits) } : {}),
      ...(data.contactPhone !== undefined ? { contactPhone: data.contactPhone?.trim() || null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
    },
  });
  return { id };
}

/** The hubs a hub manager runs (for their console). */
export async function hubsManagedBy(userId: string) {
  return prisma.hubCenter.findMany({
    where: { managerId: userId },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true, city: true, area: true, status: true },
  });
}
