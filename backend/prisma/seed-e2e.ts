/**
 * Deterministic, idempotent seed for E2E / CI.
 *
 * Creates the minimum data the Playwright suite needs:
 *   - one parent category
 *   - one verified, active seller (user + seller record)
 *   - three active products under that seller
 *   - one approved rider carrying one order to a customer's pinned address (the rider
 *     navigation spec signs in as e2e-rider@nuray.test and presses Start on that job)
 *
 * Safe to run repeatedly (upserts keyed on unique fields).
 *
 *   npx ts-node prisma/seed-e2e.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { seedCommunities } from './seed-communities';
import { seedCommunityKitchens } from './seed-community-kitchens';

const prisma = new PrismaClient();

async function main() {
  // --- communities & community kitchens ---
  await seedCommunities();
  await seedCommunityKitchens();
  const gulshan = await prisma.community.findUnique({
    where: { slug: 'gulshan-e-iqbal' },
  });

  // --- category ---
  const category = await prisma.category.upsert({
    where: { slug: 'ready-to-cook' },
    update: {},
    create: {
      name: 'Ready to Cook',
      slug: 'ready-to-cook',
      productType: 'frozen',
      isActive: true,
      sortOrder: 1,
    },
  });

  // --- seller user ---
  const passwordHash = await bcrypt.hash('SellerPass123!', 10);
  const sellerUser = await prisma.user.upsert({
    where: { email: 'e2e-seller@nuray.test' },
    update: {},
    create: {
      email: 'e2e-seller@nuray.test',
      phone: '+923009990001',
      userType: 'seller',
      status: 'active',
      emailVerified: true,
      passwordHash,
    },
  });

  // --- seller record ---
  const seller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: {
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
      communityId: gulshan?.id,
      primaryCommunityName: gulshan?.name,
    },
    create: {
      userId: sellerUser.id,
      businessName: 'E2E Test Kitchen',
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
      communityId: gulshan?.id,
      primaryCommunityName: gulshan?.name,
    },
  });

  // --- products ---
  // The first product uses a FIXED id that the Playwright purchase spec
  // references directly (tests/e2e/purchase.spec.ts SAMPLE_PRODUCT_ID). It's
  // upserted by id so it stays idempotent even on a dev DB where that id may
  // already exist under a different slug. The rest upsert by slug.
  const FIXED_ID = '1e24a3f6-9043-4710-959a-afda9ccfe65a';
  const base = {
    sellerId: seller.id,
    categoryId: category.id,
    unit: 'pack',
    stockQuantity: 100,
    isActive: true,
    approvalStatus: 'approved',
  };

  await prisma.product.upsert({
    where: { id: FIXED_ID },
    update: { isActive: true, approvalStatus: 'approved', stockQuantity: 100 },
    create: {
      ...base,
      id: FIXED_ID,
      name: 'E2E Chicken Seekh Kabab',
      slug: 'e2e-chicken-seekh-kabab',
      description: 'E2E Chicken Seekh Kabab — seeded for end-to-end tests.',
      price: 650,
    },
  });

  const more = [
    { name: 'E2E Aloo Paratha', slug: 'e2e-aloo-paratha', price: 350 },
    { name: 'E2E Beef Samosa', slug: 'e2e-beef-samosa', price: 450 },
  ];
  for (const p of more) {
    await prisma.product.upsert({
      where: { slug: p.slug },
      update: { isActive: true, approvalStatus: 'approved', stockQuantity: 100 },
      create: {
        ...base,
        name: p.name,
        slug: p.slug,
        description: `${p.name} — seeded for end-to-end tests.`,
        price: p.price,
      },
    });
  }

  // --- a rider with one job on the move ---
  // Fixed ids and unique keys keep this idempotent; a re-run puts the job back on the road.
  const riderUser = await prisma.user.upsert({
    where: { email: 'e2e-rider@nuray.test' },
    update: { status: 'active' },
    create: {
      email: 'e2e-rider@nuray.test',
      phone: '+923009990002',
      userType: 'rider',
      status: 'active',
      emailVerified: true,
      passwordHash: await bcrypt.hash('RiderPass123!', 10),
      profile: { create: { fullName: 'E2E Rider' } },
    },
  });
  const rider = await prisma.rider.upsert({
    where: { userId: riderUser.id },
    update: { status: 'active', verificationStatus: 'approved', isAvailable: true, communityId: gulshan?.id },
    create: {
      userId: riderUser.id,
      city: 'Karachi',
      vehicleType: 'motorcycle',
      status: 'active',
      verificationStatus: 'approved',
      isAvailable: true,
      communityId: gulshan?.id,
    },
  });

  const customer = await prisma.user.upsert({
    where: { email: 'e2e-customer@nuray.test' },
    update: {},
    create: {
      email: 'e2e-customer@nuray.test',
      phone: '+923009990003',
      userType: 'customer',
      status: 'active',
      emailVerified: true,
      passwordHash: await bcrypt.hash('CustomerPass123!', 10),
      profile: { create: { fullName: 'E2E Customer' } },
    },
  });
  // The customer's door, pinned in Gulshan-e-Iqbal, Karachi.
  const door = { latitude: 24.918, longitude: 67.0971 };
  const address = await prisma.userAddress.upsert({
    where: { id: '6f1d2c4e-3b5a-4e7f-9a1b-2c3d4e5f6a7b' },
    update: {},
    create: {
      id: '6f1d2c4e-3b5a-4e7f-9a1b-2c3d4e5f6a7b',
      userId: customer.id,
      label: 'Home',
      houseNumber: '7',
      addressLine1: 'House 7, Block 13-D',
      area: 'Gulshan-e-Iqbal',
      city: 'Karachi',
      landmark: 'Opposite the park',
      communityId: gulshan?.id,
      latitude: door.latitude,
      longitude: door.longitude,
      isDefault: true,
    },
  });

  const order = await prisma.order.upsert({
    where: { orderNumber: 'E2E-RIDER-JOB-1' },
    update: { orderStatus: 'dispatched' },
    create: {
      orderNumber: 'E2E-RIDER-JOB-1',
      customerId: customer.id,
      subtotal: 650,
      deliveryFee: 0,
      totalAmount: 650,
      paymentMethod: 'cod',
      deliveryType: 'home_delivery',
      orderStatus: 'dispatched',
      deliveryAddressId: address.id,
      deliveryAddressSnapshot: {
        addressLine1: address.addressLine1,
        area: address.area,
        city: address.city,
        houseNumber: address.houseNumber,
        landmark: address.landmark,
        latitude: door.latitude,
        longitude: door.longitude,
      },
      items: {
        create: {
          sellerId: seller.id,
          productId: FIXED_ID,
          productName: 'E2E Chicken Seekh Kabab',
          quantity: 1,
          unitPrice: 650,
          totalPrice: 650,
          commissionRate: 10,
          commissionAmount: 65,
          sellerPayout: 585,
          status: 'dispatched',
        },
      },
    },
  });
  const job = {
    riderId: rider.id,
    status: 'picked_up',
    assignmentMode: 'auto',
    riderFee: 120,
    pickupAddress: 'E2E Test Kitchen, Gulshan-e-Iqbal, Karachi',
    pickupLatitude: 24.9206,
    pickupLongitude: 67.0889,
    deliveryAddress: 'House 7, Block 13-D, Gulshan-e-Iqbal, Karachi',
    deliveryLatitude: door.latitude,
    deliveryLongitude: door.longitude,
  };
  await prisma.delivery.upsert({
    where: { orderId: order.id },
    update: job,
    create: { orderId: order.id, ...job },
  });

  console.log(`✅ E2E seed done: category=${category.slug}, seller=${seller.businessName}, products=${1 + more.length}, rider job=${order.orderNumber}`);
}

main()
  .catch((e) => {
    console.error('E2E seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
