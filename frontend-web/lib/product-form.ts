/**
 * The rules of the kitchen's dish form, shared by "Add dish" and "Edit dish" so the two screens
 * cannot drift apart again: what the form starts with, what it refuses, what it sends, and the
 * numbers it shows while the kitchen types (discount, profit after the platform fee).
 */

export type ProductType = 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook';
export type StockType = 'direct' | 'hub' | 'both';

export interface ProductFormData {
  name: string;
  nameUrdu: string;
  categoryId: string;
  description: string;
  price: string;
  originalPrice: string;
  /** The kitchen's own cost to make it: private, for the profit preview only. */
  costPrice: string;
  productType: '' | ProductType;
  /** How long it stays fresh. */
  shelfLifeHours: string;
  /** Minutes to cook and pack after the order is accepted (the rider is sent for it from this). */
  preparationTime: string;
  unit: string;
  stockQuantity: string;
  stockType: StockType;
  ingredients: string;
  isHalal: boolean;
  /** Edit only: whether customers can see it. */
  isActive: boolean;
}

export const EMPTY_PRODUCT_FORM: ProductFormData = {
  name: '',
  nameUrdu: '',
  categoryId: '',
  description: '',
  price: '',
  originalPrice: '',
  costPrice: '',
  productType: '',
  shelfLifeHours: '',
  preparationTime: '',
  unit: 'piece',
  stockQuantity: '50',
  stockType: 'direct',
  ingredients: '',
  isHalal: true,
  isActive: true,
};

export interface VariantDraft {
  /** Set once saved; an edit sends a change for it, a new one is created. */
  id?: string;
  name: string;
  nameUrdu?: string;
  sku?: string;
  price: number;
  originalPrice?: number;
  costPrice?: number;
  stockQuantity: number;
  stockThreshold?: number;
  weightGrams?: number;
  isDefault: boolean;
  isActive: boolean;
}

export const MAX_VARIANTS = 20;
export const MAX_IMAGES = 4;

export const PRODUCT_TYPE_OPTIONS: Array<{ value: ProductType; label: string; icon: string; description: string; selected: string }> = [
  { value: 'frozen', label: 'Frozen', icon: '❄️', description: 'Stored frozen, long shelf life', selected: 'bg-blue-50 border-blue-500' },
  { value: 'fresh', label: 'Fresh', icon: '🥬', description: 'Made fresh daily, same-day delivery', selected: 'bg-green-50 border-green-500' },
  { value: 'ready_to_eat', label: 'Ready to Eat', icon: '🍽️', description: 'Ready to eat immediately', selected: 'bg-orange-50 border-orange-500' },
  { value: 'ready_to_cook', label: 'Ready to Cook', icon: '🍳', description: 'Prepared, needs cooking', selected: 'bg-purple-50 border-purple-500' },
];

export const UNIT_OPTIONS = [
  { value: 'piece', label: 'Per Piece', example: '1 samosa' },
  { value: 'pack', label: 'Per Pack', example: '6 samosas' },
  { value: 'dozen', label: 'Per Dozen', example: '12 pieces' },
  { value: '100g', label: 'Per 100g', example: '100 grams' },
  { value: '250g', label: 'Per 250g', example: '250 grams' },
  { value: '500g', label: 'Per 500g', example: '500 grams' },
  { value: '1kg', label: 'Per 1 KG', example: '1000 grams' },
  { value: 'kg', label: 'Per KG', example: 'per kilogram' },
  { value: 'other', label: 'Other (Custom)', example: 'Custom unit' },
];

/** A saved dish as GET /products/:id returns it (the fields the form reads). */
export interface SavedProduct {
  name: string;
  nameUrdu?: string | null;
  description?: string | null;
  categoryId?: string | null;
  category?: { id: string } | null;
  price: number | string;
  originalPrice?: number | string | null;
  costPrice?: number | string | null;
  productType?: string | null;
  shelfLifeHours?: number | null;
  preparationTime?: number | null;
  unit?: string | null;
  stockQuantity?: number | null;
  stockType?: string | null;
  ingredients?: string | null;
  dietaryInfo?: string[] | null;
  isActive?: boolean | null;
}

/** The form filled from a saved dish; a unit outside the list comes back as "Other" with its text. */
export function formFromProduct(p: SavedProduct): { form: ProductFormData; customUnit: string } {
  const unit = p.unit || 'piece';
  const custom = !UNIT_OPTIONS.some((u) => u.value === unit && u.value !== 'other');
  const text = (v: unknown) => (v === null || v === undefined || v === 0 || v === '' ? '' : String(v));
  return {
    customUnit: custom ? unit : '',
    form: {
      name: p.name || '',
      nameUrdu: p.nameUrdu || '',
      categoryId: p.categoryId || p.category?.id || '',
      description: p.description || '',
      price: text(p.price),
      originalPrice: text(p.originalPrice),
      costPrice: text(p.costPrice),
      productType: (PRODUCT_TYPE_OPTIONS.some((o) => o.value === p.productType) ? p.productType : '') as ProductFormData['productType'],
      shelfLifeHours: text(p.shelfLifeHours),
      preparationTime: text(p.preparationTime),
      unit: custom ? 'other' : unit,
      stockQuantity: String(p.stockQuantity || 50),
      stockType: (p.stockType === 'hub' || p.stockType === 'both' ? p.stockType : 'direct') as StockType,
      ingredients: p.ingredients || '',
      isHalal: p.dietaryInfo ? p.dietaryInfo.includes('Halal') : true,
      isActive: p.isActive ?? true,
    },
  };
}

