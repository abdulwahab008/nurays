import { z } from 'zod';

// Like z.coerce.number() but '' / null / undefined are rejected rather than becoming 0.
const num = (schema: z.ZodNumber) =>
  z.preprocess((v) => (v === '' || v === null || (typeof v === 'string' && v.trim() === '') ? undefined : typeof v === 'string' ? Number(v) : v), schema);

export const batchIntakeSchema = z.object({
  productId: z.string().min(1),
  sellerId: z.string().min(1).optional(),
  quantity: num(z.number().int().positive().max(1_000_000)),
  batchNumber: z.string().trim().min(1).max(100),
  manufacturedDate: z.string().optional(),
  expiryDate: z.string().min(1),
  measuredTemperatureCelsius: num(z.number().min(-100).max(100)),
  storageUnit: z.string().max(100).optional(),
  barcode: z.string().max(100).optional(),
});

export const batchStatusSchema = z.object({
  status: z.enum(['available', 'damaged', 'reserved', 'expired']),
  reason: z.string().max(500).optional(),
});

export const temperatureProbeSchema = z.object({
  temperatureCelsius: num(z.number().min(-100).max(100)),
  freezerUnit: num(z.number().int().min(1).max(100)).optional(),
  notes: z.string().max(500).optional(),
});

export const assignManagerSchema = z.object({
  managerId: z.string().min(1).nullable(),
});
