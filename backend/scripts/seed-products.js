/**
 * Seed Script: Create Sample Products for Frozen Food Marketplace
 * 
 * Run with: node scripts/seed-products.js
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Sample Pakistani frozen food products
const sampleProducts = [
  {
    name: 'Chicken Seekh Kabab',
    nameUrdu: 'چکن سیخ کباب',
    description: 'Authentic Pakistani seekh kababs made with premium chicken mince, fresh herbs, and traditional spices. Perfect for BBQ or pan frying. Pack of 12 pieces.',
    descriptionUrdu: 'اصلی پاکستانی سیخ کباب پریمیم چکن قیمے، تازہ جڑی بوٹیوں اور روایتی مصالحوں سے بنائے گئے۔',
    price: 650,
    originalPrice: 750,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 500,
    stockQuantity: 50,
    ingredients: 'Chicken mince, onions, green chilies, coriander, mint, cumin, garam masala, salt',
    allergens: 'None',
    dietaryInfo: ['Halal', 'High Protein'],
    storageDays: 90,
    heatingInstructions: 'Grill on BBQ for 8-10 minutes or pan fry with oil for 5-7 minutes until golden brown.',
    categorySlug: 'ready-to-cook'
  },
  {
    name: 'Aloo Paratha',
    nameUrdu: 'آلو پراٹھا',
    description: 'Traditional Punjabi style aloo paratha stuffed with spiced mashed potatoes. Ready to heat on tawa. Pack of 6 parathas.',
    descriptionUrdu: 'روایتی پنجابی سٹائل آلو پراٹھا مسالے دار آلو سے بھرا ہوا۔',
    price: 350,
    originalPrice: 400,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 600,
    stockQuantity: 80,
    ingredients: 'Wheat flour, potatoes, onions, green chilies, cumin seeds, coriander, salt, ghee',
    allergens: 'Gluten, Dairy',
    dietaryInfo: ['Vegetarian'],
    storageDays: 60,
    heatingInstructions: 'Heat on tawa with ghee or butter for 2-3 minutes each side until crispy.',
    categorySlug: 'frozen-parathas'
  },
  {
    name: 'Chicken Samosa',
    nameUrdu: 'چکن سموسہ',
    description: 'Crispy homemade samosas filled with spiced chicken keema. Perfect tea-time snack. Pack of 12 samosas.',
    descriptionUrdu: 'کرسپی گھریلو سموسے مسالے دار چکن قیمے سے بھرے ہوئے۔',
    price: 450,
    originalPrice: 500,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 400,
    stockQuantity: 100,
    ingredients: 'Flour, chicken mince, onions, green peas, coriander, green chilies, ginger, garlic',
    allergens: 'Gluten',
    dietaryInfo: ['Halal'],
    storageDays: 90,
    heatingInstructions: 'Deep fry in hot oil at 180°C for 5-7 minutes until golden. Can also be air fried at 200°C for 12 minutes.',
    categorySlug: 'frozen-snacks'
  },
  {
    name: 'Mutton Chapli Kabab',
    nameUrdu: 'مٹن چپلی کباب',
    description: 'Authentic Peshawari chapli kababs made with fresh mutton, tomatoes, and aromatic spices. Pack of 8 kababs.',
    descriptionUrdu: 'اصلی پشاوری چپلی کباب تازہ مٹن، ٹماٹر اور خوشبودار مصالحوں سے بنائے گئے۔',
    price: 950,
    originalPrice: 1100,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 600,
    stockQuantity: 30,
    ingredients: 'Mutton mince, tomatoes, onions, pomegranate seeds, coriander seeds, cumin, dried coriander',
    allergens: 'None',
    dietaryInfo: ['Halal', 'High Protein'],
    storageDays: 60,
    heatingInstructions: 'Shallow fry in oil for 4-5 minutes each side. Serve with naan and chutney.',
    categorySlug: 'ready-to-cook'
  },
  {
    name: 'Keema Naan',
    nameUrdu: 'قیمہ نان',
    description: 'Soft naan bread stuffed with spiced beef keema. Ready to heat in oven or on tawa. Pack of 4 naans.',
    descriptionUrdu: 'نرم نان مسالے دار بیف قیمے سے بھرا ہوا۔',
    price: 400,
    originalPrice: 450,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 500,
    stockQuantity: 60,
    ingredients: 'Refined flour, beef mince, yogurt, onions, green chilies, coriander, cumin, salt',
    allergens: 'Gluten, Dairy',
    dietaryInfo: ['Halal'],
    storageDays: 45,
    heatingInstructions: 'Heat in preheated oven at 200°C for 8-10 minutes or on tawa for 3-4 minutes each side.',
    categorySlug: 'frozen-breads'
  },
  {
    name: 'Mixed Vegetable Spring Roll',
    nameUrdu: 'مکس سبزی سپرنگ رول',
    description: 'Crispy spring rolls filled with cabbage, carrots, and mixed vegetables with Chinese spices. Pack of 10 rolls.',
    descriptionUrdu: 'کرسپی سپرنگ رولز بند گوبھی، گاجر اور مکس سبزیوں سے بھرے ہوئے۔',
    price: 350,
    originalPrice: 400,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 350,
    stockQuantity: 75,
    ingredients: 'Spring roll wrapper, cabbage, carrots, capsicum, bean sprouts, soy sauce, ginger, garlic',
    allergens: 'Gluten, Soy',
    dietaryInfo: ['Vegetarian', 'Vegan'],
    storageDays: 90,
    heatingInstructions: 'Deep fry at 180°C for 4-5 minutes until golden. Air fry at 190°C for 10-12 minutes.',
    categorySlug: 'frozen-snacks'
  },
  {
    name: 'Chicken Tikka',
    nameUrdu: 'چکن ٹکہ',
    description: 'Marinated chicken tikka pieces in authentic tandoori spices. Ready to grill or bake. 500g pack.',
    descriptionUrdu: 'اصلی تندوری مصالحوں میں میرینیٹ چکن ٹکہ کے ٹکڑے۔',
    price: 550,
    originalPrice: 650,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 500,
    stockQuantity: 45,
    ingredients: 'Chicken breast, yogurt, tikka masala, red chili, ginger, garlic, lemon juice, oil',
    allergens: 'Dairy',
    dietaryInfo: ['Halal', 'High Protein', 'Low Carb'],
    storageDays: 60,
    heatingInstructions: 'Grill on BBQ for 12-15 minutes or bake at 220°C for 20 minutes. Baste with butter.',
    categorySlug: 'frozen-meats'
  },
  {
    name: 'Beef Shami Kabab',
    nameUrdu: 'بیف شامی کباب',
    description: 'Traditional shami kababs made with beef and chana dal. Soft and flavorful. Pack of 10 kababs.',
    descriptionUrdu: 'روایتی شامی کباب بیف اور چنے کی دال سے بنائے گئے۔',
    price: 500,
    originalPrice: 580,
    unit: 'pack',
    unitUrdu: 'پیکٹ',
    weightGrams: 400,
    stockQuantity: 55,
    ingredients: 'Beef, chana dal, onions, eggs, green chilies, ginger, garlic, garam masala, coriander',
    allergens: 'Eggs',
    dietaryInfo: ['Halal', 'High Protein'],
    storageDays: 90,
    heatingInstructions: 'Shallow fry in oil for 2-3 minutes each side until heated through and golden.',
    categorySlug: 'ready-to-cook'
  },
  {
    name: 'Frozen Mix Sabzi',
    nameUrdu: 'فروزن مکس سبزی',
    description: 'Ready-to-cook mixed vegetables including peas, carrots, beans, and corn. No preservatives added. 1kg pack.',
    descriptionUrdu: 'ریڈی ٹو کک مکس سبزیاں بشمول مٹر، گاجر، پھلیاں اور مکئی۔',
    price: 280,
    originalPrice: 320,
    unit: 'kg',
    unitUrdu: 'کلو',
    weightGrams: 1000,
    stockQuantity: 120,
    ingredients: 'Green peas, carrots, French beans, sweet corn, cauliflower florets',
    allergens: 'None',
    dietaryInfo: ['Vegetarian', 'Vegan', 'Gluten Free'],
    storageDays: 180,
    heatingInstructions: 'Add directly to cooking without thawing. Cook for 8-10 minutes with your choice of spices.',
    categorySlug: 'frozen-vegetables'
  },
  {
    name: 'Kulfi Stick - Malai Pista',
    nameUrdu: 'کلفی اسٹک - ملائی پستہ',
    description: 'Traditional Pakistani malai kulfi with crushed pistachios. Creamy and authentic taste. Box of 6 sticks.',
    descriptionUrdu: 'روایتی پاکستانی ملائی کلفی کچلے ہوئے پستے کے ساتھ۔',
    price: 450,
    originalPrice: 500,
    unit: 'box',
    unitUrdu: 'ڈبہ',
    weightGrams: 420,
    stockQuantity: 40,
    ingredients: 'Full cream milk, sugar, pistachios, cardamom, saffron, cornflour',
    allergens: 'Dairy, Nuts',
    dietaryInfo: ['Vegetarian'],
    storageDays: 120,
    heatingInstructions: 'Keep frozen. Remove from freezer 2-3 minutes before serving for best taste.',
    categorySlug: 'ice-cream-desserts'
  }
];

async function seedProducts() {
  console.log('🌱 Starting product seeding...\n');

  // Get the seller (assuming there's at least one seller)
  const seller = await prisma.seller.findFirst({
    where: { status: 'active' }
  });

  if (!seller) {
    console.log('❌ No active seller found. Please create a seller first.');
    await prisma.$disconnect();
    return;
  }

  console.log(`📦 Using seller: ${seller.businessName} (ID: ${seller.id})\n`);

  // Get all categories
  const categories = await prisma.category.findMany({
    where: { isActive: true }
  });

  const categoryMap = {};
  categories.forEach(cat => {
    categoryMap[cat.slug] = cat.id;
  });

  let created = 0;
  let skipped = 0;

  for (const product of sampleProducts) {
    // Generate slug from name
    const slug = product.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

    // Check if product already exists
    const existing = await prisma.product.findUnique({
      where: { slug }
    });

    if (existing) {
      console.log(`⏭️  Skipping "${product.name}" - already exists`);
      skipped++;
      continue;
    }

    // Get category ID
    const categoryId = categoryMap[product.categorySlug];
    if (!categoryId) {
      console.log(`⚠️  Category not found for "${product.name}" (${product.categorySlug})`);
      continue;
    }

    // Create product
    const createdProduct = await prisma.product.create({
      data: {
        sellerId: seller.id,
        categoryId: categoryId,
        name: product.name,
        nameUrdu: product.nameUrdu,
        slug: slug,
        description: product.description,
        descriptionUrdu: product.descriptionUrdu,
        price: product.price,
        originalPrice: product.originalPrice,
        unit: product.unit,
        unitUrdu: product.unitUrdu,
        weightGrams: product.weightGrams,
        ingredients: product.ingredients,
        allergens: product.allergens,
        dietaryInfo: product.dietaryInfo,
        storageDays: product.storageDays,
        heatingInstructions: product.heatingInstructions,
        stockQuantity: product.stockQuantity,
        stockType: 'direct',
        isActive: true,
        approvalStatus: 'approved'
      }
    });

    console.log(`✅ Created: ${product.name} (Rs. ${product.price})`);
    created++;
  }

  console.log(`\n🎉 Seeding complete!`);
  console.log(`   Created: ${created} products`);
  console.log(`   Skipped: ${skipped} products (already exist)`);

  // Show total products
  const totalProducts = await prisma.product.count();
  console.log(`\n📊 Total products in database: ${totalProducts}`);

  await prisma.$disconnect();
}

seedProducts()
  .catch((e) => {
    console.error('❌ Error seeding products:', e);
    prisma.$disconnect();
    process.exit(1);
  });
