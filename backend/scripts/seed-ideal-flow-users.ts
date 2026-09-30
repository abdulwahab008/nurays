import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding standard test users for all roles...');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Category
  const category = await prisma.category.upsert({
    where: { slug: 'ready-to-cook' },
    update: { isActive: true },
    create: {
      name: 'Ready to Cook',
      slug: 'ready-to-cook',
      productType: 'frozen',
      isActive: true,
      sortOrder: 1,
    },
  });

  // 2. Admin User
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@frozennuray.com' },
    update: {
      passwordHash,
      userType: 'admin',
      status: 'active',
      emailVerified: true,
    },
    create: {
      email: 'admin@frozennuray.com',
      phone: '+923000000001',
      userType: 'admin',
      status: 'active',
      emailVerified: true,
      passwordHash,
    },
  });
  console.log('✅ Admin user ready:', adminUser.email);

  // 3. Seller User & Record
  // Also ensure e2e-seller@nuray.test has standard password
  await prisma.user.updateMany({
    where: { email: 'e2e-seller@nuray.test' },
    data: { passwordHash, status: 'active', emailVerified: true },
  });

  const sellerUser = await prisma.user.upsert({
    where: { email: 'seller@nuray.test' },
    update: {
      passwordHash,
      userType: 'seller',
      status: 'active',
      emailVerified: true,
    },
    create: {
      email: 'seller@nuray.test',
      phone: '+923009990888',
      userType: 'seller',
      status: 'active',
      emailVerified: true,
      passwordHash,
    },
  });

  const seller = await prisma.seller.upsert({
    where: { userId: sellerUser.id },
    update: {
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
      businessName: "Saima's Craft Kitchen",
      minPrepTimeMinutes: 20,
    },
    create: {
      userId: sellerUser.id,
      businessName: "Saima's Craft Kitchen",
      isVerified: true,
      status: 'active',
      verificationStatus: 'approved',
      minPrepTimeMinutes: 20,
      ratingAverage: 4.9,
    },
  });
  console.log('✅ Seller user & kitchen ready:', sellerUser.email, '->', seller.businessName);

  // Ensure standard product for this seller
  const FIXED_PRODUCT_ID = '1e24a3f6-9043-4710-959a-afda9ccfe65a';
  const sampleProduct = await prisma.product.upsert({
    where: { id: FIXED_PRODUCT_ID },
    update: {
      sellerId: seller.id,
      categoryId: category.id,
      name: 'E2E Zafrani Chicken Biryani',
      slug: 'e2e-zafrani-chicken-biryani',
      price: 650,
      stockQuantity: 100,
      isActive: true,
      approvalStatus: 'approved',
    },
    create: {
      id: FIXED_PRODUCT_ID,
      sellerId: seller.id,
      categoryId: category.id,
      name: 'E2E Zafrani Chicken Biryani',
      slug: 'e2e-zafrani-chicken-biryani',
      description: 'Fragrant Basmati rice with marinated chicken and pure saffron.',
      price: 650,
      unit: 'pack',
      stockQuantity: 100,
      isActive: true,
      approvalStatus: 'approved',
    },
  });
  console.log('✅ Seller product ready:', sampleProduct.name, `(${sampleProduct.id})`);

  // 4. Rider User & Record
  const riderUser = await prisma.user.upsert({
    where: { email: 'rider@nuray.test' },
    update: {
      passwordHash,
      userType: 'rider',
      status: 'active',
      emailVerified: true,
    },
    create: {
      email: 'rider@nuray.test',
      phone: '+923007770888',
      userType: 'rider',
      status: 'active',
      emailVerified: true,
      passwordHash,
    },
  });

  const rider = await prisma.rider.upsert({
    where: { userId: riderUser.id },
    update: {
      city: 'Karachi',
      vehicleType: 'motorcycle',
      vehicleNumber: 'KHI-8921',
      licenseNumber: 'LIC-PK-2026',
      status: 'active',
      verificationStatus: 'approved',
      isAvailable: true,
      ratingAverage: 4.85,
    },
    create: {
      userId: riderUser.id,
      city: 'Karachi',
      vehicleType: 'motorcycle',
      vehicleNumber: 'KHI-8921',
      licenseNumber: 'LIC-PK-2026',
      status: 'active',
      verificationStatus: 'approved',
      isAvailable: true,
      ratingAverage: 4.85,
    },
  });
  console.log('✅ Rider user & fleet ready:', riderUser.email, '->', rider.vehicleNumber);

  // 5. Customer User & Address
  const customerUser = await prisma.user.upsert({
    where: { email: 'customer@nuray.test' },
    update: {
      passwordHash,
      userType: 'customer',
      status: 'active',
      emailVerified: true,
    },
    create: {
      email: 'customer@nuray.test',
      phone: '+923001230888',
      userType: 'customer',
      status: 'active',
      emailVerified: true,
      passwordHash,
    },
  });

  // Ensure Customer Address exists
  const existingAddress = await prisma.userAddress.findFirst({
    where: { userId: customerUser.id },
  });

  let addressId = existingAddress?.id;
  if (!existingAddress) {
    const newAddress = await prisma.userAddress.create({
      data: {
        userId: customerUser.id,
        label: 'Home',
        addressLine1: 'House 42, Street 8, Block 4',
        area: 'DHA Phase 5',
        city: 'Karachi',
        latitude: 24.8607,
        longitude: 67.0011,
        isDefault: true,
      },
    });
    addressId = newAddress.id;
  }
  console.log('✅ Customer user & delivery address ready:', customerUser.email, '->', addressId);

  console.log('\n=============================================');
  console.log('STANDARD TEST CREDENTIALS:');
  console.log('1. Customer:     customer@nuray.test     / Password123!');
  console.log('2. Seller:       seller@nuray.test       / Password123!');
  console.log('3. Rider:        rider@nuray.test        / Password123!');
  console.log('4. Admin:        admin@frozennuray.com   / Password123!');
  console.log('=============================================\n');
}

main()
  .catch((e) => {
    console.error('Seed demo users failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
