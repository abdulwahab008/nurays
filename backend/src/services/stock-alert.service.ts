import prisma from '../config/database';
import emailService from './email.service';

interface CreateStockAlertData {
  sellerId: string;
  productId: string;
  variantId?: string | null;
  alertType: 'low_stock' | 'out_of_stock';
  currentStock: number;
  threshold: number;
}

export const createStockAlert = async (data: CreateStockAlertData) => {
  // Check if similar alert already exists (not dismissed, created within last 24 hours)
  const existingAlert = await prisma.stockAlert.findFirst({
    where: {
      sellerId: data.sellerId,
      productId: data.productId,
      variantId: data.variantId,
      alertType: data.alertType,
      isDismissed: false,
      createdAt: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    },
  });

  if (existingAlert) {
    // Don't create duplicate alert
    return existingAlert;
  }

  const alert = await prisma.stockAlert.create({
    data: {
      sellerId: data.sellerId,
      productId: data.productId,
      variantId: data.variantId,
      alertType: data.alertType,
      currentStock: data.currentStock,
      threshold: data.threshold,
    },
  });

  // Get seller settings and product info
  const seller = await prisma.seller.findUnique({
    where: { id: data.sellerId },
    include: {
      user: {
        include: { profile: true },
      },
    },
  });

  const product = await prisma.product.findUnique({
    where: { id: data.productId },
  });

  let variant = null;
  if (data.variantId) {
    variant = await prisma.productVariant.findUnique({
      where: { id: data.variantId },
    });
  }

  // Send notification if enabled
  if (seller?.enableStockAlerts && seller.user?.email) {
    const productName = variant ? `${product?.name} - ${variant.name}` : product?.name || 'Product';
    const subject = data.alertType === 'out_of_stock' 
      ? `⚠️ Out of Stock Alert: ${productName}`
      : `📉 Low Stock Alert: ${productName}`;

    const message = `
      <h2>${data.alertType === 'out_of_stock' ? 'Out of Stock Alert' : 'Low Stock Alert'}</h2>
      <p>Hello ${seller.user.profile?.fullName || 'Seller'},</p>
      <p>Your product <strong>${productName}</strong> is ${data.alertType === 'out_of_stock' ? 'out of stock' : 'running low'}.</p>
      <ul>
        <li>Current Stock: <strong>${data.currentStock} units</strong></li>
        <li>Threshold: ${data.threshold} units</li>
      </ul>
      <p>${data.alertType === 'out_of_stock' 
        ? 'Please restock this item as soon as possible to avoid missing sales.' 
        : 'Please consider restocking soon to avoid running out.'
      }</p>
      <p>
        <a href="${process.env.FRONTEND_URL}/sellers/products" style="display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px;">
          Manage Stock
        </a>
      </p>
    `;

    try {
      await emailService.sendEmail({
        to: seller.user.email,
        subject,
        html: message,
      });
      await prisma.stockAlert.update({
        where: { id: alert.id },
        data: { emailSent: true },
      });
    } catch (error) {
      console.error('Failed to send stock alert email:', error);
    }
  }

  return alert;
};

export const getSellerStockAlerts = async (sellerId: string, filters?: {
  isRead?: boolean;
  isDismissed?: boolean;
  alertType?: 'low_stock' | 'out_of_stock';
}) => {
  const alerts = await prisma.stockAlert.findMany({
    where: {
      sellerId,
      isRead: filters?.isRead,
      isDismissed: filters?.isDismissed ?? false,
      alertType: filters?.alertType,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return alerts;
};

export const markAlertAsRead = async (alertId: string, sellerId: string) => {
  const alert = await prisma.stockAlert.findUnique({
    where: { id: alertId },
  });

  if (!alert || alert.sellerId !== sellerId) {
    throw new Error('Alert not found');
  }

  return prisma.stockAlert.update({
    where: { id: alertId },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  });
};

export const dismissAlert = async (alertId: string, sellerId: string) => {
  const alert = await prisma.stockAlert.findUnique({
    where: { id: alertId },
  });

  if (!alert || alert.sellerId !== sellerId) {
    throw new Error('Alert not found');
  }

  return prisma.stockAlert.update({
    where: { id: alertId },
    data: { isDismissed: true },
  });
};

export const checkAndCreateStockAlerts = async () => {
  // Background job to check all products and create alerts
  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      stockQuantity: {
        lte: 10, // Default threshold
      },
    },
    include: {
      seller: true,
    },
  });

  for (const product of products) {
    const threshold = product.seller.lowStockThreshold;
    if (product.stockQuantity <= threshold) {
      await createStockAlert({
        sellerId: product.sellerId,
        productId: product.id,
        alertType: product.stockQuantity === 0 ? 'out_of_stock' : 'low_stock',
        currentStock: product.stockQuantity,
        threshold,
      });
    }
  }

  // Check variants
  const variants = await prisma.productVariant.findMany({
    where: {
      isActive: true,
    },
    include: {
      product: {
        include: { seller: true },
      },
    },
  });

  for (const variant of variants) {
    if (variant.stockQuantity <= variant.stockThreshold) {
      await createStockAlert({
        sellerId: variant.product.sellerId,
        productId: variant.productId,
        variantId: variant.id,
        alertType: variant.stockQuantity === 0 ? 'out_of_stock' : 'low_stock',
        currentStock: variant.stockQuantity,
        threshold: variant.stockThreshold,
      });
    }
  }
};
