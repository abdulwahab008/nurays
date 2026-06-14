import prisma from '../config/database';

/**
 * Wallet credit helper with a ledger entry. Used by referrals (and reusable for
 * a future top-up flow). Atomic: balance + transaction row move together.
 */
export class WalletService {
  async credit(
    userId: string,
    amount: number,
    opts: { transactionType?: string; description?: string; referenceId?: string; orderId?: string } = {}
  ) {
    if (amount <= 0) return null;
    return prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.upsert({
        where: { userId },
        create: { userId, balance: 0, currency: 'PKR' },
        update: {},
      });
      const before = Number(wallet.balance);
      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          orderId: opts.orderId,
          transactionType: opts.transactionType ?? 'credit',
          amount,
          balanceBefore: before,
          balanceAfter: before + amount,
          description: opts.description,
          referenceId: opts.referenceId,
          status: 'completed',
        },
      });
      return updated;
    });
  }
}

export default new WalletService();
