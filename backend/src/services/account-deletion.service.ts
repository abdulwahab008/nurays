import { logger } from '../utils/logger';
import { isPrivateRef, keyOfPrivateRef, storage } from '../storage';
import prisma from '../config/database';
import socketManager from '../config/socket';
import { AppError } from '../middleware/errorHandler';
import { recordAudit } from '../middleware/audit';
import { riderMoney } from './rider-ledger.service';
import { placeholderPhone } from './auth.service';
import { assertCurrentPassword } from './reauth.service';

/**
 * A person closes their own account (the app stores require this to be possible from inside the app).
 *
 * Personal details are removed or replaced at once: contact details, password, name, photo, saved
 * addresses, cart, favourites, push subscriptions, ID documents. Orders, payments, the ledger and
 * the audit trail stay, as the privacy policy says, because they are the business's financial
 * records; they no longer point at a person who can be identified. The account cannot be signed
 * into again (status "deleted", every session ended).
 *
 * It is refused while something is still open that would be lost or left unsettled: an order on
 * its way, money in the wallet, a rider's cash or pay, a kitchen's open orders or payout request.
 * Staff accounts are removed by the super admin instead.
 */

const ORDER_OPEN_NOT = ['delivered', 'completed', 'cancelled', 'refunded'];
const DELIVERY_ACTIVE = ['assigned', 'arrived_at_pickup', 'picked_up', 'in_transit', 'arrived_at_customer'];

export async function deleteOwnAccount(userId: string, password?: string, ctx: { ip?: string | null } = {}) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { seller: { select: { id: true } } } });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  if (user.status !== 'active') throw new AppError(`This account is ${user.status}`, 409, 'ACCOUNT_NOT_ACTIVE');
  if (user.userType === 'admin' || user.userType === 'hub_manager') {
    throw new AppError('Staff accounts are removed by the super admin, not from here', 403, 'STAFF_ACCOUNT');
  }
  if (user.passwordHash) {
    if (!password) throw new AppError('Enter your password to close the account', 400, 'PASSWORD_REQUIRED');
    await assertCurrentPassword({ id: user.id, passwordHash: user.passwordHash }, password, ctx);
  }

  // Nothing may be left half-done or unpaid.
  const openOrders = await prisma.order.count({ where: { customerId: userId, orderStatus: { notIn: ORDER_OPEN_NOT } } });
  if (openOrders > 0) throw new AppError('You have an order that is still in progress. Wait until it is delivered or cancelled.', 409, 'OPEN_ORDERS');
  const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { balance: true } });
  if (wallet && Number(wallet.balance) > 0) {
    throw new AppError('Your wallet still has money in it. Use it or ask support to settle it before closing the account.', 409, 'WALLET_BALANCE');
  }
  const rider = await prisma.rider.findUnique({ where: { userId }, select: { id: true } });
  if (rider) {
    const active = await prisma.delivery.count({ where: { riderId: rider.id, status: { in: DELIVERY_ACTIVE } } });
    if (active > 0) throw new AppError('Finish or hand back your active deliveries first', 409, 'ACTIVE_DELIVERIES');
    const money = await riderMoney(prisma, rider.id);
    if (Math.round(money.cashHeld) !== 0 || Math.round(money.unpaid) !== 0) {
      throw new AppError('Settle your cash and pay with the hub first (money is still owed one way or the other)', 409, 'RIDER_BALANCE');
    }
  }
  if (user.seller) {
    const openItems = await prisma.orderItem.count({
      where: { sellerId: user.seller.id, status: { notIn: ['cancelled', 'delivered'] }, order: { orderStatus: { notIn: ORDER_OPEN_NOT } } },
    });
    if (openItems > 0) throw new AppError('Your kitchen still has orders in progress', 409, 'OPEN_ORDERS');
    const pendingPayouts = await prisma.sellerPayout.count({ where: { sellerId: user.seller.id, status: 'pending' } });
    if (pendingPayouts > 0) throw new AppError('A payout request is still being processed', 409, 'PENDING_PAYOUT');
  }

  const now = new Date();
  const sellerId = user.seller?.id;
  const documentRefs: string[] = [];
  await prisma.$transaction(async (tx) => {
    await tx.userAddress.deleteMany({ where: { userId } });
    await tx.favoriteSeller.deleteMany({ where: { userId } });
    await tx.pushSubscription.deleteMany({ where: { userId } });
    await tx.passwordReset.deleteMany({ where: { userId } });
    await tx.emailVerification.deleteMany({ where: { userId } });
    const cart = await tx.cart.findUnique({ where: { userId }, select: { id: true } });
    if (cart) await tx.cart.delete({ where: { id: cart.id } }); // items go with it (cascade)
    await tx.userProfile.updateMany({ where: { userId }, data: { fullName: 'Deleted user', avatarUrl: null, city: null, area: null } });
    if (rider) {
      documentRefs.push(...(await tx.riderDocument.findMany({ where: { riderId: rider.id }, select: { documentUrl: true } })).map((d) => d.documentUrl));
      await tx.riderDocument.deleteMany({ where: { riderId: rider.id } });
      await tx.rider.update({
        where: { id: rider.id },
        data: { status: 'closed', isAvailable: false, licenseNumber: null, vehicleNumber: null },
      });
    }
    if (sellerId) {
      documentRefs.push(...(await tx.sellerDocument.findMany({ where: { sellerId }, select: { documentUrl: true } })).map((d) => d.documentUrl));
      await tx.sellerDocument.deleteMany({ where: { sellerId } });
      await tx.product.updateMany({ where: { sellerId }, data: { isActive: false } });
      // The business name stays on past orders; the payout accounts and the home kitchen's pin do not.
      await tx.seller.update({
        where: { id: sellerId },
        data: {
          status: 'closed',
          bankAccountName: null, bankAccountNumber: null, bankName: null,
          jazzcashNumber: null, jazzcashAccountTitle: null, easypaisaNumber: null, easypaisaAccountTitle: null,
          latitude: null, longitude: null,
        },
      });
    }
    await tx.user.update({
      where: { id: userId },
      data: {
        status: 'deleted',
        phone: placeholderPhone(`deleted:${userId}`),
        email: null,
        passwordHash: null,
        emailVerified: false,
        phoneVerified: false,
        tokensValidAfter: now,
      },
    });
  });
  socketManager.disconnectUser(userId);
  // Identity documents are removed from storage as well as from the database (best effort, logged).
  for (const ref of documentRefs) {
    if (!isPrivateRef(ref)) continue;
    storage()
      .delete(keyOfPrivateRef(ref), 'private')
      .catch((err: unknown) => logger.warn({ err, userId }, 'document file not removed on account closure'));
  }
  void recordAudit({ userId, action: 'auth:ACCOUNT_DELETED', entityType: 'user', entityId: userId, responseStatus: 200 });
  return { id: userId, status: 'deleted' };
}
