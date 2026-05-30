import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

interface SellerProfitLoss {
  revenue: {
    totalSales: number;
    productsSold: number;
    averageOrderValue: number;
  };
  costs: {
    costOfGoods: number;
    platformFees: number;
    deliveryFees: number;
    packagingCosts: number;
    totalCosts: number;
  };
  profit: {
    grossProfit: number;
    netProfit: number;
    profitMargin: number;
  };
  breakdown: {
    byProduct: Array<{
      productId: string;
      productName: string;
      unitsSold: number;
      revenue: number;
      cost: number;
      profit: number;
      margin: number;
    }>;
    byPeriod: {
      today: { revenue: number; profit: number };
      thisWeek: { revenue: number; profit: number };
      thisMonth: { revenue: number; profit: number };
    };
  };
}

export const getSellerProfitLoss = async (userId: string, filters?: {
  startDate?: Date;
  endDate?: Date;
}) => {
  // Get seller
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) {
    throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
  }

  const startDate = filters?.startDate || new Date(0);
  const endDate = filters?.endDate || new Date();

  // Get all completed orders for this seller
  const orderItems = await prisma.orderItem.findMany({
    where: {
      sellerId: seller.id,
      status: 'delivered',
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    include: {
      product: true,
      order: true,
    },
  });

  // Calculate revenue
  const totalSales = orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  const productsSold = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const averageOrderValue = productsSold > 0 ? totalSales / orderItems.length : 0;

  // Calculate costs
  const costOfGoods = orderItems.reduce((sum, item) => {
    const costPrice = item.product?.costPrice ? Number(item.product.costPrice) : 0;
    return sum + (costPrice * item.quantity);
  }, 0);

  const platformFees = orderItems.reduce((sum, item) => sum + Number(item.commissionAmount), 0);
  
  // Delivery fees (estimate: Rs 50 per order)
  const uniqueOrders = new Set(orderItems.map(i => i.orderId));
  const deliveryFees = uniqueOrders.size * 50;

  // Packaging costs (estimate: Rs 20 per product)
  const packagingCosts = productsSold * 20;

  const totalCosts = costOfGoods + platformFees + deliveryFees + packagingCosts;

  // Calculate profit
  const grossProfit = totalSales - costOfGoods;
  const netProfit = totalSales - totalCosts;
  const profitMargin = totalSales > 0 ? (netProfit / totalSales) * 100 : 0;

  // Breakdown by product
  const productBreakdown = Object.values(
    orderItems.reduce((acc, item) => {
      const productId = item.productId || 'unknown';
      if (!acc[productId]) {
        acc[productId] = {
          productId,
          productName: item.productName,
          unitsSold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          margin: 0,
        };
      }
      const costPrice = item.product?.costPrice ? Number(item.product.costPrice) : 0;
      const itemRevenue = Number(item.totalPrice);
      const itemCost = costPrice * item.quantity;

      acc[productId].unitsSold += item.quantity;
      acc[productId].revenue += itemRevenue;
      acc[productId].cost += itemCost;
      acc[productId].profit = acc[productId].revenue - acc[productId].cost;
      acc[productId].margin = acc[productId].revenue > 0 
        ? (acc[productId].profit / acc[productId].revenue) * 100 
        : 0;

      return acc;
    }, {} as Record<string, any>)
  ).sort((a, b) => b.profit - a.profit);

  // Breakdown by period
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const calculatePeriodStats = (items: typeof orderItems) => {
    const revenue = items.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const cost = items.reduce((sum, item) => {
      const costPrice = item.product?.costPrice ? Number(item.product.costPrice) : 0;
      return sum + (costPrice * item.quantity);
    }, 0);
    return { revenue, profit: revenue - cost };
  };

  const byPeriod = {
    today: calculatePeriodStats(orderItems.filter(i => i.createdAt >= todayStart)),
    thisWeek: calculatePeriodStats(orderItems.filter(i => i.createdAt >= weekStart)),
    thisMonth: calculatePeriodStats(orderItems.filter(i => i.createdAt >= monthStart)),
  };

  const profitLoss: SellerProfitLoss = {
    revenue: {
      totalSales,
      productsSold,
      averageOrderValue,
    },
    costs: {
      costOfGoods,
      platformFees,
      deliveryFees,
      packagingCosts,
      totalCosts,
    },
    profit: {
      grossProfit,
      netProfit,
      profitMargin,
    },
    breakdown: {
      byProduct: productBreakdown,
      byPeriod,
    },
  };

  return profitLoss;
};

export const getProductProfitability = async (userId: string, productId: string) => {
  const seller = await prisma.seller.findUnique({
    where: { userId },
  });

  if (!seller) {
    throw new AppError('Seller profile not found', 404, 'SELLER_NOT_FOUND');
  }

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: {
      orderItems: {
        where: {
          status: 'delivered',
        },
      },
      variants: {
        include: {
          orderItems: {
            where: {
              status: 'delivered',
            },
          },
        },
      },
    },
  });

  if (!product) {
    throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
  }

  if (product.sellerId !== seller.id) {
    throw new AppError('Unauthorized', 403, 'FORBIDDEN');
  }

  // Calculate profitability
  const totalRevenue = product.orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
  const totalCost = product.orderItems.reduce((sum, item) => {
    const costPrice = product.costPrice ? Number(product.costPrice) : 0;
    return sum + (costPrice * item.quantity);
  }, 0);
  const totalProfit = totalRevenue - totalCost;
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  // Variant profitability
  const variantProfitability = product.variants.map(variant => {
    const variantRevenue = variant.orderItems.reduce((sum, item) => sum + Number(item.totalPrice), 0);
    const variantCost = variant.orderItems.reduce((sum, item) => {
      const costPrice = variant.costPrice ? Number(variant.costPrice) : 0;
      return sum + (costPrice * item.quantity);
    }, 0);
    const variantProfit = variantRevenue - variantCost;
    const variantMargin = variantRevenue > 0 ? (variantProfit / variantRevenue) * 100 : 0;

    return {
      variantId: variant.id,
      variantName: variant.name,
      revenue: variantRevenue,
      cost: variantCost,
      profit: variantProfit,
      margin: variantMargin,
    };
  });

  return {
    productId: product.id,
    productName: product.name,
    totalRevenue,
    totalCost,
    totalProfit,
    profitMargin,
    variantProfitability,
  };
};
