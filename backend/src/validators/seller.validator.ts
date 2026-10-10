import { z } from 'zod';
import { readableDate } from './primitives';
import { PAKISTAN_BOUNDS, PIN_OUTSIDE } from '../utils/geo';

export const registerSellerSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters').max(120),
  businessNameUrdu: z.string().max(120).optional(),
  businessType: z.enum(['restaurant', 'home_kitchen', 'bakery', 'cafe', 'cloud_kitchen']).optional().default('home_kitchen'),
  description: z.string().max(1000).optional(),
  kitchenVideoUrl: z.string().max(400).optional(),
  coverImageUrl: z.string().max(400).optional(),
  cnicFrontUrl: z.string().max(400).optional(),
  cnicBackUrl: z.string().max(400).optional(),
  kitchenPhotoUrls: z.array(z.string().max(400)).max(20).optional(),
  communityId: z.string().max(100).optional(),
  primaryCommunityName: z.string().max(120).optional(),
  latitude: z.number().min(PAKISTAN_BOUNDS.minLat, PIN_OUTSIDE).max(PAKISTAN_BOUNDS.maxLat, PIN_OUTSIDE).optional(),
  longitude: z.number().min(PAKISTAN_BOUNDS.minLng, PIN_OUTSIDE).max(PAKISTAN_BOUNDS.maxLng, PIN_OUTSIDE).optional(),
  address: z.string().max(300).optional(),
  houseOrUnitNumber: z.string().max(50).optional(),
  mealCategories: z.array(z.string().max(50)).max(20).optional(),
  deliveryModes: z.array(z.string().max(30)).max(10).optional(),
  bankAccountName: z.string().max(120).optional(),
  bankAccountNumber: z.string().max(60).optional(),
  bankName: z.string().max(120).optional(),
  jazzcashNumber: z.string().max(20).optional(),
  jazzcashAccountTitle: z.string().max(120).optional(),
  easypaisaNumber: z.string().max(20).optional(),
  easypaisaAccountTitle: z.string().max(120).optional(),
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
  businessName: z.string().min(1, 'Business name is required').max(120).optional(),
  businessNameUrdu: z.string().max(120).optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  kitchenVideoUrl: z.string().max(400).refine((u) => !u || /^https:\/\//.test(u), 'Must be an https:// link').optional().nullable(),
  coverImageUrl: z.string().max(400).optional().nullable(),
  jazzcashNumber: z.string().max(20).optional().nullable(),
  jazzcashAccountTitle: z.string().max(120).optional().nullable(),
  easypaisaNumber: z.string().max(20).optional().nullable(),
  easypaisaAccountTitle: z.string().max(120).optional().nullable(),
  bankAccountName: z.string().max(120).optional().nullable(),
  bankAccountNumber: z.string().max(60).optional().nullable(),
  bankName: z.string().max(120).optional().nullable(),
  lowStockThreshold: z.number().int().min(0).max(100_000).optional().nullable(),
  enableStockAlerts: z.boolean().optional(),
  freeDeliveryAreas: z.array(z.string()).optional().nullable(),
  freeDeliveryRadiusKm: z.number().min(0).max(1000).optional().nullable(),
  latitude: z.number().min(PAKISTAN_BOUNDS.minLat, PIN_OUTSIDE).max(PAKISTAN_BOUNDS.maxLat, PIN_OUTSIDE).optional().nullable(),
  longitude: z.number().min(PAKISTAN_BOUNDS.minLng, PIN_OUTSIDE).max(PAKISTAN_BOUNDS.maxLng, PIN_OUTSIDE).optional().nullable(),
  deliveryFeeType: z.enum(['fixed', 'distance']).or(z.literal('')).optional().nullable(),
  deliveryFeeFixed: z.number().int().min(0).max(100_000).optional().nullable(),
  deliveryFeeBase: z.number().int().min(0).max(100_000).optional().nullable(),
  deliveryFeePerKm: z.number().min(0).max(10_000).optional().nullable(),

  distancePricingTiers: z.array(z.object({ maxKm: z.number().min(0).max(1000), fee: z.number().min(0).max(100_000) })).max(50).optional().nullable(),
  maxDeliveryDistanceKm: z.number().min(0).max(1000).optional().nullable(),
  minOrderAmountForDelivery: z.number().min(0).max(10_000_000).optional().nullable(),
  freeDeliveryThreshold: z.number().min(0).max(10_000_000).optional().nullable(),
  allowedPostalCodes: z.array(z.string().min(1)).optional().nullable(),
  deliveryZones: z
    .array(z.object({ name: z.string().min(1), cities: z.array(z.string()), areas: z.array(z.string()), fee: z.number().min(0).max(100_000) }))
    .optional()
    .nullable(),
  deliveryModes: z.array(z.string()).optional().nullable(),
  deliveryProvider: z.enum(['platform', 'self']).optional(),
  allowCrossCommunity: z.boolean().optional(),

  businessType: z.string().optional().nullable(),
  mealCategories: z.array(z.string()).optional().nullable(),
  storeNotice: z.string().max(500).optional().nullable(),

  scheduleMode: z.enum(['24_7', 'fixed_daily', 'per_day']).optional().nullable(),
  operatingHours: operatingHoursSchema.optional().nullable(),

  availabilityOverride: z.string().optional().nullable(),
  availabilityOverrideUntil: readableDate('availabilityOverrideUntil').optional().nullable(),
  availabilityNote: z.string().max(300).optional().nullable(),

  orderCutoffTime: z.string().optional().nullable(),
  maxDailyOrders: z.number().int().nonnegative().max(100_000).optional().nullable(),
  minPrepTimeMinutes: z.number().int().min(0).max(10_080).optional().nullable(),
  preOrderOnly: z.boolean().optional(),
  advanceBookingMinDays: z.number().int().min(0).max(365).optional().nullable(),
  advanceBookingMaxDays: z.number().int().min(0).max(365).optional().nullable(),
});

export const setCommunityDeliverySchema = z.object({
  terms: z
    .array(
      z.object({
        communityId: z.string().min(1),
        // Only used when the kitchen delivers itself; with Nuray riders the fee is Nuray's.
        fee: z.number().min(0).max(100000).optional().default(0),
        freeAbove: z.number().min(0).max(10_000_000).optional().nullable(),
        minOrderAmount: z.number().min(0).max(10_000_000).optional().nullable(),
        isEnabled: z.boolean().optional(),
      })
    )
    .max(200),
});

export const requestPayoutSchema = z.object({
  amount: z.number().min(100, 'Minimum payout amount is 100 PKR').max(10_000_000),
  payoutMethod: z.enum(['bank_transfer', 'jazzcash', 'easypaisa']),
  accountNumber: z.string().min(1, 'Account number is required'),
});

