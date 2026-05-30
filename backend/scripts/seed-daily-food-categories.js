// Seed script to add Daily Cooking & Fresh Food categories
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const newCategories = [
  {
    name: 'Home Cooked Meals',
    nameUrdu: 'گھر کا پکا کھانا',
    slug: 'home-cooked-meals',
    iconUrl: '🥘',
    sortOrder: 10,
    children: [
      { name: 'Biryani', nameUrdu: 'بریانی', slug: 'biryani', iconUrl: '🍚' },
      { name: 'Curries', nameUrdu: 'سالن', slug: 'curries', iconUrl: '🍛' },
      { name: 'Daal', nameUrdu: 'دال', slug: 'daal', iconUrl: '🥣' },
      { name: 'Nihari', nameUrdu: 'نہاری', slug: 'nihari', iconUrl: '🍲' },
      { name: 'Haleem', nameUrdu: 'حلیم', slug: 'haleem', iconUrl: '🥘' },
      { name: 'Pulao', nameUrdu: 'پلاؤ', slug: 'pulao', iconUrl: '🍚' },
    ]
  },
  {
    name: 'Fresh Salads',
    nameUrdu: 'تازہ سلاد',
    slug: 'fresh-salads',
    iconUrl: '🥗',
    sortOrder: 11,
    children: [
      { name: 'Fruit Salad', nameUrdu: 'پھلوں کا سلاد', slug: 'fruit-salad', iconUrl: '🍓' },
      { name: 'Russian Salad', nameUrdu: 'رشین سلاد', slug: 'russian-salad', iconUrl: '🥗' },
      { name: 'Vegetable Salad', nameUrdu: 'سبزی سلاد', slug: 'vegetable-salad', iconUrl: '🥬' },
      { name: 'Raita', nameUrdu: 'رائتہ', slug: 'raita', iconUrl: '🥛' },
      { name: 'Chutney', nameUrdu: 'چٹنی', slug: 'chutney', iconUrl: '🫙' },
    ]
  },
  {
    name: 'Daily Sabzi',
    nameUrdu: 'روزانہ سبزی',
    slug: 'daily-sabzi',
    iconUrl: '🥬',
    sortOrder: 12,
    children: [
      { name: 'Aloo Dishes', nameUrdu: 'آلو کے پکوان', slug: 'aloo-dishes', iconUrl: '🥔' },
      { name: 'Bhindi', nameUrdu: 'بھنڈی', slug: 'bhindi', iconUrl: '🥒' },
      { name: 'Gobhi', nameUrdu: 'گوبھی', slug: 'gobhi', iconUrl: '🥦' },
      { name: 'Palak', nameUrdu: 'پالک', slug: 'palak', iconUrl: '🥬' },
      { name: 'Mix Sabzi', nameUrdu: 'مکس سبزی', slug: 'mix-sabzi', iconUrl: '🥗' },
      { name: 'Baingan', nameUrdu: 'بینگن', slug: 'baingan', iconUrl: '🍆' },
    ]
  },
  {
    name: 'Fresh Rotis & Naan',
    nameUrdu: 'تازہ روٹی اور نان',
    slug: 'fresh-rotis-naan',
    iconUrl: '🫓',
    sortOrder: 13,
    children: [
      { name: 'Tandoori Roti', nameUrdu: 'تندوری روٹی', slug: 'tandoori-roti', iconUrl: '🫓' },
      { name: 'Fresh Naan', nameUrdu: 'تازہ نان', slug: 'fresh-naan', iconUrl: '🥖' },
      { name: 'Chapati', nameUrdu: 'چپاتی', slug: 'chapati', iconUrl: '🫓' },
      { name: 'Paratha', nameUrdu: 'پراٹھا', slug: 'fresh-paratha', iconUrl: '🥞' },
      { name: 'Kulcha', nameUrdu: 'کلچہ', slug: 'kulcha', iconUrl: '🥯' },
    ]
  },
  {
    name: 'Karahi & BBQ',
    nameUrdu: 'کڑاہی اور بی بی کیو',
    slug: 'karahi-bbq',
    iconUrl: '🍗',
    sortOrder: 14,
    children: [
      { name: 'Chicken Karahi', nameUrdu: 'چکن کڑاہی', slug: 'chicken-karahi', iconUrl: '🍗' },
      { name: 'Mutton Karahi', nameUrdu: 'مٹن کڑاہی', slug: 'mutton-karahi', iconUrl: '🥩' },
      { name: 'Tikka', nameUrdu: 'ٹکہ', slug: 'tikka', iconUrl: '🍢' },
      { name: 'Boti', nameUrdu: 'بوٹی', slug: 'boti', iconUrl: '🥓' },
      { name: 'Seekh Kabab Fresh', nameUrdu: 'سیخ کباب', slug: 'seekh-kabab-fresh', iconUrl: '🍡' },
      { name: 'Malai Boti', nameUrdu: 'ملائی بوٹی', slug: 'malai-boti', iconUrl: '🍖' },
    ]
  },
  {
    name: 'Fresh Desserts',
    nameUrdu: 'تازہ میٹھے',
    slug: 'fresh-desserts',
    iconUrl: '🍮',
    sortOrder: 15,
    children: [
      { name: 'Kheer', nameUrdu: 'کھیر', slug: 'kheer', iconUrl: '🍚' },
      { name: 'Gajar Halwa', nameUrdu: 'گاجر کا حلوہ', slug: 'gajar-halwa', iconUrl: '🥕' },
      { name: 'Suji Halwa', nameUrdu: 'سوجی کا حلوہ', slug: 'suji-halwa', iconUrl: '🍮' },
      { name: 'Falooda', nameUrdu: 'فالودہ', slug: 'falooda', iconUrl: '🍨' },
      { name: 'Zarda', nameUrdu: 'زردہ', slug: 'zarda', iconUrl: '🍚' },
      { name: 'Sheer Khurma', nameUrdu: 'شیر خرما', slug: 'sheer-khurma', iconUrl: '🥛' },
    ]
  },
  {
    name: 'Fresh Snacks',
    nameUrdu: 'تازہ ناشتہ',
    slug: 'fresh-snacks',
    iconUrl: '🧆',
    sortOrder: 16,
    children: [
      { name: 'Fresh Samosa', nameUrdu: 'تازہ سموسہ', slug: 'fresh-samosa', iconUrl: '🥟' },
      { name: 'Pakora', nameUrdu: 'پکوڑے', slug: 'pakora', iconUrl: '🧆' },
      { name: 'Chaat', nameUrdu: 'چاٹ', slug: 'chaat', iconUrl: '🥗' },
      { name: 'Dahi Bhalla', nameUrdu: 'دہی بھلے', slug: 'dahi-bhalla', iconUrl: '🥣' },
      { name: 'Aloo Tikki', nameUrdu: 'آلو ٹکی', slug: 'aloo-tikki', iconUrl: '🥔' },
      { name: 'Gol Gappay', nameUrdu: 'گول گپے', slug: 'gol-gappay', iconUrl: '🫓' },
    ]
  },
  {
    name: 'Beverages',
    nameUrdu: 'مشروبات',
    slug: 'beverages',
    iconUrl: '🥤',
    sortOrder: 17,
    children: [
      { name: 'Lassi', nameUrdu: 'لسی', slug: 'lassi', iconUrl: '🥛' },
      { name: 'Fresh Juice', nameUrdu: 'تازہ جوس', slug: 'fresh-juice', iconUrl: '🧃' },
      { name: 'Sharbat', nameUrdu: 'شربت', slug: 'sharbat', iconUrl: '🍹' },
      { name: 'Doodh Patti', nameUrdu: 'دودھ پتی', slug: 'doodh-patti', iconUrl: '🍵' },
      { name: 'Kashmiri Chai', nameUrdu: 'کشمیری چائے', slug: 'kashmiri-chai', iconUrl: '🫖' },
    ]
  },
];

