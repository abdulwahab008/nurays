/**
 * The demo accounts offered on /login in development (frontend-web/components/auth/DemoLoginPanel.tsx): a customer, an
 * approved kitchen with dishes, a kitchen under review, a rejected kitchen with its reason, a rider and an admin, all
 * with the password Password123! and a name. Safe to run again (upserts). It creates its own records only and leaves
 * the end-to-end seed (prisma/seed-e2e.ts) alone.
 *
 *   cd backend && npm run seed:demo
 */
import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedCommunities } from '../prisma/seed-communities';
import { isProduction } from '../src/config/env';
import { MAX_RIDER_CASH_LIMIT } from '../src/validators/admin.validator';

const prisma = new PrismaClient();
const PASSWORD = 'Password123!';

async function account(passwordHash: string, a: { email: string; phone: string; userType: string; name: string; city?: string; staffRole?: string }) {
  const fields = { passwordHash, userType: a.userType, status: 'active', emailVerified: true };
  const user = await prisma.user.upsert({
    where: { email: a.email },
    update: fields,
    create: { email: a.email, phone: a.phone, ...fields, ...(a.staffRole ? { staffRole: a.staffRole } : {}) },
  });
  await prisma.userProfile.upsert({
    where: { userId: user.id },
    update: { fullName: a.name, city: a.city ?? 'Karachi' },
    create: { userId: user.id, fullName: a.name, city: a.city ?? 'Karachi' },
  });
  return user;
}

/** The demo accounts share a known password, so this seed refuses to touch a production database. */
export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env) {
  if (isProduction(env)) {
    throw new Error('The demo seed creates accounts with a known password and never runs in production. Set NODE_ENV=development or test.');
  }
}

/**
 * Demo only: nobody settles the demo rider at a hub, so cash from test orders piles up in their hand and the default
 * limit would soon stop them being offered cash orders. The demo rider gets the highest per-rider limit an admin can
 * set instead, and a higher one already set is kept. The production cash-limit rule and the ledger are untouched.
 */
export function demoRiderCashLimit(current: Prisma.Decimal | number | null | undefined): number {
  return Math.max(MAX_RIDER_CASH_LIMIT, Number(current ?? 0));
}

