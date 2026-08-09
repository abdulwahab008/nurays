import { z } from 'zod';

export const registerSellerSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters'),
  businessNameUrdu: z.string().optional(),
  description: z.string().optional(),
  kitchenVideoUrl: z.string().url('Invalid video URL').optional(),
  coverImageUrl: z.string().url('Invalid image URL').optional(),
  cnicFrontUrl: z.string().url('Invalid image URL').optional(),
  cnicBackUrl: z.string().url('Invalid image URL').optional(),
  kitchenPhotoUrls: z.array(z.string().url('Invalid image URL')).optional(),
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

const operatingHoursSchema = z.object({
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

const MEAL_CATEGORIES = ['breakfast', 'brunch', 'lunch', 'evening_snacks', 'dinner', 'late_night', 'desserts', 'beverages'] as const;
const BUSINESS_TYPES = ['restaurant', 'home_kitchen', 'bakery', 'cafe', 'cloud_kitchen'] as const;
const DELIVERY_MODES = ['delivery', 'pickup', 'dine_in'] as const;
const AVAILABILITY_OVERRIDES = ['open', 'closed', 'busy', 'vacation', 'holiday', 'preorder_only'] as const;

export const updateSellerSchema = z.object({
  businessName: z.string().min(1, 'Business name is required').optional(),
  businessNameUrdu: z.string().optional(),
  description: z.string().optional(),
  kitchenVideoUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  jazzcashNumber: z.string().optional(),
  easypaisaNumber: z.string().optional(),
  bankAccountName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankName: z.string().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  enableStockAlerts: z.boolean().optional(),
  freeDeliveryAreas: z.array(z.string().min(1)).optional(),
  freeDeliveryRadiusKm: z.number().min(0).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  deliveryFeeType: z.enum(['fixed', 'distance']).optional().nullable(),
  deliveryFeeFixed: z.number().int().min(0).optional().nullable(),
  deliveryFeeBase: z.number().int().min(0).optional().nullable(),
  deliveryFeePerKm: z.number().min(0).optional().nullable(),

  distancePricingTiers: z.array(z.object({ maxKm: z.number().positive(), fee: z.number().min(0) })).optional().nullable(),
  maxDeliveryDistanceKm: z.number().positive().optional().nullable(),
  minOrderAmountForDelivery: z.number().min(0).optional().nullable(),
  freeDeliveryThreshold: z.number().min(0).optional().nullable(),
  allowedPostalCodes: z.array(z.string().min(1)).optional(),
  deliveryZones: z
    .array(z.object({ name: z.string().min(1), cities: z.array(z.string()), areas: z.array(z.string()), fee: z.number().min(0) }))
    .optional()
    .nullable(),
  deliveryModes: z.array(z.enum(DELIVERY_MODES)).min(1).optional(),

  businessType: z.enum(BUSINESS_TYPES).optional(),
  mealCategories: z.array(z.enum(MEAL_CATEGORIES)).optional(),
  storeNotice: z.string().max(500).optional().nullable(),

  scheduleMode: z.enum(['24_7', 'fixed_daily', 'per_day']).optional(),
  operatingHours: operatingHoursSchema.optional().nullable(),

  availabilityOverride: z.enum(AVAILABILITY_OVERRIDES).optional().nullable(),
  availabilityOverrideUntil: z.string().datetime().optional().nullable(),
  availabilityNote: z.string().max(300).optional().nullable(),

  orderCutoffTime: timeString.optional().nullable(),
  // nonnegative (not positive): 0 is a valid "stop taking new orders today" cap.
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