async function seedCategories() {
  console.log('🚀 Starting to seed daily food categories...\n');

  for (const category of newCategories) {
    try {
      // Check if parent category already exists
      const existingParent = await prisma.category.findUnique({
        where: { slug: category.slug }
      });

      let parentId;
      
      if (existingParent) {
        console.log(`⚠️  Category "${category.name}" already exists, skipping...`);
        parentId = existingParent.id;
      } else {
        // Create parent category
        const parent = await prisma.category.create({
          data: {
            name: category.name,
            nameUrdu: category.nameUrdu,
            slug: category.slug,
            iconUrl: category.iconUrl,
            sortOrder: category.sortOrder,
            isActive: true,
          }
        });
        parentId = parent.id;
        console.log(`✅ Created category: ${category.iconUrl} ${category.name}`);
      }

      // Create children
      if (category.children && category.children.length > 0) {
        for (const child of category.children) {
          const existingChild = await prisma.category.findUnique({
            where: { slug: child.slug }
          });

          if (existingChild) {
            console.log(`   ⚠️  Subcategory "${child.name}" already exists`);
          } else {
            await prisma.category.create({
              data: {
                name: child.name,
                nameUrdu: child.nameUrdu,
                slug: child.slug,
                iconUrl: child.iconUrl,
                parentId: parentId,
                sortOrder: category.children.indexOf(child) + 1,
                isActive: true,
              }
            });
            console.log(`   ✅ Created subcategory: ${child.iconUrl} ${child.name}`);
          }
        }
      }
    } catch (error) {
      console.error(`❌ Error creating category ${category.name}:`, error.message);
    }
  }

  console.log('\n🎉 Daily food categories seeding complete!');
  
  // Show summary
  const totalCategories = await prisma.category.count();
  const parentCategories = await prisma.category.count({ where: { parentId: null } });
  console.log(`\n📊 Summary:`);
  console.log(`   Total categories: ${totalCategories}`);
  console.log(`   Parent categories: ${parentCategories}`);
  console.log(`   Subcategories: ${totalCategories - parentCategories}`);
}

seedCategories()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
