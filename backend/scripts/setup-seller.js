/**
 * Setup Seller Record for Google OAuth User
 * Run: node scripts/setup-seller.js abdulwahab01567@gmail.com
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function setupSeller(email) {
  console.log(`\n🔍 Looking for user: ${email}\n`);
  
  // Find user by email
  const user = await prisma.user.findUnique({
    where: { email },
    include: { seller: true, profile: true }
  });
  
  if (!user) {
    console.log('❌ User not found with email:', email);
    console.log('\nAvailable users:');
    const users = await prisma.user.findMany({
      select: { email: true, userType: true },
      take: 10
    });
    users.forEach(u => console.log(`  - ${u.email} (${u.userType})`));
    return;
  }
  
  console.log('✅ User found:');
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Type: ${user.userType}`);
  console.log(`   Name: ${user.profile?.fullName || 'N/A'}`);
  
  if (user.seller) {
    console.log('\n✅ Seller record already exists:');
    console.log(`   Seller ID: ${user.seller.id}`);
    console.log(`   Business: ${user.seller.businessName}`);
    console.log(`   Verified: ${user.seller.isVerified}`);
    console.log(`   Status: ${user.seller.verificationStatus}`);
    return;
  }
  
  // Update user type to seller if needed
  if (user.userType !== 'seller') {
    console.log(`\n⚠️ Updating user type from "${user.userType}" to "seller"...`);
    await prisma.user.update({
      where: { id: user.id },
      data: { userType: 'seller' }
    });
    console.log('✅ User type updated to seller');
  }
  
  // Create seller record
  console.log('\n📝 Creating Seller record...');
  const seller = await prisma.seller.create({
    data: {
      userId: user.id,
      businessName: user.profile?.fullName ? `${user.profile.fullName}'s Kitchen` : 'My Kitchen',
      businessNameUrdu: 'میری دکان',
      description: 'Delicious homemade frozen food made with love',
      descriptionUrdu: 'محبت سے بنایا ہوا لذیذ گھریلو منجمد کھانا',
      status: 'active',
      verificationStatus: 'approved',
      isVerified: true,
      commissionRate: 15.00
    }
  });
  
  console.log('\n🎉 Seller created successfully!');
  console.log(`   Seller ID: ${seller.id}`);
  console.log(`   Business Name: ${seller.businessName}`);
  console.log('\n✅ You can now add products from the seller dashboard!');
}

const email = process.argv[2] || 'abdulwahab01567@gmail.com';

setupSeller(email)
  .catch(console.error)
  .finally(() => prisma.$disconnect());
