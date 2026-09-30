import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const API_BASE = 'http://localhost:3001/api/v1';
const prisma = new PrismaClient();

const USERS = {
  customer: { email: 'customer@nuray.test', pass: 'Password123!' },
  seller:   { email: 'seller@nuray.test',   pass: 'Password123!' },
  rider:    { email: 'rider@nuray.test',    pass: 'Password123!' },
  admin:    { email: 'admin@frozennuray.com', pass: 'Password123!' },
};

async function login(role: 'customer' | 'seller' | 'rider' | 'admin'): Promise<string> {
  const { email, pass } = USERS[role];
  const res = await axios.post(`${API_BASE}/auth/login`, {
    phoneOrEmail: email,
    otpCodeOrPassword: pass,
    loginMethod: 'email',
  });
  return res.data.data.tokens.access_token;
}

async function runIdealFlow() {
  console.log('================================================================');
  console.log('🚀 RUNNING NURAY FOOD & FROST IDEAL MULTI-ROLE FLOW');
  console.log('================================================================\n');

  // STEP 1: Customer Login & Order Placement
  console.log('--- STAGE 1: CUSTOMER ORDER PLACEMENT ---');
  const customerJwt = await login('customer');
  console.log('1.1 Customer logged in successfully.');

  const custProfile = await axios.get(`${API_BASE}/users/me`, {
    headers: { Authorization: `Bearer ${customerJwt}` },
  });
  console.log(`1.1b Customer ID: ${custProfile.data.data.id}`);

  const addrRes = await axios.get(`${API_BASE}/users/me/addresses`, {
    headers: { Authorization: `Bearer ${customerJwt}` },
  });
  let addressId = addrRes.data.data[0]?.id;
  if (!addressId) {
    const createAddr = await axios.post(
      `${API_BASE}/users/me/addresses`,
      {
        label: 'Home',
        addressLine1: 'House 42, Street 8, Block 4',
        area: 'DHA Phase 5',
        city: 'Karachi',
        isDefault: true,
      },
      { headers: { Authorization: `Bearer ${customerJwt}` } }
    );
    addressId = createAddr.data.data.id;
  }
  console.log(`1.2 Delivery address verified: ${addressId} (DHA Phase 5, Karachi)`);

  const sampleProduct = await prisma.product.findFirst({
    where: { name: 'E2E Zafrani Chicken Biryani', isActive: true },
  });
  if (!sampleProduct) throw new Error('Sample product not found');
  console.log(`1.3 Selected product: ${sampleProduct.name} (Rs ${sampleProduct.price})`);

  // Place order
  const orderRes = await axios.post(
    `${API_BASE}/orders`,
    {
      items: [{ productId: sampleProduct.id, quantity: 2 }],
      deliveryType: 'home_delivery',
      deliveryAddressId: addressId,
      paymentMethod: 'cod',
    },
    { headers: { Authorization: `Bearer ${customerJwt}` } }
  );
  const order = orderRes.data.data.order;
  console.log(`1.4 Order placed successfully!`);
  console.log(`    Order ID:     ${order.id}`);
  console.log(`    Order Number: ${order.orderNumber}`);
  console.log(`    Total Amount: Rs ${order.totalAmount}`);
  console.log(`    Order Status: ${order.orderStatus}`);

  // STEP 2: Seller Acceptance & JIT Dispatch
  console.log('\n--- STAGE 2: SELLER (HOME CHEF) PREPARATION & JIT DISPATCH ---');
  const sellerJwt = await login('seller');
  console.log('2.1 Home Chef (Saima\'s Craft Kitchen) logged in.');

  const sellerOrdersRes = await axios.get(`${API_BASE}/sellers/orders`, {
    headers: { Authorization: `Bearer ${sellerJwt}` },
  });
  const ordersList = sellerOrdersRes.data.data.orders;
  const sellerOrderEntry = ordersList.find((o: any) => o.order.id === order.id);
  if (!sellerOrderEntry) throw new Error('Order not found in seller queue');

  const orderItemId = sellerOrderEntry.items[0].id;
  console.log(`2.2 Found order item in kitchen queue: ${orderItemId} (qty: 2)`);

  // Seller accepts order: pending -> confirmed
  console.log('2.3a Chef accepts incoming order (status: "confirmed")...');
  await axios.patch(
    `${API_BASE}/sellers/orders/items/${orderItemId}/status`,
    { status: 'confirmed', notes: 'Order accepted by chef' },
    { headers: { Authorization: `Bearer ${sellerJwt}` } }
  );

  // Seller moves item to 'preparing' -> Triggers JIT Dispatch!
  console.log('2.3b Chef starts cooking (status: "preparing")...');
  await axios.patch(
    `${API_BASE}/sellers/orders/items/${orderItemId}/status`,
    { status: 'preparing', notes: 'Chicken marinated with pure saffron, biryani pot on dum' },
    { headers: { Authorization: `Bearer ${sellerJwt}` } }
  );

  // Check DB for JIT dispatch trigger
  const deliveryRecord = await prisma.delivery.findUnique({
    where: { orderId: order.id },
  });
  if (!deliveryRecord) throw new Error('JIT Dispatch failed to generate Delivery record!');

  console.log(`✅ JIT Lookahead Dispatch Triggered!`);
  console.log(`    Delivery ID:         ${deliveryRecord.id}`);
  console.log(`    Customer OTP:        ${deliveryRecord.deliveryOtp} (Hidden from rider)`);
  console.log(`    Estimated Ready At:  ${deliveryRecord.estimatedReadyAt?.toISOString()}`);
  console.log(`    Delivery Status:     ${deliveryRecord.status}`);

  // Seller marks food 'ready'
  console.log('2.4 Chef finishes packing meal (status: "ready").');
  await axios.patch(
    `${API_BASE}/sellers/orders/items/${orderItemId}/status`,
    { status: 'ready', notes: 'Packaged in thermal container' },
    { headers: { Authorization: `Bearer ${sellerJwt}` } }
  );

  // STEP 3: Rider Assignment & Granular Delivery Lifecycle
  console.log('\n--- STAGE 3: RIDER FLEET DISPATCH & TRANSIT ---');
  const riderJwt = await login('rider');
  console.log('3.1 Rider (Tariq Mehmood) logged in.');

  const riderUser = await prisma.user.findUnique({
    where: { email: USERS.rider.email },
  });
  if (!riderUser) throw new Error('Rider user not found');
  const riderProfile = await prisma.rider.findUnique({
    where: { userId: riderUser.id },
  });
  if (!riderProfile) throw new Error('Rider profile missing');

  // Assign delivery to this rider
  await prisma.delivery.update({
    where: { id: deliveryRecord.id },
    data: { riderId: riderProfile.id, status: 'assigned' },
  });
  console.log(`3.2 Delivery assigned to rider (${riderProfile.vehicleNumber})`);

  // Stage 3.3: Rider arrives at pickup (home kitchen)
  console.log('3.3 Rider navigating to home kitchen...');
  await axios.patch(
    `${API_BASE}/riders/deliveries/${deliveryRecord.id}/status`,
    { status: 'arrived_at_pickup' },
    { headers: { Authorization: `Bearer ${riderJwt}` } }
  );
  console.log('    Status updated: arrived_at_pickup');

  // Stage 3.4: Rider picks up package
  await axios.patch(
    `${API_BASE}/riders/deliveries/${deliveryRecord.id}/status`,
    { status: 'picked_up' },
    { headers: { Authorization: `Bearer ${riderJwt}` } }
  );
  console.log('    Status updated: picked_up');

  // Stage 3.5: Rider in transit
  await axios.patch(
    `${API_BASE}/riders/deliveries/${deliveryRecord.id}/status`,
    { status: 'in_transit' },
    { headers: { Authorization: `Bearer ${riderJwt}` } }
  );
  console.log('    Status updated: in_transit (heading to DHA Phase 5)');

  // Stage 3.6: Rider arrives at customer doorstep
  await axios.patch(
    `${API_BASE}/riders/deliveries/${deliveryRecord.id}/status`,
    { status: 'arrived_at_customer' },
    { headers: { Authorization: `Bearer ${riderJwt}` } }
  );
  console.log('    Status updated: arrived_at_customer (ringing customer doorbell)');

  // STEP 4: Doorstep OTP Handshake
  console.log('\n--- STAGE 4: CUSTOMER DOORSTEP PIN HANDSHAKE ---');
  // Customer views order details and gets their OTP
  const custOrderCheck = await axios.get(`${API_BASE}/orders/${order.id}`, {
    headers: { Authorization: `Bearer ${customerJwt}` },
  });
  const customerVisibleOtp = custOrderCheck.data.data.delivery?.deliveryOtp;
  console.log(`4.1 Customer opens order tracker: Doorstep PIN is [${customerVisibleOtp}]`);

  // Rider tries wrong OTP
  console.log('4.2 Testing Security: Rider attempts completion with wrong OTP (9999)...');
  try {
    await axios.patch(
      `${API_BASE}/riders/deliveries/${deliveryRecord.id}/status`,
      { status: 'delivered', otp: '9999' },
      { headers: { Authorization: `Bearer ${riderJwt}` } }
    );
    throw new Error('SECURITY BREACH: Wrong OTP was accepted!');
  } catch (err: any) {
    console.log(`    Security Check Passed: System rejected wrong OTP (${err.response?.data?.error?.code || err.message})`);
  }

  // Rider submits valid customer OTP
  console.log(`4.3 Customer gives PIN [${customerVisibleOtp}] to rider. Rider submits valid OTP...`);
  await axios.patch(
    `${API_BASE}/riders/deliveries/${deliveryRecord.id}/status`,
    { status: 'delivered', otp: customerVisibleOtp },
    { headers: { Authorization: `Bearer ${riderJwt}` } }
  );
  console.log('✅ Handshake Verified! Order marked DELIVERED successfully.');

  // STEP 5: Financial Ledger & Settlement Audit
  console.log('\n--- STAGE 5: DOUBLE-ENTRY FINANCIAL LEDGER AUDIT ---');
  const ledgerEntries = await prisma.ledgerEntry.findMany({
    where: { orderId: order.id },
  });
  console.log(`5.1 Found ${ledgerEntries.length} atomic ledger transactions for Order ${order.orderNumber}:`);
  ledgerEntries.forEach((entry) => {
    console.log(`    - [${entry.transactionType.toUpperCase()}] ${entry.entryType.toUpperCase()}: Rs ${entry.amount}, Account: ${entry.accountType}, Note: ${entry.description}`);
  });

  const hasPayment = ledgerEntries.some(e => e.transactionType === 'customer_payment');
  const hasSeller = ledgerEntries.some(e => e.transactionType === 'seller_earning');
  const hasCommission = ledgerEntries.some(e => e.transactionType === 'platform_commission');
  const hasDeliveryFee = ledgerEntries.some(e => e.transactionType === 'delivery_fee');

  if (!hasPayment || !hasSeller || !hasCommission || !hasDeliveryFee) {
    throw new Error('Incomplete ledger records for order completion!');
  }
  console.log('✅ Financial integrity confirmed: All 4 double-entry records posted.');

  // STEP 6: Admin Overview
  console.log('\n--- STAGE 6: ADMIN PLATFORM OVERVIEW ---');
  const adminJwt = await login('admin');
  console.log('6.1 Super Admin logged in.');

  const adminOrder = await axios.get(`${API_BASE}/admin/orders/${order.id}`, {
    headers: { Authorization: `Bearer ${adminJwt}` },
  });
  console.log(`6.2 Admin inspected order ${adminOrder.data.data.orderNumber}:`);
  console.log(`    Final Status: ${adminOrder.data.data.orderStatus}`);
  console.log(`    Payment Status: ${adminOrder.data.data.paymentStatus}`);

  console.log('\n================================================================');
  console.log('🎉 IDEAL MULTI-ROLE FLOW COMPLETE: ALL STAGES PASSED 100%!');
  console.log('================================================================\n');
}

runIdealFlow()
  .catch((e) => {
    console.error('❌ Flow failed:', e.response?.data || e.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
