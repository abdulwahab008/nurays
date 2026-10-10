import { z } from 'zod';
import { PAKISTAN_BOUNDS, PIN_OUTSIDE } from '../utils/geo';

export const updateDeliveryStatusSchema = z.object({
  status: z.enum([
    'arrived_at_pickup',
    'picked_up',
    'in_transit',
    'arrived_at_customer',
    'delivered',
    'delivery_failed',
  ]),
  reason: z.string().min(1).max(500).optional(),
  otp: z.string().length(4).regex(/^\d{4}$/, 'OTP must be a 4-digit code').optional(),
}).refine((data) => data.status !== 'delivery_failed' || !!data.reason, {
  message: 'A reason is required when reporting a failed delivery',
  path: ['reason'],
});


export const RIDER_VEHICLE_TYPES = ['motorcycle', 'bicycle', 'scooter', 'car', 'rickshaw'] as const;

export const riderApplicationSchema = z.object({
  city: z.string().trim().min(2, 'Enter your city').max(60),
  vehicleType: z.enum(RIDER_VEHICLE_TYPES),
  vehicleNumber: z.string().trim().min(2, 'Enter your vehicle registration number').max(20),
  licenseNumber: z.string().trim().max(30).optional(),
  cnicFrontUrl: z.string().max(400).optional(),
  cnicBackUrl: z.string().max(400).optional(),
  licenseUrl: z.string().max(400).optional(),
});

export const dutyStatusSchema = z.object({ isAvailable: z.boolean().optional() });

// A rider's reported position must be where Nuray operates: anything else is a bad fix, not a trip.
export const riderLocationSchema = z.object({
  latitude: z.coerce.number().min(PAKISTAN_BOUNDS.minLat, PIN_OUTSIDE).max(PAKISTAN_BOUNDS.maxLat, PIN_OUTSIDE),
  longitude: z.coerce.number().min(PAKISTAN_BOUNDS.minLng, PIN_OUTSIDE).max(PAKISTAN_BOUNDS.maxLng, PIN_OUTSIDE),
});

export const claimDeliverySchema = z.object({ askFee: z.number().positive().max(100000).optional() });
