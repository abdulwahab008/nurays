import { z } from 'zod';

export const registerSellerSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters'),
  businessNameUrdu: z.string().optional(),
  businessType: z.enum(['restaurant', 'home_kitchen', 'bakery', 'cafe', 'cloud_kitchen']).optional().default('home_kitchen'),
  description: z.string().optional(),
  kitchenVideoUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  cnicFrontUrl: z.string().optional(),
  cnicBackUrl: z.string().optional(),
  kitchenPhotoUrls: z.array(z.string()).optional(),
  communityId: z.string().optional(),
  primaryCommunityName: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  address: z.string().optional(),
  houseOrUnitNumber: z.string().optional(),
  mealCategories: z.array(z.string()).optional(),
  deliveryModes: z.array(z.string()).optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  jazzcashNumber: z.string().optional(),
  jazzcashAccountTitle: z.string().optional(),
  easypaisaNumber: z.string().optional(),
  easypaisaAccountTitle: z.string().optional(),
  agreeToTerms: z.boolean().optional(),
});

const timeString = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM');

const operatingSessionSchema = z.object({
  name: z.string().min(1).max(50),
  open: timeString,
  close: timeString,
});

const dayScheduleSchema = z.object({
  closed: z.boolean(),
  sessions: z.array(operatingSessionSchema),
});

export const operatingHoursSchema = z.object({
  fixedDaily: z.object({ open: timeString, close: timeString }).optional(),
  weekly: z
    .object({
      sunday: dayScheduleSchema.optional(),
      monday: dayScheduleSchema.optional(),
      tuesday: dayScheduleSchema.optional(),
      wednesday: dayScheduleSchema.optional(),
      thursday: dayScheduleSchema.optional(),
      friday: dayScheduleSchema.optional(),
      saturday: dayScheduleSchema.optional(),
    })
    .optional(),
});

export const MEAL_CATEGORIES = ['breakfast', 'brunch', 'lunch', 'evening_snacks', 'dinner', 'late_night', 'desserts', 'beverages'] as const;
export const BUSINESS_TYPES = ['restaurant', 'home_kitchen', 'bakery', 'cafe', 'cloud_kitchen'] as const;
export const DELIVERY_MODES = ['delivery', 'pickup', 'dine_in'] as const;
export const AVAILABILITY_OVERRIDES = ['open', 'closed', 'busy', 'vacation', 'holiday', 'preorder_only'] as const;

export const updateSellerSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').optional(),
  businessNameUrdu: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  kitchenVideoUrl: z.string().optional().nullable(),
  coverImageUrl: z.string().optional().nullable(),
  jazzcashNumber: z.string().optional().nullable(),
  jazzcashAccountTitle: z.string().optional().nullable(),
  easypaisaNumber: z.string().optional().nullable(),
  easypaisaAccountTitle: z.string().optional().nullable(),
  bankAccountName: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  lowStockThreshold: z.number().int().min(0).optional().nullable(),
  enableStockAlerts: z.boolean().optional(),
  freeDeliveryAreas: z.array(z.string()).optional().nullable(),
  freeDeliveryRadiusKm: z.number().min(0).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  deliveryFeeType: z.enum(['fixed', 'distance']).or(z.literal('')).optional().nullable(),
  deliveryFeeFixed: z.number().int().min(0).optional().nullable(),
  deliveryFeeBase: z.number().int().min(0).optional().nullable(),
  deliveryFeePerKm: z.number().min(0).optional().nullable(),

  distancePricingTiers: z.array(z.object({ maxKm: z.number().min(0), fee: z.number().min(0) })).optional().nullable(),
  maxDeliveryDistanceKm: z.number().min(0).optional().nullable(),
  minOrderAmountForDelivery: z.number().min(0).optional().nullable(),
  freeDeliveryThreshold: z.number().min(0).optional().nullable(),
  allowedPostalCodes: z.array(z.string().min(1)).optional().nullable(),
  deliveryZones: z
    .array(z.object({ name: z.string().min(1), cities: z.array(z.string()), areas: z.array(z.string()), fee: z.number().min(0) }))
    .optional()
    .nullable(),
  deliveryModes: z.array(z.string()).optional().nullable(),

  businessType: z.string().optional().nullable(),
  mealCategories: z.array(z.string()).optional().nullable(),
  storeNotice: z.string().max(500).optional().nullable(),

  scheduleMode: z.string().optional().nullable(),
  operatingHours: z.any().optional().nullable(),

  availabilityOverride: z.string().optional().nullable(),
  availabilityOverrideUntil: z.string().optional().nullable(),
  availabilityNote: z.string().max(300).optional().nullable(),

  orderCutoffTime: z.string().optional().nullable(),
  maxDailyOrders: z.number().int().nonnegative().optional().nullable(),
  minPrepTimeMinutes: z.number().int().min(0).optional().nullable(),
  preOrderOnly: z.boolean().optional(),
  advanceBookingMinDays: z.number().int().min(0).optional().nullable(),
  advanceBookingMaxDays: z.number().int().min(0).optional().nullable(),
});

export const requestPayoutSchema = z.object({
  amount: z.number().min(100, 'Minimum payout amount is 100 PKR'),
  payoutMethod: z.enum(['bank_transfer', 'jazzcash', 'easypaisa']),
  accountNumber: z.string().min(1, 'Account number is required'),
});

