import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { pageArgs } from '../utils/pagination';
import { roundMoney } from '../utils/pricing';

/**
 * The Nuray Wallet: money the platform holds for a customer (top-ups, refunds of wallet-paid
 * orders, a duplicate online payment). Every change is a wallet_transactions row recording the
 * balance before and after, written in the same transaction as the change itself.
 */

type Tx = Prisma.TransactionClient;


async function walletOf(tx: Tx, userId: string) {
  return tx.wallet.upsert({
    where: { userId },
    create: { userId, balance: 0, currency: 'PKR' },
    update: {},
  });
}

/**
 * Take `amount` from the customer's wallet, inside the caller's transaction. Fails (and so
 * rolls the caller back) when the wallet is locked or the balance doesn't cover it; the
 * conditional update makes two concurrent debits unable to overdraw it.
 */
export async function debitWallet(
  tx: Tx,
  opts: { userId: string; amount: number; orderId?: string | null; description: string }
) {
  const amount = roundMoney(opts.amount);
  const wallet = await walletOf(tx, opts.userId);
  if (wallet.isLocked) throw new AppError('Your wallet is locked. Please contact support.', 400, 'WALLET_LOCKED');
  const { count } = await tx.wallet.updateMany({
    where: { id: wallet.id, isLocked: false, balance: { gte: amount } },
    data: { balance: { decrement: amount } },
  });
  if (count === 0) {
    const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
    throw new AppError(
      `Your wallet balance (Rs ${Number(current.balance).toLocaleString()}) doesn't cover Rs ${amount.toLocaleString()}.`,
      400,
      'INSUFFICIENT_BALANCE'
    );
  }
  const after = Number((await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } })).balance);
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      orderId: opts.orderId ?? null,
      transactionType: 'debit',
      amount,
      balanceBefore: roundMoney(after + amount),
      balanceAfter: after,
      description: opts.description,
      status: 'completed',
    },
  });
}

/** Add `amount` to the customer's wallet, inside the caller's transaction. */
export async function creditWallet(
  tx: Tx,
  opts: { userId: string; amount: number; type: 'credit' | 'topup'; description: string; orderId?: string | null; referenceId?: string | null }
) {
  const amount = roundMoney(opts.amount);
  const wallet = await walletOf(tx, opts.userId);
  const updated = await tx.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
  const after = Number(updated.balance);
  return tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      orderId: opts.orderId ?? null,
      transactionType: opts.type,
      amount,
      balanceBefore: roundMoney(after - amount),
      balanceAfter: after,
      description: opts.description,
      referenceId: opts.referenceId ?? null,
      status: 'completed',
    },
  });
}

export async function getWallet(userId: string) {
  const wallet = await prisma.wallet.upsert({
    where: { userId },
    create: { userId, balance: 0, currency: 'PKR' },
    update: {},
  });
  return { balance: Number(wallet.balance), currency: wallet.currency, isLocked: wallet.isLocked };
}

export async function listWalletTransactions(userId: string, page = 1, limit = 20) {
  const { page: safePage, limit: safeLimit, skip } = pageArgs(page, limit, 20);
  const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!wallet) return { transactions: [], pagination: { page: safePage, limit: safeLimit, total: 0, totalPages: 0 } };
  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: safeLimit,
      include: { order: { select: { orderNumber: true } } },
    }),
    prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
  ]);
  return {
    transactions: rows.map((t) => ({
      id: t.id,
      type: t.transactionType,
      amount: Number(t.amount),
      balanceAfter: Number(t.balanceAfter),
      description: t.description,
      status: t.status,
      orderId: t.orderId,
      orderNumber: t.order?.orderNumber ?? null,
      createdAt: t.createdAt,
    })),
    pagination: { page: safePage, limit: safeLimit, total, totalPages: Math.ceil(total / safeLimit) },
  };
}
