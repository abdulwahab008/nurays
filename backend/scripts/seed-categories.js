/**
 * Seed Script: Create Default Categories for Frozen Food Marketplace
 * 
 * Run with: node scripts/seed-categories.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const categories = [
  // Main Categories
  {
    name: 'Frozen Meats',
    nameUrdu: 'منجمد گوشت',
    slug: 'frozen-meats',
    iconUrl: '🥩',
    sortOrder: 1,
    isActive: true,
    children: [
      { name: 'Chicken', nameUrdu: 'مرغی', slug: 'chicken', iconUrl: '🐔', sortOrder: 1 },
      { name: 'Beef', nameUrdu: 'گائے کا گوشت', slug: 'beef', iconUrl: '🐄', sortOrder: 2 },
      { name: 'Mutton', nameUrdu: 'مٹن', slug: 'mutton', iconUrl: '🐑', sortOrder: 3 },
      { name: 'Fish & Seafood', nameUrdu: 'مچھلی اور سمندری غذا', slug: 'fish-seafood', iconUrl: '🐟', sortOrder: 4 },
    ]
  },
  {
    name: 'Ready to Cook',
    nameUrdu: 'پکانے کے لیے تیار',
    slug: 'ready-to-cook',
    iconUrl: '🍳',
    sortOrder: 2,
    isActive: true,
    children: [
      { name: 'Seekh Kabab', nameUrdu: 'سیخ کباب', slug: 'seekh-kabab', iconUrl: '🍢', sortOrder: 1 },
      { name: 'Chapli Kabab', nameUrdu: 'چپلی کباب', slug: 'chapli-kabab', iconUrl: '🥙', sortOrder: 2 },
      { name: 'Shami Kabab', nameUrdu: 'شامی کباب', slug: 'shami-kabab', iconUrl: '🍔', sortOrder: 3 },
      { name: 'Nuggets & Strips', nameUrdu: 'نگٹس اور سٹرپس', slug: 'nuggets-strips', iconUrl: '🍗', sortOrder: 4 },
      { name: 'Samosas & Rolls', nameUrdu: 'سموسے اور رول', slug: 'samosas-rolls', iconUrl: '🥟', sortOrder: 5 },
      { name: 'Burgers & Patties', nameUrdu: 'برگر اور پیٹیز', slug: 'burgers-patties', iconUrl: '🍔', sortOrder: 6 },
    ]
  },
  {
    name: 'Frozen Parathas',
    nameUrdu: 'منجمد پراٹھے',
    slug: 'frozen-parathas',
    iconUrl: '🫓',
    sortOrder: 3,
    isActive: true,
    children: [
      { name: 'Plain Paratha', nameUrdu: 'سادہ پراٹھا', slug: 'plain-paratha', iconUrl: '🫓', sortOrder: 1 },
      { name: 'Aloo Paratha', nameUrdu: 'آلو پراٹھا', slug: 'aloo-paratha', iconUrl: '🥔', sortOrder: 2 },
      { name: 'Keema Paratha', nameUrdu: 'قیمہ پراٹھا', slug: 'keema-paratha', iconUrl: '🥩', sortOrder: 3 },
      { name: 'Laccha Paratha', nameUrdu: 'لچھا پراٹھا', slug: 'laccha-paratha', iconUrl: '🫓', sortOrder: 4 },
    ]
  },
  {
    name: 'Frozen Vegetables',
    nameUrdu: 'منجمد سبزیاں',
    slug: 'frozen-vegetables',
    iconUrl: '🥦',
    sortOrder: 4,
    isActive: true,
    children: [
      { name: 'Mixed Vegetables', nameUrdu: 'مکس سبزیاں', slug: 'mixed-vegetables', iconUrl: '🥗', sortOrder: 1 },
      { name: 'Peas', nameUrdu: 'مٹر', slug: 'peas', iconUrl: '🟢', sortOrder: 2 },
      { name: 'Corn', nameUrdu: 'مکئی', slug: 'corn', iconUrl: '🌽', sortOrder: 3 },
      { name: 'French Fries', nameUrdu: 'فرینچ فرائز', slug: 'french-fries', iconUrl: '🍟', sortOrder: 4 },
    ]
  },
  {
    name: 'Ice Cream & Desserts',
    nameUrdu: 'آئس کریم اور میٹھے',
    slug: 'ice-cream-desserts',
    iconUrl: '🍦',
    sortOrder: 5,
    isActive: true,
    children: [
      { name: 'Ice Cream Tubs', nameUrdu: 'آئس کریم ٹب', slug: 'ice-cream-tubs', iconUrl: '🍨', sortOrder: 1 },
      { name: 'Ice Cream Bars', nameUrdu: 'آئس کریم بار', slug: 'ice-cream-bars', iconUrl: '🧊', sortOrder: 2 },
      { name: 'Frozen Cakes', nameUrdu: 'منجمد کیک', slug: 'frozen-cakes', iconUrl: '🎂', sortOrder: 3 },
      { name: 'Kulfi', nameUrdu: 'کلفی', slug: 'kulfi', iconUrl: '🍧', sortOrder: 4 },
    ]
  },
  {
    name: 'Frozen Snacks',
    nameUrdu: 'منجمد سنیکس',
    slug: 'frozen-snacks',
    iconUrl: '🍕',
    sortOrder: 6,
    isActive: true,
    children: [
      { name: 'Pizza', nameUrdu: 'پیزا', slug: 'pizza', iconUrl: '🍕', sortOrder: 1 },
      { name: 'Spring Rolls', nameUrdu: 'اسپرنگ رول', slug: 'spring-rolls', iconUrl: '🥢', sortOrder: 2 },
      { name: 'Momos & Dumplings', nameUrdu: 'موموز اور ڈمپلنگز', slug: 'momos-dumplings', iconUrl: '🥟', sortOrder: 3 },
      { name: 'Frozen Fries & Wedges', nameUrdu: 'منجمد فرائز', slug: 'frozen-fries-wedges', iconUrl: '🍟', sortOrder: 4 },
    ]
  },
  {
    name: 'Frozen Breads',
    nameUrdu: 'منجمد روٹیاں',
    slug: 'frozen-breads',
    iconUrl: '🍞',
    sortOrder: 7,
    isActive: true,
    children: [
      { name: 'Naan', nameUrdu: 'نان', slug: 'naan', iconUrl: '🫓', sortOrder: 1 },
      { name: 'Roti', nameUrdu: 'روٹی', slug: 'roti', iconUrl: '🫓', sortOrder: 2 },
      { name: 'Pita Bread', nameUrdu: 'پیٹا بریڈ', slug: 'pita-bread', iconUrl: '🥙', sortOrder: 3 },
    ]
  },
  {
    name: 'Dairy & Cheese',
    nameUrdu: 'دودھ اور پنیر',
    slug: 'dairy-cheese',
    iconUrl: '🧀',
    sortOrder: 8,
    isActive: true,
    children: [
      { name: 'Cheese Slices', nameUrdu: 'پنیر سلائسز', slug: 'cheese-slices', iconUrl: '🧀', sortOrder: 1 },
      { name: 'Butter', nameUrdu: 'مکھن', slug: 'butter', iconUrl: '🧈', sortOrder: 2 },
      { name: 'Frozen Yogurt', nameUrdu: 'منجمد دہی', slug: 'frozen-yogurt', iconUrl: '🥛', sortOrder: 3 },
    ]
  },
];

async function seedCategories() {
  console.log('🌱 Starting category seeding...\n');

  let totalCreated = 0;

  for (const category of categories) {
    try {
      // Check if parent category already exists
      const existingParent = await prisma.category.findUnique({
        where: { slug: category.slug }
      });

      let parentCategory;
      
      if (existingParent) {
        console.log(`⏭️  Category "${category.name}" already exists, skipping...`);
        parentCategory = existingParent;
      } else {
        // Create parent category
        parentCategory = await prisma.category.create({
          data: {
            name: category.name,
            nameUrdu: category.nameUrdu,
            slug: category.slug,
            iconUrl: category.iconUrl,
            sortOrder: category.sortOrder,
            isActive: category.isActive,
          }
        });
        console.log(`✅ Created parent category: ${category.name} ${category.iconUrl}`);
        totalCreated++;
      }

      // Create child categories
      if (category.children) {
        for (const child of category.children) {
          const existingChild = await prisma.category.findUnique({
            where: { slug: child.slug }
          });

          if (existingChild) {
            console.log(`   ⏭️  Subcategory "${child.name}" already exists, skipping...`);
          } else {
            await prisma.category.create({
              data: {
                name: child.name,
                nameUrdu: child.nameUrdu,
                slug: child.slug,
                iconUrl: child.iconUrl,
                sortOrder: child.sortOrder,
                isActive: true,
                parentId: parentCategory.id,
              }
            });
            console.log(`   ✅ Created subcategory: ${child.name} ${child.iconUrl}`);
            totalCreated++;
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error creating category ${category.name}:`, error.message);
    }
  }

  console.log(`\n🎉 Seeding complete! Created ${totalCreated} categories.`);
  
  // Display summary
  const allCategories = await prisma.category.findMany({
    include: { children: true },
    where: { parentId: null },
    orderBy: { sortOrder: 'asc' }
  });

  console.log('\n📋 Category Summary:');
  console.log('━'.repeat(50));
  
  for (const cat of allCategories) {
    console.log(`${cat.iconUrl} ${cat.name} (${cat.nameUrdu}) - ${cat.children.length} subcategories`);
  }
}

seedCategories()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
