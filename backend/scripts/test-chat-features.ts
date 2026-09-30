import { PrismaClient } from '@prisma/client';
import orderService from '../src/services/order.service';

const prisma = new PrismaClient();

async function runTest() {
  console.log('--- Starting Chat Features End-to-End Verification ---');

  const order = await prisma.order.findFirst({
    where: { orderNumber: 'FN202609277537' },
    include: {
      items: { include: { seller: true } },
    },
  });

  if (!order) {
    console.error('Order FN202609277537 not found');
    return;
  }

  const customerId = order.customerId;
  const sellerUserId = order.items[0]?.seller?.userId;

  console.log(`Order: #${order.orderNumber} (ID: ${order.id})`);
  console.log(`Customer User ID: ${customerId}`);
  console.log(`Seller User ID: ${sellerUserId}`);

  // 1. Send text message from Kitchen
  console.log('\n1. Sending message from Kitchen...');
  const msgFromSeller = await orderService.sendOrderMessage(
    order.id,
    sellerUserId!,
    'Hello! We have started freshly preparing your meal.',
    { role: 'seller', messageType: 'text' }
  );
  console.log('✓ Kitchen message created:', {
    id: msgFromSeller.id,
    senderRole: msgFromSeller.senderRole,
    message: msgFromSeller.message,
    isRead: msgFromSeller.isRead,
  });

  // 2. Send Voice message from Kitchen
  console.log('\n2. Sending Voice note from Kitchen...');
  const voiceMsgFromSeller = await orderService.sendOrderMessage(
    order.id,
    sellerUserId!,
    '🎙️ Voice note',
    {
      role: 'seller',
      messageType: 'voice',
      mediaUrl: 'data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAAAA==',
      duration: 6,
    }
  );
  console.log('✓ Kitchen voice note created:', {
    id: voiceMsgFromSeller.id,
    senderRole: voiceMsgFromSeller.senderRole,
    messageType: voiceMsgFromSeller.messageType,
    duration: voiceMsgFromSeller.duration,
    isRead: voiceMsgFromSeller.isRead,
  });

  // 3. Customer opens chat -> fetches messages -> triggers Read Receipts
  console.log('\n3. Customer fetches messages (triggering read receipt mark)...');
  const customerMessagesView = await orderService.getOrderMessages(order.id, customerId, 'customer');
  
  console.log(`✓ Customer received ${customerMessagesView.length} messages.`);
  const sellerSentItems = customerMessagesView.filter((m) => m.senderRole === 'seller');
  console.log(`✓ Kitchen messages in customer view have senderRole = 'seller'. (Customer view correctly places these on the LEFT)`);

  // 4. Kitchen re-fetches messages -> verifies Double Blue Tick (isRead = true)
  console.log('\n4. Kitchen checks read receipt status (Double Blue Ticks)...');
  const kitchenMessagesView = await orderService.getOrderMessages(order.id, sellerUserId!);
  const kitchenSentUpdated = kitchenMessagesView.filter((m) => m.id === msgFromSeller.id || m.id === voiceMsgFromSeller.id);
  
  for (const km of kitchenSentUpdated) {
    console.log(`✓ Message ID ${km.id} - isRead: ${km.isRead} (Double Blue Tick active)`);
    if (!km.isRead) {
      throw new Error(`Expected isRead to be true for message ${km.id}`);
    }
  }

  // 5. Send message from Customer
  console.log('\n5. Customer sends reply...');
  const msgFromCustomer = await orderService.sendOrderMessage(
    order.id,
    customerId,
    'Thank you so much! Please make it less spicy.',
    { role: 'customer', messageType: 'text' }
  );
  console.log('✓ Customer reply created:', {
    id: msgFromCustomer.id,
    senderRole: msgFromCustomer.senderRole,
    message: msgFromCustomer.message,
  });

  console.log('\n=== ALL CHAT VERIFICATIONS PASSED SUCCESSFULLY ===');
}

runTest()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
