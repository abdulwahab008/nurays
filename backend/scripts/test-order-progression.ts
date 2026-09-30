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

async function main() {
  const action = process.argv[2] || 'create';
  const orderIdArg = process.argv[3];

  if (action === 'create') {
    const customerJwt = await login('customer');
    const addrRes = await axios.get(`${API_BASE}/users/me/addresses`, {
      headers: { Authorization: `Bearer ${customerJwt}` },
    });
    const addressId = addrRes.data.data[0]?.id;

    const sampleProduct = await prisma.product.findFirst({
      where: { name: 'E2E Zafrani Chicken Biryani', isActive: true },
    });
    if (!sampleProduct) throw new Error('Product not found');

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
    console.log(JSON.stringify({
      step: 'order_created',
      orderId: order.id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
      status: order.orderStatus,
    }));
  } else if (action === 'kitchen_accept') {
    const sellerJwt = await login('seller');
    const sellerOrdersRes = await axios.get(`${API_BASE}/sellers/orders`, {
      headers: { Authorization: `Bearer ${sellerJwt}` },
    });
    const entry = sellerOrdersRes.data.data.orders.find((o: any) => o.order.id === orderIdArg);
    if (!entry) throw new Error('Order not found in seller queue');
    const itemId = entry.items[0].id;

    // Confirm
    await axios.patch(
      `${API_BASE}/sellers/orders/items/${itemId}/status`,
      { status: 'confirmed', notes: 'Chef accepted order' },
      { headers: { Authorization: `Bearer ${sellerJwt}` } }
    );
    // Prepare -> triggers JIT dispatch
    await axios.patch(
      `${API_BASE}/sellers/orders/items/${itemId}/status`,
      { status: 'preparing', notes: 'Cooking biryani on saffron dum' },
      { headers: { Authorization: `Bearer ${sellerJwt}` } }
    );

    const delivery = await prisma.delivery.findUnique({ where: { orderId: orderIdArg } });
    console.log(JSON.stringify({
      step: 'kitchen_preparing_jit_dispatched',
      orderId: orderIdArg,
      deliveryId: delivery?.id,
      otp: delivery?.deliveryOtp,
      estimatedReadyAt: delivery?.estimatedReadyAt,
    }));
  } else if (action === 'kitchen_ready_assign') {
    const sellerJwt = await login('seller');
    const sellerOrdersRes = await axios.get(`${API_BASE}/sellers/orders`, {
      headers: { Authorization: `Bearer ${sellerJwt}` },
    });
    const entry = sellerOrdersRes.data.data.orders.find((o: any) => o.order.id === orderIdArg);
    const itemId = entry.items[0].id;

    // Ready
    await axios.patch(
      `${API_BASE}/sellers/orders/items/${itemId}/status`,
      { status: 'ready', notes: 'Packaged in thermal container' },
      { headers: { Authorization: `Bearer ${sellerJwt}` } }
    );

    // Assign to rider
    const delivery = await prisma.delivery.findUnique({ where: { orderId: orderIdArg } });
    const riderUser = await prisma.user.findUnique({ where: { email: USERS.rider.email } });
    const riderProfile = await prisma.rider.findUnique({ where: { userId: riderUser!.id } });
    await prisma.delivery.update({
      where: { id: delivery!.id },
      data: { riderId: riderProfile!.id, status: 'assigned' },
    });

    console.log(JSON.stringify({
      step: 'kitchen_ready_assigned',
      orderId: orderIdArg,
      deliveryId: delivery?.id,
      riderId: riderProfile?.id,
    }));
  } else if (action === 'rider_transit') {
    const riderJwt = await login('rider');
    const delivery = await prisma.delivery.findUnique({ where: { orderId: orderIdArg } });
    if (!delivery) throw new Error('Delivery not found');

    await axios.patch(
      `${API_BASE}/riders/deliveries/${delivery.id}/status`,
      { status: 'arrived_at_pickup' },
      { headers: { Authorization: `Bearer ${riderJwt}` } }
    );
    await axios.patch(
      `${API_BASE}/riders/deliveries/${delivery.id}/status`,
      { status: 'picked_up' },
      { headers: { Authorization: `Bearer ${riderJwt}` } }
    );
    await axios.patch(
      `${API_BASE}/riders/deliveries/${delivery.id}/status`,
      { status: 'in_transit' },
      { headers: { Authorization: `Bearer ${riderJwt}` } }
    );
    await axios.patch(
      `${API_BASE}/riders/deliveries/${delivery.id}/status`,
      { status: 'arrived_at_customer' },
      { headers: { Authorization: `Bearer ${riderJwt}` } }
    );

    console.log(JSON.stringify({
      step: 'rider_at_customer_doorstep',
      orderId: orderIdArg,
      deliveryId: delivery.id,
      status: 'arrived_at_customer',
      customerOtp: delivery.deliveryOtp,
    }));
  } else if (action === 'handshake_complete') {
    const riderJwt = await login('rider');
    const delivery = await prisma.delivery.findUnique({ where: { orderId: orderIdArg } });
    if (!delivery) throw new Error('Delivery not found');

    await axios.patch(
      `${API_BASE}/riders/deliveries/${delivery.id}/status`,
      { status: 'delivered', otp: delivery.deliveryOtp },
      { headers: { Authorization: `Bearer ${riderJwt}` } }
    );

    const ledgerEntries = await prisma.ledgerEntry.findMany({ where: { orderId: orderIdArg } });

    console.log(JSON.stringify({
      step: 'order_delivered_ledger_posted',
      orderId: orderIdArg,
      status: 'delivered',
      ledgerEntriesCount: ledgerEntries.length,
      ledgerEntries: ledgerEntries.map(e => ({
        type: e.transactionType,
        entry: e.entryType,
        amount: Number(e.amount),
        account: e.accountType,
        desc: e.description,
      })),
    }));
  }
}

main()
  .catch(e => {
    console.error(e.response?.data || e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
