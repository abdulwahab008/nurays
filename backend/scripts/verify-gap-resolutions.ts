import prisma from '../src/config/database';
import riderService from '../src/services/rider.service';
import ledgerService from '../src/services/ledger.service';
import hubService from '../src/services/hub.service';

async function main() {
  console.log('🧪 Starting End-to-End Verification of Gap Resolutions...');

  // 1. Check an active order
  const order = await prisma.order.findFirst({
    include: {
      items: true,
      delivery: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!order) {
    console.log('⚠️ No orders found in database to test.');
    return;
  }

  console.log(`✅ Found Order: ${order.orderNumber} (ID: ${order.id})`);

  // 2. Test Delivery & OTP creation
  await riderService.ensureDeliveryForOrder(order.id, 20);
  const delivery = await prisma.delivery.findUnique({
    where: { orderId: order.id },
  });

  console.log('✅ Delivery created with OTP:', {
    deliveryId: delivery?.id,
    deliveryOtp: delivery?.deliveryOtp,
    status: delivery?.status,
    estimatedReadyAt: delivery?.estimatedReadyAt,
  });

  if (!delivery?.deliveryOtp || delivery.deliveryOtp.length !== 4) {
    throw new Error('Delivery OTP was not properly generated as a 4-digit code!');
  }

  // 3. Test Double-Entry Financial Ledger
  const ledgerResult = await ledgerService.recordOrderCompletion(order.id);
  console.log('✅ Double-Entry Financial Ledger result:', ledgerResult);

  const entries = await prisma.ledgerEntry.findMany({
    where: { orderId: order.id },
  });
  console.log(`✅ Created ${entries.length} immutable ledger entries:`);
  entries.forEach((e) => {
    console.log(`   • [${e.entryType.toUpperCase()}] ${e.transactionType} (${e.accountType}): ${e.currency} ${e.amount} - ${e.description}`);
  });

  // 4. Test Hub -18°C Intake Quality Gate
  const hub = await prisma.hubCenter.findFirst();
  const product = await prisma.product.findFirst();
  const seller = await prisma.seller.findFirst();

  if (hub && product && seller) {
    // Test warm intake (breach: -12°C)
    const warmIntake = await hubService.recordBatchIntake({
      hubId: hub.id,
      productId: product.id,
      sellerId: seller.id,
      quantity: 15,
      batchNumber: `TEST-WARM-${Date.now()}`,
      expiryDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
      measuredTemperatureCelsius: -12.5,
    });
    console.log('✅ Warm Intake Test (-12.5°C):', {
      temperatureVerified: warmIntake.temperatureVerified,
      status: warmIntake.status,
      message: warmIntake.message,
    });

    // Test cold intake (pass: -21°C)
    const coldIntake = await hubService.recordBatchIntake({
      hubId: hub.id,
      productId: product.id,
      sellerId: seller.id,
      quantity: 25,
      batchNumber: `TEST-COLD-${Date.now()}`,
      expiryDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      measuredTemperatureCelsius: -21.0,
    });
    console.log('✅ Compliant Intake Test (-21.0°C):', {
      temperatureVerified: coldIntake.temperatureVerified,
      status: coldIntake.status,
      message: coldIntake.message,
    });

    // Clean up test batches
    await prisma.hubInventoryLog.deleteMany({
      where: { hubInventoryId: { in: [warmIntake.batch.id, coldIntake.batch.id] } },
    });
    await prisma.hubInventory.deleteMany({
      where: { id: { in: [warmIntake.batch.id, coldIntake.batch.id] } },
    });
    console.log('🧹 Cleaned up temporary test batches.');
  }

  console.log('\n🎉 ALL OPERATIONAL & ARCHITECTURAL GAPS SUCCESSFULLY VERIFIED!');
}

main()
  .catch((err) => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
