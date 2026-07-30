import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import riderService from './rider.service';

// The main happy-path order pipeline — admin can only move an order exactly
// one step forward at a time (no skipping straight to 'dispatched'/'delivered',
// which would leave the rider layer never dispatched for that order).
const ORDER_FORWARD_SEQUENCE = [
  'pending',
  'confirmed',
  'preparing',
  'ready',
  'dispatched',
  'in_transit',
  'delivered',
  'completed',
];

function isValidOrderStatusTransition(from: string, to: string): boolean {
  if (to === 'refunded') return from !== 'refunded';
  if (to === 'cancelled') return !['delivered', 'completed', 'cancelled', 'refunded'].includes(from);
  const fromIndex = ORDER_FORWARD_SEQUENCE.indexOf(from);
  const toIndex = ORDER_FORWARD_SEQUENCE.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  return toIndex === fromIndex + 1;
}

export class AdminOrderService {
  /**
   * Get all orders (admin)
   */
  async getAllOrders(filters: {
    page?: number;
    limit?: number;
    orderStatus?: string;
    paymentStatus?: string;
    customerId?: string;
    sellerId?: string;
    dateFrom?: string;
    dateTo?: string;
    orderNumber?: string;
  }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.orderStatus) {
      where.orderStatus = filters.orderStatus;
    }

    if (filters.paymentStatus) {
      where.paymentStatus = filters.paymentStatus;
    }

    if (filters.customerId) {
      where.customerId = filters.customerId;
    }

    if (filters.orderNumber) {
      where.orderNumber = { contains: filters.orderNumber, mode: 'insensitive' };
    }

    if (filters.dateFrom || filters.dateTo) {
      where.createdAt = {};
      if (filters.dateFrom) where.createdAt.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.createdAt.lte = new Date(filters.dateTo);
    }

    // If sellerId filter, need to filter by order items
    if (filters.sellerId) {
      const seller = await prisma.seller.findUnique({
        where: { userId: filters.sellerId },
      });

      if (seller) {
        const orderIds = await prisma.orderItem.findMany({
          where: { sellerId: seller.id },
          select: { orderId: true },
          distinct: ['orderId'],
        });

        where.id = {
          in: orderIds.map((item) => item.orderId),
        };
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: {
              id: true,
              email: true,
              phone: true,
              profile: {
                select: {
                  fullName: true,
                },
              },
            },
          },
          items: {
            include: {
              seller: {
                select: {
                  id: true,
                  businessName: true,
                },
              },
              product: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          _count: {
            select: {
              items: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      orders: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        customer: order.customer
          ? {
              id: order.customer.id,
              email: order.customer.email,
              phone: order.customer.phone,
              profile: order.customer.profile ? { fullName: order.customer.profile.fullName } : undefined,
              name: order.customer.profile?.fullName || null,
            }
          : null,
        totalAmount: Number(order.totalAmount),
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        itemsCount: order._count.items,
        sellersCount: new Set(order.items.map((item) => item.sellerId)).size,
        createdAt: order.createdAt,
        estimatedDeliveryAt: order.estimatedDeliveryAt,
        deliveredAt: order.deliveredAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get order details (admin)
   */
  async getOrderDetails(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: {
          select: {
            id: true,
            email: true,
            phone: true,
            status: true,
            emailVerified: true,
            phoneVerified: true,
            createdAt: true,
            profile: true,
          },
        },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                },
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                businessNameUrdu: true,
                isVerified: true,
              },
            },
          },
        },
        deliveryAddress: true,
        hub: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          include: {
            order: {
              select: {
                orderNumber: true,
              },
            },
          },
        },
        delivery: {
          include: {
            rider: {
              select: {
                id: true,
              },
            },
          },
        },
        promotionUsages: {
          include: {
            promotion: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    return {
      ...order,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.deliveryFee),
      discountAmount: Number(order.discountAmount),
      taxAmount: Number(order.taxAmount),
      totalAmount: Number(order.totalAmount),
    };
  }

