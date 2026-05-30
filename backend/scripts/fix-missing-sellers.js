const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMissingSellers() {
  // Get all users who are sellers but don't have seller records
  const sellerUsers = await prisma.user.findMany({
    where: { userType: 'seller' },
    include: {
      profile: true,
      seller: true
    }
  });
  
  console.log('Checking seller users...\n');
  
  for (const user of sellerUsers) {
    if (!user.seller) {
      console.log('Creating seller record for:', user.email);
      
      const businessName = user.profile?.fullName 
        ? user.profile.fullName + "'s Kitchen"
        : user.email.split('@')[0] + "'s Kitchen";
      
      const seller = await prisma.seller.create({
        data: {
          userId: user.id,
          businessName: businessName,
          status: 'pending',
          verificationStatus: 'pending',
        },
      });
      
      console.log('  Created seller:', seller.id);
      console.log('  Business:', seller.businessName);
      console.log('  Status:', seller.status);
      console.log('');
    } else {
      console.log('Already has seller record:', user.email);
      console.log('  Business:', user.seller.businessName);
      console.log('  Status:', user.seller.status);
      console.log('');
    }
  }
  
  console.log('\n=== FINAL SELLER LIST ===\n');
  const allSellers = await prisma.seller.findMany({
    include: { user: { select: { email: true } } }
  });
  
  console.log('Email'.padEnd(35) + 'Business Name'.padEnd(25) + 'Status');
  console.log('-'.repeat(70));
  allSellers.forEach(s => {
    console.log(
      (s.user?.email || 'N/A').padEnd(35) + 
      s.businessName.padEnd(25) + 
      s.status
    );
  });
  
  await prisma.$disconnect();
}

fixMissingSellers().catch(console.error);
