/**
 * Script to update existing categories with productType field
 * This assigns product types to parent categories based on their names
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Define which categories belong to which product type
const frozenCategories = [
  'Frozen Parathas',
  'Frozen Rolls & Samosas',
  'Frozen Ready Meals',
  'Frozen Kababs & Tikkas',
  'Frozen Snacks',
  'Ice Cream & Desserts',
  'Frozen Breads',
  'Frozen Seafood',
];

const freshCategories = [
  'Home Cooked Meals',
  'Fresh Salads',
  'Daily Sabzi',
  'Fresh Rotis & Naan',
  'Karahi & BBQ',
  'Fresh Desserts',
  'Fresh Snacks',
  'Beverages',
];

const readyToEatCategories = [
  // Add any ready-to-eat specific categories here
];

const readyToCookCategories = [
  // Add any ready-to-cook specific categories here
];

async function updateCategoryProductTypes() {
  console.log('🔄 Starting category product type update...\n');

  try {
    // Get all parent categories (categories without parentId)
    const parentCategories = await prisma.category.findMany({
      where: { parentId: null },
    });

    console.log(`📦 Found ${parentCategories.length} parent categories\n`);

    let updatedCount = 0;

    for (const category of parentCategories) {
      let productType = null;

      // Check which list the category belongs to
      if (frozenCategories.some(name => category.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(category.name.toLowerCase()))) {
        productType = 'frozen';
      } else if (freshCategories.some(name => category.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(category.name.toLowerCase()))) {
        productType = 'fresh';
      } else if (readyToEatCategories.some(name => category.name.toLowerCase().includes(name.toLowerCase()))) {
        productType = 'ready_to_eat';
      } else if (readyToCookCategories.some(name => category.name.toLowerCase().includes(name.toLowerCase()))) {
        productType = 'ready_to_cook';
      } else {
        // Default: check if name contains "frozen" or "fresh"
        if (category.name.toLowerCase().includes('frozen') || category.name.toLowerCase().includes('ice cream')) {
          productType = 'frozen';
        } else if (category.name.toLowerCase().includes('fresh') || category.name.toLowerCase().includes('daily') || category.name.toLowerCase().includes('home')) {
          productType = 'fresh';
        } else {
          // Default to frozen for backward compatibility
          productType = 'frozen';
        }
      }

      // Update the category
      await prisma.category.update({
        where: { id: category.id },
        data: { productType },
      });

      const icon = productType === 'frozen' ? '❄️' : productType === 'fresh' ? '🍳' : productType === 'ready_to_eat' ? '🍽️' : '🥘';
      console.log(`${icon} Updated: ${category.name} → ${productType}`);
      updatedCount++;
    }

    console.log(`\n✅ Successfully updated ${updatedCount} parent categories with product types!`);

    // Show summary
    const summary = await prisma.category.groupBy({
      by: ['productType'],
      where: { parentId: null },
      _count: true,
    });

    console.log('\n📊 Summary:');
    summary.forEach(item => {
      const icon = item.productType === 'frozen' ? '❄️' : item.productType === 'fresh' ? '🍳' : item.productType === 'ready_to_eat' ? '🍽️' : item.productType === 'ready_to_cook' ? '🥘' : '❓';
      console.log(`   ${icon} ${item.productType || 'null'}: ${item._count} categories`);
    });

  } catch (error) {
    console.error('❌ Error updating categories:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

updateCategoryProductTypes()
  .then(() => {
    console.log('\n🎉 Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
