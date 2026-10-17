import { z } from 'zod';

/** A date or date-time the server can read (`new Date(value)` is a real date). Anything else would reach Prisma as an Invalid Date. */
export const readableDate = (label: string) => z.string().max(40).refine((value) => !Number.isNaN(Date.parse(value)), `Invalid ${label}`);

/** A calendar day, YYYY-MM-DD, that exists (no 13th month, no 45th day, no 30 February) within the years the app can mean. */
export const calendarDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-31')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2100-12-31';
  }, 'Use a real date between 2000 and 2100');
