import { z } from 'zod';
import { calendarDay } from './primitives';

/** A number from a query string. Anything that is not a finite number is left out: Infinity and NaN reach the database as an error. */
const finiteNumber = (val?: string) => {
  if (!val) return undefined;
  const n = parseFloat(val);
  return Number.isFinite(n) ? n : undefined;
};

export const getProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  categoryId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  minPrice: z.string().optional().transform(finiteNumber),
  maxPrice: z.string().optional().transform(finiteNumber),
  dietary: z.string().optional().transform((val) => (val ? val.split(',') : undefined)),
  stockType: z.enum(['direct', 'hub', 'both']).optional(),
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional(),
  search: z.string().optional(),
  sort: z.enum(['popular', 'trending', 'newest', 'price_low', 'price_high', 'rating']).optional(),
  isActive: z.string().optional().transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  mealCategory: z.string().optional(),
  openNow: z.string().optional().transform((val) => val === 'true'),
  open247: z.string().optional().transform((val) => val === 'true'),
  deliveryAvailable: z.string().optional().transform((val) => val === 'true'),
  pickupAvailable: z.string().optional().transform((val) => val === 'true'),
  offersAvailable: z.string().optional().transform((val) => val === 'true'),
  freeDelivery: z.string().optional().transform((val) => val === 'true'),
  businessType: z.enum(['restaurant', 'home_kitchen', 'bakery', 'cafe', 'cloud_kitchen']).optional(),
  preOrderOnly: z.string().optional().transform((val) => val === 'true'),
  currentlyBusy: z.string().optional().transform((val) => val === 'true'),
  newKitchens: z.string().optional().transform((val) => val === 'true'),
  fastDelivery: z.string().optional().transform((val) => val === 'true'),
  customerLat: z.string().optional().transform(finiteNumber),
  customerLng: z.string().optional().transform(finiteNumber),
  maxDistanceKm: z.string().optional().transform(finiteNumber),
  communityId: z.string().optional(),
});

export const getProductQuerySchema = z.object({
  customerLat: z.string().optional().transform(finiteNumber),
  customerLng: z.string().optional().transform(finiteNumber),
  communityId: z.string().optional(),
});

export const createProductSchema = z.object({
  name: z.string().min(2).max(255),
  nameUrdu: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  descriptionUrdu: z.string().max(2000).optional(),
  categoryId: z.string().uuid().optional(),
  price: z.number().positive().max(1_000_000),
  originalPrice: z.number().positive().max(1_000_000).optional(),
  costPrice: z.number().nonnegative().max(1_000_000).optional(),  // Seller's cost to make/buy the product
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional().default('frozen'),
  shelfLifeHours: z.number().int().positive().max(8760).optional(), // How long product stays fresh (at most a year)
  preparationTime: z.number().int().positive().max(10_080).optional(), // Minutes to prepare (for made-to-order; at most a week)
  unit: z.string().min(1).max(50),
  unitUrdu: z.string().max(50).optional(),
  weightGrams: z.number().int().positive().max(1_000_000).optional(),
  ingredients: z.string().max(1000).optional(),
  allergens: z.string().max(500).optional(),
  dietaryInfo: z.array(z.string()).optional(),
  storageDays: z.number().int().positive().max(3650).optional(),
  heatingInstructions: z.string().max(1000).optional(),
  heatingInstructionsUrdu: z.string().max(1000).optional(),
  minOrderQuantity: z.number().int().positive().max(10_000).optional(),
  maxOrderQuantity: z.number().int().positive().max(10_000).optional(),
  stockQuantity: z.number().int().nonnegative().max(1_000_000),
  stockType: z.enum(['direct', 'hub', 'both']),
  images: z.array(z.string().min(1)).optional(), // Allow both URLs and local paths
  tags: z.array(z.string()).optional(),
  // When the dish can be ordered: always (fixed), on chosen weekdays (weekly, 0 = Sunday), or on the date put on the menu (daily).
  menuType: z.enum(['fixed', 'weekly', 'daily']).optional(),
  availableDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  menuDate: z.union([z.literal('today'), z.null(), calendarDay]).optional(),
});

// An update only changes what it sends: the create schema's default productType must not be applied.
export const updateProductSchema = createProductSchema
  .extend({ productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional() })
  .partial();

export const getSellerProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  isActive: z.string().optional().transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional(),
});

