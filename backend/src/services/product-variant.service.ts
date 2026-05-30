import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { createStockAlert } from './stock-alert.service';

interface CreateVariantData {
  productId: string;
  name: string;
  nameUrdu?: string | null;
  sku?: string | null;
  price: number;
  originalPrice?: number | null;
  costPrice?: number | null;
  stockQuantity?: number;
  stockThreshold?: number;
  weightGrams?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

interface UpdateVariantData {
  name?: string;
  nameUrdu?: string | null;
  sku?: string | null;
  price?: number;
  originalPrice?: number | null;
  costPrice?: number | null;
  stockQuantity?: number;
  stockThreshold?: number;
  weightGrams?: number | null;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
}

export const createProductVariant = async (userId: string, data: CreateVariantData) => {
  // Verify product belongs to seller
  const product = await prisma.product.findUnique({
    where: { id: data.productId },
    include: { seller: true },
  });

  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  if (product.seller.userId !== userId) {
    throw new AppError('Unauthorized to add variants to this product', 403, 'FORBIDDEN');
  }

  // If this is set as default, unset other defaults
  if (data.isDefault) {
    await prisma.productVariant.updateMany({
      where: { productId: data.productId },
      data: { isDefault: false },
    });
  }

  const variant = await prisma.productVariant.create({
    data: {
      productId: data.productId,
      name: data.name,
      nameUrdu: data.nameUrdu,
      sku: data.sku,
      price: data.price,
      originalPrice: data.originalPrice,
      costPrice: data.costPrice,
      stockQuantity: data.stockQuantity ?? 0,
      stockThreshold: data.stockThreshold ?? 10,
      weightGrams: data.weightGrams,
      isDefault: data.isDefault ?? false,
      isActive: data.isActive ?? true,
      sortOrder: data.sortOrder ?? 0,
    },
  });

  // Check if stock is low and create alert
  if (variant.stockQuantity <= variant.stockThreshold) {
    await createStockAlert({
      sellerId: product.sellerId,
      productId: product.id,
      variantId: variant.id,
      alertType: variant.stockQuantity === 0 ? 'out_of_stock' : 'low_stock',
      currentStock: variant.stockQuantity,
      threshold: variant.stockThreshold,
    });
  }

  return variant;
};

export const bulkCreateProductVariants = async (userId: string, productId: string, variantsData: Omit<CreateVariantData, 'productId'>[]) => {
  // Verify product belongs to seller
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { seller: true },
  });

  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  if (product.seller.userId !== userId) {
    throw new AppError('Unauthorized to add variants to this product', 403, 'FORBIDDEN');
  }

  const variants = await prisma.$transaction(async (tx) => {
    // If any variant is set as default, unset existing defaults
    const hasDefault = variantsData.some(v => v.isDefault);
    if (hasDefault) {
      await tx.productVariant.updateMany({
        where: { productId },
        data: { isDefault: false },
      });
    }

    const created = await Promise.all(
      variantsData.map((data, index) =>
        tx.productVariant.create({
          data: {
            productId,
            name: data.name,
            nameUrdu: data.nameUrdu,
            sku: data.sku,
            price: data.price,
            originalPrice: data.originalPrice,
            costPrice: data.costPrice,
            stockQuantity: data.stockQuantity ?? 0,
            stockThreshold: data.stockThreshold ?? 10,
            weightGrams: data.weightGrams,
            isDefault: data.isDefault ?? (index === 0 && !hasDefault),
            isActive: data.isActive ?? true,
            sortOrder: data.sortOrder ?? index,
          },
        })
      )
    );

    return created;
  });

  // Check stock levels and create alerts
  for (const variant of variants) {
    if (variant.stockQuantity <= variant.stockThreshold) {
      await createStockAlert({
        sellerId: product.sellerId,
        productId: product.id,
        variantId: variant.id,
        alertType: variant.stockQuantity === 0 ? 'out_of_stock' : 'low_stock',
        currentStock: variant.stockQuantity,
        threshold: variant.stockThreshold,
      });
    }
  }

  return variants;
};

export const updateProductVariant = async (userId: string, variantId: string, data: UpdateVariantData) => {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: {
        include: { seller: true },
      },
    },
  });

  if (!variant) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  if (variant.product.seller.userId !== userId) {
    throw new AppError('Unauthorized to update this variant', 403, 'FORBIDDEN');
  }

  const oldStock = variant.stockQuantity;

  // If setting as default, unset other defaults
  if (data.isDefault) {
    await prisma.productVariant.updateMany({
      where: { productId: variant.productId, id: { not: variantId } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.productVariant.update({
    where: { id: variantId },
    data,
  });

  // Check if stock alert is needed
  const newStock = data.stockQuantity ?? variant.stockQuantity;
  const threshold = data.stockThreshold ?? variant.stockThreshold;

  if (newStock <= threshold && oldStock > threshold) {
    // Stock just went below threshold
    await createStockAlert({
      sellerId: variant.product.sellerId,
      productId: variant.productId,
      variantId: variant.id,
      alertType: newStock === 0 ? 'out_of_stock' : 'low_stock',
      currentStock: newStock,
      threshold,
    });
  }

  return updated;
};

export const deleteProductVariant = async (userId: string, variantId: string) => {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: {
        include: { seller: true },
      },
    },
  });

  if (!variant) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  if (variant.product.seller.userId !== userId) {
    throw new AppError('Unauthorized to delete this variant', 403, 'FORBIDDEN');
  }

  await prisma.productVariant.delete({
    where: { id: variantId },
  });

  return { message: 'Variant deleted successfully' };
};

export const getProductVariants = async (productId: string) => {
  const variants = await prisma.productVariant.findMany({
    where: { productId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  return variants;
};

export const getVariantById = async (variantId: string) => {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: {
      product: {
        include: {
          images: true,
          category: true,
        },
      },
    },
  });

  if (!variant) {
    throw new AppError('Variant not found', 404, 'VARIANT_NOT_FOUND');
  }

  return variant;
};
