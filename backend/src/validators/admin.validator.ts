import { z } from 'zod';

export const approveRejectSellerSchema = z.object({
  approved: z.boolean(),
  notes: z.string().optional(),
});

export const moderateProductSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const updateSellerStatusSchema = z.object({
  status: z.enum(['active', 'suspended']),
});

export const approveRejectRiderSchema = z.object({
  approved: z.boolean(),
  reason: z.string().optional(),
});

export const completePayoutSchema = z.object({
  transactionId: z.string().optional(),
});

export const failPayoutSchema = z.object({
  reason: z.string().min(1, 'A reason is required'),
});

export const updateSettingsSchema = z.object({
  platformName: z.string().min(1).optional(),
  supportEmail: z.string().email().optional(),
  supportPhone: z.string().min(1).optional(),
  commissionRate: z.number().min(0).max(100).optional(),
  minPayoutAmount: z.number().min(0).optional(),
});


// Rider money: amounts in rupees, up to two decimals.
const rupees = z.number().finite().refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Use at most two decimals');

export const riderCashMovementSchema = z.object({
  amount: rupees.refine((n) => n > 0, 'Enter an amount above zero').refine((n) => n <= 1_000_000, 'That amount is too large'),
  reference: z.string().trim().max(100).optional(),
  note: z.string().trim().max(300).optional(),
});

export const riderSettlementSchema = z
  .object({
    cashHandedIn: rupees.refine((n) => n >= 0 && n <= 1_000_000, 'Enter an amount from Rs 0 to Rs 1,000,000').optional(),
    keptAsPay: rupees.refine((n) => n >= 0 && n <= 1_000_000, 'Enter an amount from Rs 0 to Rs 1,000,000').optional(),
    reference: z.string().trim().max(100).optional(),
    note: z.string().trim().max(300).optional(),
  })
  .refine((v) => (v.cashHandedIn ?? 0) + (v.keptAsPay ?? 0) > 0, 'Enter the cash handed in, or the pay kept from it');

export const riderAdjustmentSchema = z.object({
  amount: rupees.refine((n) => n !== 0, 'Enter a non-zero amount').refine((n) => Math.abs(n) <= 1_000_000, 'That amount is too large'),
  note: z.string().trim().min(1, 'Say what the adjustment is for').max(300),
});

export const riderCashLimitSchema = z.object({
  cashLimit: z.number().finite().min(0).max(1_000_000).nullable(),
});
