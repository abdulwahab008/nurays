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
  // Nuray rider delivery to other communities (delivery-pricing.service.ts).
  deliveryPerKm: z.number().min(0).max(1000).optional(),
  deliveryIncludedKm: z.number().min(0).max(100).optional(),
  deliveryMaxKm: z.number().min(1).max(200).optional(),
  deliveryFallbackFee: z.number().min(0).max(5000).optional(),
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

// People
export const accountStatusSchema = z.object({ status: z.enum(['active', 'suspended']) });
export const hubManagerSchema = z.object({ identifier: z.string().trim().min(3, 'Enter an email address or phone number').max(120) });

// Places
const lat = z.number().finite().min(-90).max(90);
const lng = z.number().finite().min(-180).max(180);
const communityFields = {
  name: z.string().trim().min(2).max(80),
  slug: z.string().trim().max(60),
  city: z.string().trim().min(2).max(60),
  areaDescription: z.string().trim().max(300).nullable(),
  centerLatitude: lat,
  centerLongitude: lng,
  radiusKm: z.number().finite().min(0.2).max(50),
  deliveryBaseFee: z.number().finite().min(0).max(5000),
  crossCommunityBaseFee: z.number().finite().min(0).max(5000),
  crossCommunityEnabled: z.boolean(),
  neighborCommunityIds: z.array(z.string().uuid()).max(50),
  isActive: z.boolean(),
};
export const createCommunitySchema = z.object(communityFields).partial().required({ name: true, city: true, centerLatitude: true, centerLongitude: true });
export const updateCommunitySchema = z.object(communityFields).partial();

const hubFields = {
  name: z.string().trim().min(2).max(80),
  code: z.string().trim().min(2).max(20),
  city: z.string().trim().min(2).max(60),
  area: z.string().trim().min(2).max(80),
  address: z.string().trim().min(5).max(300),
  latitude: lat,
  longitude: lng,
  capacityCubicFeet: z.number().int().min(1).max(1_000_000),
  freezerUnits: z.number().int().min(1).max(500),
  contactPhone: z.string().trim().max(20).nullable(),
  status: z.enum(['active', 'inactive', 'maintenance']),
};
export const createHubSchema = z.object(hubFields).partial().required({ name: true, code: true, city: true, area: true, address: true, latitude: true, longitude: true, capacityCubicFeet: true });
export const updateHubSchema = z.object(hubFields).partial();
export const assignHubManagerSchema = z.object({ managerId: z.string().uuid().nullable() });
