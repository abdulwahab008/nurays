import { PrismaClient, Prisma } from '@prisma/client';

// Secrets that must never reach an API response by accident: the customer's handover
// code. Every query leaves them out unless it explicitly selects them
// (select: { handoverCode: true } or omit: { handoverCode: false }).
const globalOmit = {
  order: { handoverCode: true },
  delivery: { deliveryOtp: true },
} as const;

const log: Prisma.LogLevel[] = process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'];

const prisma = new PrismaClient<{ log: Prisma.LogLevel[]; omit: typeof globalOmit }>({
  log,
  omit: globalOmit,
});

// Handle graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
