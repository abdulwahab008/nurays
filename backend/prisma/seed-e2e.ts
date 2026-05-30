/**
 * Deterministic, idempotent seed for E2E / CI.
 *
 * Creates the minimum data the Playwright suite needs:
 *   - one parent category
 *   - one verified, active seller (user + seller record)
 *   - three active products under that seller
 *
 * Safe to run repeatedly (upserts keyed on unique fields).
 *
 *   npx ts-node prisma/seed-e2e.ts
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
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
    update: { isVerified: true, status: 'active', verificationStatus: 'approved' },
    create: {
      userId: sellerUser.id,
      businessName: 'E2E Test Kitchen',
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
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

  console.log(`✅ E2E seed done: category=${category.slug}, seller=${seller.businessName}, products=${1 + more.length}`);
}

main()
  .catch((e) => {
    console.error('E2E seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