async function main() {
  assertDemoSeedAllowed();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  await seedCommunities();
  const community = await prisma.community.findUnique({ where: { slug: 'gulshan-e-iqbal' } });

  const category = await prisma.category.upsert({
    where: { slug: 'ready-to-cook' },
    update: { isActive: true },
    create: { name: 'Ready to Cook', slug: 'ready-to-cook', productType: 'frozen', isActive: true, sortOrder: 1 },
  });

  // The demo admin is the super admin (the one account that manages staff and settings) when no one else holds that
  // role. A re-run never changes an existing staff role: there can only be one super admin, and a demotion here would
  // lock everyone out of staff management.
  const superAdmin = await prisma.user.findFirst({ where: { staffRole: 'super_admin' }, select: { email: true } });
  const admin = await account(passwordHash, {
    email: 'admin@frozennuray.com',
    phone: '+923000000001',
    userType: 'admin',
    staffRole: superAdmin ? 'admin' : 'super_admin',
    name: 'Nuray admin',
  });
  if (!superAdmin) {
    await prisma.user.update({ where: { id: admin.id }, data: { staffRole: 'super_admin' } });
  }

  // An approved kitchen in Gulshan-e-Iqbal with three dishes customers can order. Its name is its owner's, so it is not
  // mistaken for the e2e seed's "Saima's Craft Kitchen" in the same area. The pin is in Block 13, Gulshan-e-Iqbal, Karachi:
  // riders collect from it and delivery distances are measured from it.
  const sellerUser = await account(passwordHash, { email: 'seller@nuray.test', phone: '+923009990888', userType: 'seller', name: 'Saima Baig' });
  const kitchen = {
    businessName: "Saima Baig's Kitchen",
    isVerified: true,
    status: 'active',
    verificationStatus: 'approved',
    rejectionReason: null,
    minPrepTimeMinutes: 20,
    communityId: community?.id,
    primaryCommunityName: community?.name,
    latitude: 24.9215,
    longitude: 67.0935,
    pickupAddress: 'House 18, Block 13-D, Gulshan-e-Iqbal, Karachi',
  };
  const seller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: kitchen,
    create: { userId: sellerUser.id, ...kitchen },
  });
  // A rating is the average of real reviews: with none there is nothing to show.
  await prisma.seller.updateMany({ where: { id: seller.id, totalReviews: 0 }, data: { ratingAverage: 0 } });
  const dishes = [
    { slug: 'saima-zafrani-chicken-biryani', name: 'Zafrani chicken biryani (2 portions)', price: 650, description: 'Basmati rice layered with saffron and slow-cooked chicken.' },
    { slug: 'saima-chicken-shami-kebab-12', name: 'Chicken shami kebab (pack of 12)', price: 900, description: 'Frozen, ready to shallow-fry in five minutes.' },
    { slug: 'saima-aloo-samosa-24', name: 'Aloo samosa (pack of 24)', price: 720, description: 'Frozen, crisp after eight minutes in hot oil.' },
  ];
  for (const d of dishes) {
    const fields = { sellerId: seller.id, categoryId: category.id, name: d.name, description: d.description, price: d.price, unit: 'pack', stockQuantity: 100, isActive: true, approvalStatus: 'approved' };
    await prisma.product.upsert({ where: { slug: d.slug }, update: fields, create: { slug: d.slug, ...fields } });
  }

  // Two applicants: one waiting for review, one rejected with a reason to fix.
  const applicants = [
    { email: 'seller.pending@nuray.test', phone: '+923009990889', name: 'Ahmed Khan', businessName: 'Ahmed Tikka & Karahi', verificationStatus: 'pending', rejectionReason: null },
    {
      email: 'seller.rejected@nuray.test',
      phone: '+923009990890',
      name: 'Bilal Tariq',
      businessName: 'Bilal Shawarma',
      verificationStatus: 'rejected',
      rejectionReason: 'The CNIC photo is blurry. Upload a clear photo of the front.',
    },
  ];
  for (const a of applicants) {
    const user = await account(passwordHash, { email: a.email, phone: a.phone, userType: 'seller', name: a.name });
    const fields = { businessName: a.businessName, isVerified: false, status: 'active', verificationStatus: a.verificationStatus, rejectionReason: a.rejectionReason, communityId: community?.id, primaryCommunityName: community?.name };
    await prisma.seller.upsert({ where: { userId: user.id }, update: fields, create: { userId: user.id, ...fields } });
  }

  const riderUser = await account(passwordHash, { email: 'rider@nuray.test', phone: '+923007770888', userType: 'rider', name: 'Imran Ali' });
  const existingRider = await prisma.rider.findUnique({ where: { userId: riderUser.id }, select: { cashLimit: true } });
  const rider = {
    city: 'Karachi',
    vehicleType: 'motorcycle',
    vehicleNumber: 'KHI-8921',
    licenseNumber: 'LIC-PK-2026',
    status: 'active',
    verificationStatus: 'approved',
    isAvailable: true,
    cashLimit: demoRiderCashLimit(existingRider?.cashLimit),
  };
  await prisma.rider.upsert({ where: { userId: riderUser.id }, update: rider, create: { userId: riderUser.id, ...rider } });

  const customerUser = await account(passwordHash, { email: 'customer@nuray.test', phone: '+923001230888', userType: 'customer', name: 'Ayesha Khan' });
  const hasAddress = await prisma.userAddress.findFirst({ where: { userId: customerUser.id } });
  if (!hasAddress) {
    await prisma.userAddress.create({
      data: {
        userId: customerUser.id,
        label: 'Home',
        addressLine1: 'House 42, Street 8, Block 4',
        area: 'Gulshan-e-Iqbal',
        city: 'Karachi',
        latitude: 24.9207,
        longitude: 67.0882,
        isDefault: true,
      },
    });
  }

  console.log(`Demo accounts ready (password ${PASSWORD}): customer@nuray.test, seller@nuray.test, seller.pending@nuray.test,`);
  console.log('seller.rejected@nuray.test, rider@nuray.test, admin@frozennuray.com (the super admin when no other account is; it gets two-step sign-in where STAFF_2FA_REQUIRED is on, always in production).');
}

if (require.main === module) {
  main()
    .catch((e) => {
      console.error('Seeding the demo accounts failed:', e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
