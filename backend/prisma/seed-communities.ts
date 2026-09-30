import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedCommunities() {
  console.log('🌱 Seeding authentic Karachi and pilot communities...');

  // 1. Create Karachi Communities
  const gulshan = await prisma.community.upsert({
    where: { slug: 'gulshan-e-iqbal' },
    update: {
      name: 'Gulshan-e-Iqbal',
      city: 'Karachi',
      areaDescription: 'Blocks 4, 7, 13-D, University Road, and Disco Bakery vicinity',
      centerLatitude: 24.9200,
      centerLongitude: 67.0900,
      radiusKm: 4.5,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
    create: {
      name: 'Gulshan-e-Iqbal',
      slug: 'gulshan-e-iqbal',
      city: 'Karachi',
      areaDescription: 'Blocks 4, 7, 13-D, University Road, and Disco Bakery vicinity',
      centerLatitude: 24.9200,
      centerLongitude: 67.0900,
      radiusKm: 4.5,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
  });

  const dhaKarachi = await prisma.community.upsert({
    where: { slug: 'dha-karachi' },
    update: {
      name: 'DHA Karachi (Phase 5 & 6)',
      city: 'Karachi',
      areaDescription: 'Khayaban-e-Shahbaz, Bukhari Commercial, Muslim & Badar Commercial',
      centerLatitude: 24.8100,
      centerLongitude: 67.0600,
      radiusKm: 5.0,
      deliveryBaseFee: 70,
      crossCommunityBaseFee: 140,
      isActive: true,
    },
    create: {
      name: 'DHA Karachi (Phase 5 & 6)',
      slug: 'dha-karachi',
      city: 'Karachi',
      areaDescription: 'Khayaban-e-Shahbaz, Bukhari Commercial, Muslim & Badar Commercial',
      centerLatitude: 24.8100,
      centerLongitude: 67.0600,
      radiusKm: 5.0,
      deliveryBaseFee: 70,
      crossCommunityBaseFee: 140,
      isActive: true,
    },
  });

  const clifton = await prisma.community.upsert({
    where: { slug: 'clifton' },
    update: {
      name: 'Clifton',
      city: 'Karachi',
      areaDescription: 'Blocks 2, 4, 5, Boat Basin, Sea View, and Bilawal House zone',
      centerLatitude: 24.8250,
      centerLongitude: 67.0300,
      radiusKm: 4.0,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 130,
      isActive: true,
    },
    create: {
      name: 'Clifton',
      slug: 'clifton',
      city: 'Karachi',
      areaDescription: 'Blocks 2, 4, 5, Boat Basin, Sea View, and Bilawal House zone',
      centerLatitude: 24.8250,
      centerLongitude: 67.0300,
      radiusKm: 4.0,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 130,
      isActive: true,
    },
  });

  const pechs = await prisma.community.upsert({
    where: { slug: 'pechs' },
    update: {
      name: 'PECHS',
      city: 'Karachi',
      areaDescription: 'Blocks 2 & 6, Tariq Road, Khalid Bin Walid Road, and Kashmir Road',
      centerLatitude: 24.8700,
      centerLongitude: 67.0600,
      radiusKm: 3.5,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 110,
      isActive: true,
    },
    create: {
      name: 'PECHS',
      slug: 'pechs',
      city: 'Karachi',
      areaDescription: 'Blocks 2 & 6, Tariq Road, Khalid Bin Walid Road, and Kashmir Road',
      centerLatitude: 24.8700,
      centerLongitude: 67.0600,
      radiusKm: 3.5,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 110,
      isActive: true,
    },
  });

  const northNazimabad = await prisma.community.upsert({
    where: { slug: 'north-nazimabad' },
    update: {
      name: 'North Nazimabad',
      city: 'Karachi',
      areaDescription: 'Blocks B, H, J, Five Star Chowrangi, and Hyderi Market zone',
      centerLatitude: 24.9350,
      centerLongitude: 67.0400,
      radiusKm: 4.0,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
    create: {
      name: 'North Nazimabad',
      slug: 'north-nazimabad',
      city: 'Karachi',
      areaDescription: 'Blocks B, H, J, Five Star Chowrangi, and Hyderi Market zone',
      centerLatitude: 24.9350,
      centerLongitude: 67.0400,
      radiusKm: 4.0,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
  });

  const askari4 = await prisma.community.upsert({
    where: { slug: 'askari-4' },
    update: {
      name: 'Askari 4 & Malir Cantt',
      city: 'Karachi',
      areaDescription: 'Askari 4 gated community, COD, Rashid Minhas Road & Cantt',
      centerLatitude: 24.9050,
      centerLongitude: 67.1400,
      radiusKm: 4.5,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 130,
      isActive: true,
    },
    create: {
      name: 'Askari 4 & Malir Cantt',
      slug: 'askari-4',
      city: 'Karachi',
      areaDescription: 'Askari 4 gated community, COD, Rashid Minhas Road & Cantt',
      centerLatitude: 24.9050,
      centerLongitude: 67.1400,
      radiusKm: 4.5,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 130,
      isActive: true,
    },
  });

  const bahriaTown = await prisma.community.upsert({
    where: { slug: 'bahria-town-karachi' },
    update: {
      name: 'Bahria Town Karachi',
      city: 'Karachi',
      areaDescription: 'Precinct 1, 10, 19, Midway Commercial, and Grand Jamia zone',
      centerLatitude: 25.0100,
      centerLongitude: 67.3100,
      radiusKm: 6.0,
      deliveryBaseFee: 80,
      crossCommunityBaseFee: 180,
      isActive: true,
    },
    create: {
      name: 'Bahria Town Karachi',
      slug: 'bahria-town-karachi',
      city: 'Karachi',
      areaDescription: 'Precinct 1, 10, 19, Midway Commercial, and Grand Jamia zone',
      centerLatitude: 25.0100,
      centerLongitude: 67.3100,
      radiusKm: 6.0,
      deliveryBaseFee: 80,
      crossCommunityBaseFee: 180,
      isActive: true,
    },
  });

  // 2. Preserve Lahore Communities
  const askari11 = await prisma.community.upsert({
    where: { slug: 'askari-11' },
    update: {
      name: 'Askari 11',
      city: 'Lahore',
      areaDescription: 'Askari 11 gated community, Sector A, B, C & Bedian Road',
      centerLatitude: 31.4720,
      centerLongitude: 74.4530,
      radiusKm: 3.5,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
    create: {
      name: 'Askari 11',
      slug: 'askari-11',
      city: 'Lahore',
      areaDescription: 'Askari 11 gated community, Sector A, B, C & Bedian Road',
      centerLatitude: 31.4720,
      centerLongitude: 74.4530,
      radiusKm: 3.5,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
  });

  const askari10 = await prisma.community.upsert({
    where: { slug: 'askari-10' },
    update: {
      name: 'Askari 10',
      city: 'Lahore',
      areaDescription: 'Askari 10 Sector 1 & 2 near Airport Road',
      centerLatitude: 31.4880,
      centerLongitude: 74.4360,
      radiusKm: 3.0,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
    create: {
      name: 'Askari 10',
      slug: 'askari-10',
      city: 'Lahore',
      areaDescription: 'Askari 10 Sector 1 & 2 near Airport Road',
      centerLatitude: 31.4880,
      centerLongitude: 74.4360,
      radiusKm: 3.0,
      deliveryBaseFee: 50,
      crossCommunityBaseFee: 120,
      isActive: true,
    },
  });

  const dha6 = await prisma.community.upsert({
    where: { slug: 'dha-phase-6' },
    update: {
      name: 'DHA Phase 6',
      city: 'Lahore',
      areaDescription: 'DHA Phase 6 Main Blvd, Raya Fairways & Commercial Broadway',
      centerLatitude: 31.4650,
      centerLongitude: 74.4300,
      radiusKm: 4.5,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 150,
      isActive: true,
    },
    create: {
      name: 'DHA Phase 6',
      slug: 'dha-phase-6',
      city: 'Lahore',
      areaDescription: 'DHA Phase 6 Main Blvd, Raya Fairways & Commercial Broadway',
      centerLatitude: 31.4650,
      centerLongitude: 74.4300,
      radiusKm: 4.5,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 150,
      isActive: true,
    },
  });

  const dha5 = await prisma.community.upsert({
    where: { slug: 'dha-phase-5' },
    update: {
      name: 'DHA Phase 5',
      city: 'Lahore',
      areaDescription: 'DHA Phase 5 Sectors A-K, Ring Road exit',
      centerLatitude: 31.4700,
      centerLongitude: 74.4000,
      radiusKm: 4.0,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 150,
      isActive: true,
    },
    create: {
      name: 'DHA Phase 5',
      slug: 'dha-phase-5',
      city: 'Lahore',
      areaDescription: 'DHA Phase 5 Sectors A-K, Ring Road exit',
      centerLatitude: 31.4700,
      centerLongitude: 74.4000,
      radiusKm: 4.0,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 150,
      isActive: true,
    },
  });

  const dha9Town = await prisma.community.upsert({
    where: { slug: 'dha-9-town' },
    update: {
      name: 'DHA 9 Town',
      city: 'Lahore',
      areaDescription: 'DHA 9 Town (Shuhada Sectors A-E), Bedian Road Link',
      centerLatitude: 31.4420,
      centerLongitude: 74.4550,
      radiusKm: 3.5,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 150,
      isActive: true,
    },
    create: {
      name: 'DHA 9 Town',
      slug: 'dha-9-town',
      city: 'Lahore',
      areaDescription: 'DHA 9 Town (Shuhada Sectors A-E), Bedian Road Link',
      centerLatitude: 31.4420,
      centerLongitude: 74.4550,
      radiusKm: 3.5,
      deliveryBaseFee: 60,
      crossCommunityBaseFee: 150,
      isActive: true,
    },
  });

  // 3. Connect Community Graph (Neighbors)
  // Karachi graph
  await prisma.community.update({
    where: { id: gulshan.id },
    data: { neighborCommunityIds: [pechs.id, northNazimabad.id, askari4.id] },
  });
  await prisma.community.update({
    where: { id: dhaKarachi.id },
    data: { neighborCommunityIds: [clifton.id, pechs.id] },
  });
  await prisma.community.update({
    where: { id: clifton.id },
    data: { neighborCommunityIds: [dhaKarachi.id, pechs.id] },
  });
  await prisma.community.update({
    where: { id: pechs.id },
    data: { neighborCommunityIds: [gulshan.id, clifton.id, dhaKarachi.id] },
  });
  await prisma.community.update({
    where: { id: northNazimabad.id },
    data: { neighborCommunityIds: [gulshan.id] },
  });
  await prisma.community.update({
    where: { id: askari4.id },
    data: { neighborCommunityIds: [gulshan.id, bahriaTown.id] },
  });
  await prisma.community.update({
    where: { id: bahriaTown.id },
    data: { neighborCommunityIds: [askari4.id] },
  });

  // Lahore graph
  await prisma.community.update({
    where: { id: askari11.id },
    data: { neighborCommunityIds: [askari10.id, dha6.id, dha9Town.id] },
  });
  await prisma.community.update({
    where: { id: askari10.id },
    data: { neighborCommunityIds: [askari11.id, dha6.id] },
  });
  await prisma.community.update({
    where: { id: dha6.id },
    data: { neighborCommunityIds: [askari11.id, askari10.id, dha5.id, dha9Town.id] },
  });
  await prisma.community.update({
    where: { id: dha5.id },
    data: { neighborCommunityIds: [dha6.id, askari11.id] },
  });
  await prisma.community.update({
    where: { id: dha9Town.id },
    data: { neighborCommunityIds: [askari11.id, dha6.id] },
  });

  console.log(`✅ Seeded authentic Karachi & Lahore communities graph!`);
}

if (require.main === module) {
  seedCommunities()
    .then(() => prisma.$disconnect())
    .catch((err) => {
      console.error(err);
      prisma.$disconnect();
      process.exit(1);
    });
}