/**
 * Why the form cannot be saved yet, or null. A new dish must have a category; an old dish saved
 * before categories were required can still be edited without one.
 */
export function productProblem(f: ProductFormData, customUnit: string, opts: { requireCategory: boolean }): string | null {
  if (!f.name.trim()) return 'Please enter product name';
  if (opts.requireCategory && !f.categoryId) return 'Please select a category';
  if (!f.price || !(parseFloat(f.price) > 0)) return 'Please enter a valid price';
  if (f.unit === 'other' && !customUnit.trim()) return 'Please enter a custom unit type';
  return null;
}

/** The body for POST /products (create) or PATCH /products/:id (edit), without the menu fields. */
export function productPayload(f: ProductFormData, customUnit: string, images: string[], mode: 'create' | 'edit') {
  const num = (v: string) => (v ? parseFloat(v) : undefined);
  const int = (v: string) => (v ? parseInt(v, 10) : undefined);
  return {
    name: f.name.trim(),
    nameUrdu: f.nameUrdu.trim() || undefined,
    categoryId: f.categoryId || undefined,
    description: f.description.trim() || undefined,
    price: parseFloat(f.price),
    originalPrice: num(f.originalPrice),
    costPrice: num(f.costPrice),
    productType: f.productType,
    shelfLifeHours: int(f.shelfLifeHours),
    preparationTime: int(f.preparationTime),
    unit: f.unit === 'other' ? customUnit.trim() : f.unit,
    stockQuantity: parseInt(f.stockQuantity, 10) || 50,
    stockType: f.stockType,
    ingredients: f.ingredients.trim() || undefined,
    dietaryInfo: f.isHalal ? ['Halal'] : [],
    images,
    ...(mode === 'edit' ? { isActive: f.isActive } : {}),
  };
}

/** One variant as the variant endpoints take it; its position in the list is its order. */
export function variantPayload(v: VariantDraft, index: number) {
  return {
    name: v.name,
    nameUrdu: v.nameUrdu || null,
    sku: v.sku || null,
    price: v.price,
    originalPrice: v.originalPrice || null,
    costPrice: v.costPrice || null,
    stockQuantity: v.stockQuantity,
    stockThreshold: v.stockThreshold || 10,
    weightGrams: v.weightGrams || null,
    isDefault: v.isDefault,
    isActive: v.isActive,
    sortOrder: index,
  };
}

/** A new variant starts at the dish's own price; the first one is the default. */
export function newVariant(f: ProductFormData, existing: number): VariantDraft {
  return {
    name: '',
    price: Number(f.price) || 0,
    originalPrice: Number(f.originalPrice) || undefined,
    costPrice: Number(f.costPrice) || undefined,
    stockQuantity: 50,
    stockThreshold: 10,
    isDefault: existing === 0,
    isActive: true,
  };
}

/** The list without that variant; when the default goes, the first one left becomes the default. */
export function withoutVariant(list: VariantDraft[], index: number): VariantDraft[] {
  const left = list.filter((_, i) => i !== index);
  if (list[index]?.isDefault && left.length > 0 && !left.some((v) => v.isDefault)) {
    left[0] = { ...left[0], isDefault: true };
  }
  return left;
}

/** Whole percent off the original price, or 0 when there is no real discount. */
export function discountPercent(price: string, originalPrice: string): number {
  const p = parseFloat(price);
  const o = parseFloat(originalPrice);
  if (!(p > 0) || !(o > p)) return 0;
  return Math.round(((o - p) / o) * 100);
}

/** The platform's cut the profit preview assumes. */
export const PLATFORM_FEE_RATE = 0.15;

/** What the kitchen keeps on one unit after its cost and the platform fee, and as a share of the price. */
export function profitOf(price: number, cost: number): { fee: number; profit: number; margin: number } {
  const fee = price * PLATFORM_FEE_RATE;
  const profit = price - cost - fee;
  return { fee, profit, margin: price > 0 ? (profit / price) * 100 : 0 };
}

export interface CategoryNode {
  id: string;
  name: string;
  iconUrl?: string;
  children?: CategoryNode[];
}

/** Where a category sits: itself, and the top-level category it is under (null when it is one). */
export function locateCategory(tree: CategoryNode[], id: string): { category: CategoryNode; parent: CategoryNode | null } | null {
  if (!id) return null;
  for (const top of tree) {
    if (top.id === id) return { category: top, parent: null };
    const child = top.children?.find((c) => c.id === id);
    if (child) return { category: child, parent: top };
  }
  return null;
}

interface SaveFailure {
  response?: { data?: { message?: unknown; error?: { message?: unknown; details?: Array<{ field?: string; message?: string }> } } };
}

/** What to tell the kitchen when a save is refused: the fields the server named, its message, or the fallback. */
export function saveErrorMessage(err: unknown, fallback: string): string {
  const data = err && typeof err === 'object' ? (err as SaveFailure).response?.data : undefined;
  const details = data?.error?.details;
  if (Array.isArray(details) && details.length > 0) {
    return `Validation error: ${details.map((d) => `${d.field}: ${d.message}`).join(', ')}`;
  }
  const message = data?.error?.message ?? data?.message;
  return typeof message === 'string' && message.trim() ? message : fallback;
}