  /**
   * Update order status (admin)
   */
  async updateOrderStatus(
    orderId: string,
    adminId: string,
    status: string,
    notes?: string
  ) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Validate status transition
    const validStatuses = [
      'pending',
      'confirmed',
      'preparing',
      'ready',
      'dispatched',
      'in_transit',
      'delivered',
      'completed',
      'cancelled',
      'refunded',
    ];

    if (!validStatuses.includes(status)) {
      throw new AppError(`Invalid status: ${status}`, 400, 'INVALID_STATUS');
    }

    if (!isValidOrderStatusTransition(order.orderStatus, status)) {
      throw new AppError(
        `Cannot move an order from "${order.orderStatus}" to "${status}"`,
        400,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Update order status
    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: { orderStatus: status },
    });

    // Add status history
    await prisma.orderStatusHistory.create({
      data: {
        orderId,
        status,
        notes: notes || `Status updated by admin`,
        changedBy: adminId,
      },
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(orderId, status, adminId);
    if (status === 'ready') {
      await riderService.ensureDeliveryForOrder(orderId);
    }

    return updatedOrder;
  }

  /**
   * Cancel order (admin)
   */
  async cancelOrder(orderId: string, adminId: string, reason: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['pending', 'confirmed', 'preparing'];
    if (!cancellableStatuses.includes(order.orderStatus)) {
      throw new AppError(
        `Order cannot be cancelled. Current status: ${order.orderStatus}`,
        400,
        'ORDER_NOT_CANCELLABLE'
      );
    }

    // Cancel order and restore stock
    const cancelledOrder = await prisma.$transaction(async (tx) => {
      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          orderStatus: 'cancelled',
          cancellationReason: reason,
          cancelledBy: 'admin',
        },
      });

      // Cascade cancellation to all order items so the seller UI doesn't
      // show stale "Pending/Confirmed/Preparing" rows with action buttons
      await tx.orderItem.updateMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'cancelled' },
      });

      // Restore stock — a variant item drew from its own stock pool at order
      // time (see order.service.ts createOrder), so it must be restored there,
      // not on the shared product-level stock it never touched.
      for (const item of order.items) {
        if (item.variantId) {
          await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { increment: item.quantity } },
          });
        }
        if (item.productId) {
          await tx.product.update({
            where: { id: item.productId },
            data: {
              ...(item.variantId ? {} : { stockQuantity: { increment: item.quantity } }),
              totalOrders: { decrement: 1 },
            },
          });
        }
      }

      // Remove inventory reservations
      await tx.inventoryReservation.deleteMany({
        where: {
          reservationType: 'order',
          reservationId: orderId,
        },
      });

      // Add status history
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: 'cancelled',
          notes: `Cancelled by admin. Reason: ${reason}`,
          changedBy: adminId,
        },
      });

      return updatedOrder;
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(cancelledOrder.id, 'cancelled', adminId);

    return {
      orderId: cancelledOrder.id,
      status: cancelledOrder.orderStatus,
      refundAmount: cancelledOrder.paymentStatus === 'paid' ? Number(cancelledOrder.totalAmount) : 0,
      refundStatus: cancelledOrder.paymentStatus === 'paid' ? 'processing' : 'not_required',
    };
  }

  /**
   * Process refund (admin)
   *
   * Behaviour by payment method:
   *   - wallet: credits the user's wallet inside the same transaction → instant `refunded`
   *   - everything else (safepay / jazzcash / easypaisa / bank / cod):
   *     marks the order as `refund_pending` and emits an admin alert.
   *     The actual money movement must be triggered manually via the
   *     gateway dashboard until the refund API is wired up. Marking it as
   *     `refunded` here without moving cash would lie to customers.
   */
  async processRefund(orderId: string, adminId: string, refundAmount?: number) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }
    if (order.paymentStatus !== 'paid') {
      throw new AppError('Order is not paid, cannot process refund', 400, 'ORDER_NOT_PAID');
    }

    const refund = refundAmount || Number(order.totalAmount);
    const orderTotal = Number(order.totalAmount);
    if (refund <= 0 || refund > orderTotal) {
      throw new AppError(
        `Refund amount must be between 0 and ${orderTotal}`,
        400,
        'INVALID_REFUND_AMOUNT',
      );
    }

    const isWallet = order.paymentMethod === 'wallet';

    const result = await prisma.$transaction(async (tx) => {
      if (isWallet) {
        if (!order.customerId) {
          throw new AppError(
            'Cannot refund wallet — order has no customer',
            400,
            'NO_CUSTOMER',
          );
        }
        // Credit the wallet back atomically
        const wallet = await tx.wallet.findUnique({ where: { userId: order.customerId } });
        if (!wallet) {
          throw new AppError('Customer wallet not found', 404, 'WALLET_NOT_FOUND');
        }
        const balanceBefore = Number(wallet.balance);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: refund } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            orderId,
            transactionType: 'credit',
            amount: refund,
            balanceBefore,
            balanceAfter: balanceBefore + refund,
            description: `Refund for order ${order.orderNumber}`,
            status: 'completed',
          },
        });
      }

      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: isWallet ? 'refunded' : 'refund_pending',
          orderStatus: isWallet ? 'refunded' : order.orderStatus,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          status: isWallet ? 'refunded' : 'refund_pending',
          notes: isWallet
            ? `Refund credited to wallet by admin. Amount: ${refund}`
            : `Refund of ${refund} requested by admin — pending manual gateway processing (${order.paymentMethod}).`,
          changedBy: adminId,
        },
      });

      return updatedOrder;
    });

    await realtimeOrderService.emitOrderStatusUpdate(
      orderId,
      isWallet ? 'refunded' : 'refund_pending',
      adminId,
    );

    if (!isWallet) {
      console.warn(
        `[Refund] Order ${orderId} (${order.paymentMethod}) — DB marked refund_pending; ` +
          `process the actual refund in the gateway dashboard.`,
      );
    }

    return {
      orderId: result.id,
      refundAmount: refund,
      status: result.orderStatus,
      paymentStatus: result.paymentStatus,
      requiresManualGatewayAction: !isWallet,
    };
  }

  /**
   * Get platform analytics
   */
  async getPlatformAnalytics(filters: {
    dateFrom?: string;
    dateTo?: string;
  }) {
    const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dateTo = filters.dateTo ? new Date(filters.dateTo) : new Date();
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalOrders,
      totalRevenue,
      totalUsers,
      totalSellers,
      activeUsers,
      activeSellers,
      totalCommission,
      ordersByStatus,
      revenueByDay,
      ordersToday,
      revenueToday,
      ordersThisWeek,
      revenueThisWeek,
      ordersThisMonth,
      revenueThisMonth,
      allTimeOrders,
      allTimeRevenue,
    ] = await Promise.all([
      // Total orders (in period)
      prisma.order.count({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
      }),

      // Total revenue (GMV)
      prisma.order.aggregate({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
          paymentStatus: 'paid',
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // Total users (all customers)
      prisma.user.count({ where: { userType: 'customer' } }),
      // Total sellers (all sellers)
      prisma.seller.count(),

      // Active users (users who placed orders in period)
      prisma.order.findMany({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        select: {
          customerId: true,
        },
        distinct: ['customerId'],
      }),

      // Active sellers (sellers with orders)
      prisma.orderItem.findMany({
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        select: {
          sellerId: true,
        },
        distinct: ['sellerId'],
      }),

      // Total commission earned
      prisma.orderItem.aggregate({
        where: {
          order: {
            createdAt: {
              gte: dateFrom,
              lte: dateTo,
            },
            paymentStatus: 'paid',
          },
        },
        _sum: {
          commissionAmount: true,
        },
      }),

      // Orders by status
      prisma.order.groupBy({
        by: ['orderStatus'],
        where: {
          createdAt: {
            gte: dateFrom,
            lte: dateTo,
          },
        },
        _count: {
          id: true,
        },
      }),

      // Revenue by day (last 30 days)
      prisma.$queryRaw`
        SELECT 
          DATE(created_at) as date,
          COUNT(*) as orders,
          SUM(total_amount) as revenue
        FROM orders
        WHERE created_at >= ${dateFrom}
          AND created_at <= ${dateTo}
          AND payment_status = 'paid'
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `,

      // Orders today
      prisma.order.count({
        where: { createdAt: { gte: todayStart } },
      }),
      // Revenue today (paid only)
      prisma.order.aggregate({
        where: {
          createdAt: { gte: todayStart },
          paymentStatus: 'paid',
        },
        _sum: { totalAmount: true },
      }),
      // Orders this week
      prisma.order.count({
        where: { createdAt: { gte: weekStart } },
      }),
      // Revenue this week (paid only)
      prisma.order.aggregate({
        where: {
          createdAt: { gte: weekStart },
          paymentStatus: 'paid',
        },
        _sum: { totalAmount: true },
      }),
      // Orders this month
      prisma.order.count({
        where: { createdAt: { gte: monthStart } },
      }),
      // Revenue this month (paid only)
      prisma.order.aggregate({
        where: {
          createdAt: { gte: monthStart },
          paymentStatus: 'paid',
        },
        _sum: { totalAmount: true },
      }),
      // All-time order count, independent of the dateFrom/dateTo window
      prisma.order.count(),
      // All-time revenue (paid only), independent of the dateFrom/dateTo window
      prisma.order.aggregate({
        where: { paymentStatus: 'paid' },
        _sum: { totalAmount: true },
      }),
    ]);

    const totalRevenueNum = Number(totalRevenue._sum.totalAmount || 0);
    return {
      period: { from: dateFrom.toISOString(), to: dateTo.toISOString() },
      overview: {
        periodOrders: totalOrders,
        totalOrders: allTimeOrders,
        totalRevenue: Number(allTimeRevenue._sum.totalAmount || 0),
        periodRevenue: totalRevenueNum,
        totalUsers,
        totalSellers,
        activeUsers: activeUsers.filter((u) => u.customerId).length,
        activeSellers: activeSellers.length,
        totalCommission: Number(totalCommission._sum.commissionAmount || 0),
      },
      revenue: {
        today: Number(revenueToday._sum.totalAmount || 0),
        thisWeek: Number(revenueThisWeek._sum.totalAmount || 0),
        thisMonth: Number(revenueThisMonth._sum.totalAmount || 0),
        total: totalRevenueNum,
      },
      orders: {
        today: ordersToday,
        thisWeek: ordersThisWeek,
        thisMonth: ordersThisMonth,
        total: totalOrders,
      },
      ordersByStatus: ordersByStatus.reduce(
        (acc, item) => {
          acc[item.orderStatus] = item._count.id;
          return acc;
        },
        {} as Record<string, number>
      ),
      revenueByDay: revenueByDay,
    };
  }

  /**
   * Get order statistics
   */
  async getOrderStatistics() {
    const [
      todayOrders,
      todayRevenue,
      pendingOrders,
      inTransitOrders,
      cancelledOrders,
      averageOrderValue,
    ] = await Promise.all([
      // Today's orders
      prisma.order.count({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),

      // Today's revenue
      prisma.order.aggregate({
        where: {
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
          paymentStatus: 'paid',
        },
        _sum: {
          totalAmount: true,
        },
      }),

      // Pending orders
      prisma.order.count({
        where: {
          orderStatus: 'pending',
        },
      }),

      // In transit orders
      prisma.order.count({
        where: {
          orderStatus: 'in_transit',
        },
      }),

      // Cancelled orders (last 7 days)
      prisma.order.count({
        where: {
          orderStatus: 'cancelled',
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
      }),

      // Average order value
      prisma.order.aggregate({
        where: {
          paymentStatus: 'paid',
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        _avg: {
          totalAmount: true,
        },
      }),
    ]);

    return {
      today: {
        orders: todayOrders,
        revenue: Number(todayRevenue._sum.totalAmount || 0),
      },
      pendingOrders,
      inTransitOrders,
      cancelledOrdersLast7Days: cancelledOrders,
      averageOrderValue: Number(averageOrderValue._avg.totalAmount || 0),
    };
  }
}

export default new AdminOrderService();

