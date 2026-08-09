import { z } from 'zod';

export const getProductsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  categoryId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  city: z.string().optional(),
  area: z.string().optional(),
  minPrice: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  maxPrice: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  dietary: z.string().optional().transform((val) => (val ? val.split(',') : undefined)),
  stockType: z.enum(['direct', 'hub', 'both']).optional(),
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional(),
  search: z.string().optional(),
  sort: z.enum(['popular', 'newest', 'price_low', 'price_high', 'rating']).optional(),
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
  customerLat: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  customerLng: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  maxDistanceKm: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
});

export const getProductQuerySchema = z.object({
  customerLat: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
  customerLng: z.string().optional().transform((val) => (val ? parseFloat(val) : undefined)),
});

export const createProductSchema = z.object({
  name: z.string().min(2).max(255),
  nameUrdu: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  descriptionUrdu: z.string().max(2000).optional(),
  categoryId: z.string().uuid().optional(),
  price: z.number().positive(),
  originalPrice: z.number().positive().optional(),
  costPrice: z.number().nonnegative().optional(),  // Seller's cost to make/buy the product
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional().default('frozen'),
  shelfLifeHours: z.number().int().positive().optional(), // How long product stays fresh
  preparationTime: z.number().int().positive().optional(), // Minutes to prepare (for made-to-order)
  unit: z.string().min(1).max(50),
  unitUrdu: z.string().max(50).optional(),
  weightGrams: z.number().int().positive().optional(),
  ingredients: z.string().max(1000).optional(),
  allergens: z.string().max(500).optional(),
  dietaryInfo: z.array(z.string()).optional(),
  storageDays: z.number().int().positive().optional(),
  heatingInstructions: z.string().max(1000).optional(),
  heatingInstructionsUrdu: z.string().max(1000).optional(),
  minOrderQuantity: z.number().int().positive().optional(),
  maxOrderQuantity: z.number().int().positive().optional(),
  stockQuantity: z.number().int().nonnegative(),
  stockType: z.enum(['direct', 'hub', 'both']),
  images: z.array(z.string().min(1)).optional(), // Allow both URLs and local paths
  tags: z.array(z.string()).optional(),
});

export const updateProductSchema = createProductSchema.partial();

export const getSellerProductsQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
  isActive: z.string().optional().transform((val) => (val === 'true' ? true : val === 'false' ? false : undefined)),
  approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  productType: z.enum(['frozen', 'fresh', 'ready_to_eat', 'ready_to_cook']).optional(),
});

