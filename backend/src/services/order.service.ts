import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { getDeliveryFeeForSeller } from '../utils/deliveryFee';
import { createStockAlert } from './stock-alert.service';

export class OrderService {
  /**
   * Generate unique order number
   */
  private generateOrderNumber(): string {
    const prefix = 'FN';
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `${prefix}${year}${month}${day}${random}`;
  }

  /**
   * Calculate delivery fee.
   * Free when: self_pickup/hub_pickup, or subtotal >= 2000, or delivery address is in all sellers' freeDeliveryAreas.
   */
  private calculateDeliveryFee(
    deliveryType: string,
    subtotal: number,
    city?: string
  ): number {
    if (deliveryType === 'self_pickup' || deliveryType === 'hub_pickup') {
      return 0;
    }

    // Base delivery fee
    let fee = 100;

    // Free delivery for orders above 2000 PKR
    if (subtotal >= 2000) {
      return 0;
    }

    // City-based pricing (can be enhanced)
    if (city === 'Karachi' || city === 'Lahore' || city === 'Islamabad') {
      fee = 150;
    }

    return fee;
  }

  /**
   * Create order from items
   */
  async createOrder(
    customerId: string,
    data: {
      items: Array<{
        productId: string;
        variantId?: string;
        quantity: number;
        stockType?: string;
        hubId?: string;
      }>;
      deliveryType: string;
      deliveryAddressId?: string;
      hubId?: string;
      deliverySlotDate?: string;
      deliverySlotTime?: string;
      paymentMethod: string;
      promotionCode?: string;
      deliveryInstructions?: string;
    }
  ) {
    // Verify customer exists
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new AppError('Customer not found', 404, 'CUSTOMER_NOT_FOUND');
    }

    // Get delivery address if provided
    let deliveryAddress = null;
    if (data.deliveryAddressId) {
      deliveryAddress = await prisma.userAddress.findFirst({
        where: {
          id: data.deliveryAddressId,
          userId: customerId,
        },
      });

      if (!deliveryAddress) {
        throw new AppError('Delivery address not found', 404, 'ADDRESS_NOT_FOUND');
      }
    }

    // Process items and calculate totals
    const orderItems: Array<{
      productId: string;
      variantId: string | null;
      variantName: string | null;
      sellerId: string;
      productName: string;
      productImage: string | null;
      quantity: number;
      unitPrice: number;
      totalPrice: number;
      commissionRate: any;
      commissionAmount: number;
      sellerPayout: number;
      fulfillmentType: string;
      hubId: string | null;
    }> = [];
    let subtotal = 0;

    for (const item of data.items) {
      // Get product
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        include: {
          seller: true,
        },
      });

      if (!product) {
        throw new AppError(`Product ${item.productId} not found`, 404, 'PRODUCT_NOT_FOUND');
      }

      if (!product.isActive || product.approvalStatus !== 'approved') {
        throw new AppError(`Product ${product.name} is not available`, 400, 'PRODUCT_UNAVAILABLE');
      }

      // Resolve the variant, if one was requested — it drives price + stock instead of the base product.
      let variant = null;
      if (item.variantId) {
        variant = await prisma.productVariant.findFirst({
          where: { id: item.variantId, productId: product.id, isActive: true },
        });
        if (!variant) {
          throw new AppError(`Variant not found for ${product.name}`, 404, 'VARIANT_NOT_FOUND');
        }
      }

      // Check stock
      const availableStock = variant ? variant.stockQuantity : product.stockQuantity;
      if (availableStock < item.quantity) {
        throw new AppError(
          `Insufficient stock for ${product.name}${variant ? ` (${variant.name})` : ''}. Available: ${availableStock}`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      // Calculate item total
      const unitPrice = variant ? Number(variant.price) : Number(product.price);
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      // Get commission rate
      const commissionRate = Number(product.seller.commissionRate) / 100;
      const commissionAmount = itemTotal * commissionRate;
      const sellerPayout = itemTotal - commissionAmount;

      // Get product primary image
      const productImage = await prisma.productImage.findFirst({
        where: {
          productId: product.id,
          isPrimary: true,
        },
        select: {
          imageUrl: true,
        },
      });

      orderItems.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        sellerId: product.seller.id,
        productName: product.name,
        productImage: productImage?.imageUrl || null,
        quantity: item.quantity,
        unitPrice,
        totalPrice: itemTotal,
        commissionRate: product.seller.commissionRate,
        commissionAmount,
        sellerPayout,
        fulfillmentType: item.stockType || product.stockType,
        hubId: item.hubId || null,
      });
    }

    // Calculate delivery fee: per-seller (free in their areas, fixed or distance-based outside), then sum
    let deliveryFee: number;
    if (data.deliveryType === 'self_pickup' || data.deliveryType === 'hub_pickup') {
      deliveryFee = 0;
    } else if (data.deliveryType === 'home_delivery' && deliveryAddress && orderItems.length > 0) {
      const uniqueSellerIds = [...new Set(orderItems.map((i) => i.sellerId))];
      const sellerToHubId = new Map<string, string | null>();
      for (const item of orderItems) {
        if (!sellerToHubId.has(item.sellerId)) sellerToHubId.set(item.sellerId, item.hubId);
      }
      const sellers = await prisma.seller.findMany({
        where: { id: { in: uniqueSellerIds } },
        select: {
          id: true,
          freeDeliveryAreas: true,
          freeDeliveryRadiusKm: true,
          latitude: true,
          longitude: true,
          deliveryFeeType: true,
          deliveryFeeFixed: true,
          deliveryFeeBase: true,
          deliveryFeePerKm: true,
        },
      });
      const hubIds = [...sellerToHubId.values()].filter((id): id is string => id != null);
      const hubs = hubIds.length > 0
        ? await prisma.hubCenter.findMany({
            where: { id: { in: hubIds } },
            select: { id: true, latitude: true, longitude: true },
          })
        : [];
      const hubById = new Map(hubs.map((h) => [h.id, h]));
      const addr = {
        area: deliveryAddress.area,
        city: deliveryAddress.city,
        latitude: deliveryAddress.latitude != null ? Number(deliveryAddress.latitude) : null,
        longitude: deliveryAddress.longitude != null ? Number(deliveryAddress.longitude) : null,
      };
      let total = 0;
      for (const seller of sellers) {
        const hubId = sellerToHubId.get(seller.id) ?? null;
        const hub = hubId ? hubById.get(hubId) : null;
        const originLat = hub?.latitude != null ? Number(hub.latitude) : (seller.latitude != null ? Number(seller.latitude) : null);
        const originLng = hub?.longitude != null ? Number(hub.longitude) : (seller.longitude != null ? Number(seller.longitude) : null);
        total += getDeliveryFeeForSeller(seller, addr, originLat, originLng);
      }
      deliveryFee = total;
    } else {
      deliveryFee = this.calculateDeliveryFee(
        data.deliveryType,
        subtotal,
        deliveryAddress?.city || undefined
      );
    }

    // Apply promotion code if provided
    let discountAmount = 0;
    let promotionId = null;
    if (data.promotionCode) {
      const promotion = await prisma.promotion.findUnique({
        where: { code: data.promotionCode },
      });

      if (promotion && promotion.isActive) {
        const now = new Date();
        const withinLimits =
          (!promotion.usageLimitTotal || promotion.usedCount < promotion.usageLimitTotal) &&
          (await prisma.promotionUsage.count({
            where: { promotionId: promotion.id, userId: customerId },
          })) < promotion.usageLimitPerUser;

        if (
          now >= promotion.validFrom &&
          now <= promotion.validUntil &&
          withinLimits
        ) {
          if (subtotal >= Number(promotion.minOrderAmount)) {
            if (promotion.discountType === 'percentage') {
              discountAmount = subtotal * (Number(promotion.discountValue) / 100);
              if (promotion.maxDiscountAmount) {
                discountAmount = Math.min(discountAmount, Number(promotion.maxDiscountAmount));
              }
            } else {
              discountAmount = Number(promotion.discountValue);
            }
            // Never let a discount exceed the order subtotal it applies to.
            discountAmount = Math.min(discountAmount, subtotal);
            promotionId = promotion.id;
          }
        }
      }
    }

    // Calculate tax (5% GST for Pakistan)
    const taxAmount = (subtotal - discountAmount) * 0.05;

    // Calculate total
    const totalAmount = subtotal + deliveryFee - discountAmount + taxAmount;

    // Generate order number
    let orderNumber = this.generateOrderNumber();
    let orderNumberExists = true;
    while (orderNumberExists) {
      const existing = await prisma.order.findUnique({
        where: { orderNumber },
      });
      if (!existing) {
        orderNumberExists = false;
      } else {
        orderNumber = this.generateOrderNumber();
      }
    }

    // Create order with items in transaction
    const order = await prisma.$transaction(async (tx) => {
      // Create order
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          customerId,
          subtotal,
          deliveryFee,
          discountAmount,
          taxAmount,
          totalAmount,
          paymentMethod: data.paymentMethod,
          paymentStatus: 'pending',
          deliveryType: data.deliveryType,
          deliveryAddressId: data.deliveryAddressId,
          deliveryAddressSnapshot: deliveryAddress
            ? ({
                addressLine1: deliveryAddress.addressLine1,
                addressLine2: deliveryAddress.addressLine2,
                area: deliveryAddress.area,
                city: deliveryAddress.city,
                postalCode: deliveryAddress.postalCode,
              } as any)
            : undefined,
          hubId: data.hubId,
          deliverySlotDate: data.deliverySlotDate ? new Date(data.deliverySlotDate) : null,
          deliverySlotTime: data.deliverySlotTime,
          deliveryInstructions: data.deliveryInstructions,
          orderStatus: 'pending',
        },
      });

      // Create order items
      const createdItems = await Promise.all(
        orderItems.map((item) =>
          tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              productId: item.productId,
              variantId: item.variantId,
              variantName: item.variantName,
              sellerId: item.sellerId,
              productName: item.productName,
              productImage: item.productImage,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.totalPrice,
              commissionRate: item.commissionRate,
              commissionAmount: item.commissionAmount,
              sellerPayout: item.sellerPayout,
              fulfillmentType: item.fulfillmentType,
              hubId: item.hubId,
              status: 'pending',
            },
          })
        )
      );

      // Update stock: variant stock when the item is a specific variant, else the base product.
      const updatedProducts: Array<{
        id: string;
        sellerId: string;
        variantId: string | null;
        stockQuantity: number;
        stockThreshold: number | null;
      }> = [];
      for (const item of orderItems) {
        if (item.variantId) {
          const updatedVariant = await tx.productVariant.update({
            where: { id: item.variantId },
            data: { stockQuantity: { decrement: item.quantity } },
          });
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: { totalOrders: { increment: 1 } },
          });
          updatedProducts.push({
            id: updated.id,
            sellerId: updated.sellerId,
            variantId: item.variantId,
            stockQuantity: updatedVariant.stockQuantity,
            stockThreshold: updatedVariant.stockThreshold,
          });
        } else {
          const updated = await tx.product.update({
            where: { id: item.productId },
            data: {
              stockQuantity: { decrement: item.quantity },
              totalOrders: { increment: 1 },
            },
          });
          updatedProducts.push({
            id: updated.id,
            sellerId: updated.sellerId,
            variantId: null,
            stockQuantity: updated.stockQuantity,
            stockThreshold: null,
          });
        }
      }

      // Create inventory reservations
      for (const item of orderItems) {
        if (item.fulfillmentType === 'hub' && item.hubId) {
          await tx.inventoryReservation.create({
            data: {
              productId: item.productId,
              quantity: item.quantity,
              reservationType: 'order',
              reservationId: newOrder.id,
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
          });
        }
      }

      // Create order status history
      await tx.orderStatusHistory.create({
        data: {
          orderId: newOrder.id,
          status: 'pending',
          notes: 'Order created',
        },
      });

      // Record promotion usage if applicable
      if (promotionId) {
        await tx.promotionUsage.create({
          data: {
            promotionId,
            userId: customerId,
            orderId: newOrder.id,
            discountApplied: discountAmount,
          },
        });

        await tx.promotion.update({
          where: { id: promotionId },
          data: { usedCount: { increment: 1 } },
        });
      }

      return { order: newOrder, items: createdItems, updatedProducts };
    });

    // Emit new order notification
    await realtimeOrderService.emitNewOrderNotification(order.order.id);

    // Fire low-stock / out-of-stock alerts for any product this order just depleted.
    // Done outside the transaction since it's not order-critical and sends email.
    for (const p of order.updatedProducts) {
      let threshold = p.stockThreshold ?? 10;
      if (p.stockThreshold == null) {
        const seller = await prisma.seller.findUnique({
          where: { id: p.sellerId },
          select: { lowStockThreshold: true },
        });
        threshold = seller?.lowStockThreshold ?? 10;
      }
      if (p.stockQuantity <= 0) {
        await createStockAlert({
          sellerId: p.sellerId,
          productId: p.id,
          variantId: p.variantId,
          alertType: 'out_of_stock',
          currentStock: p.stockQuantity,
          threshold,
        });
      } else if (p.stockQuantity <= threshold) {
        await createStockAlert({
          sellerId: p.sellerId,
          productId: p.id,
          variantId: p.variantId,
          alertType: 'low_stock',
          currentStock: p.stockQuantity,
          threshold,
        });
      }
    }

    // Get full order with relations
    const fullOrder = await prisma.order.findUnique({
      where: { id: order.order.id },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
            seller: {
              select: {
                id: true,
                businessName: true,
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
      },
    });

    return fullOrder;
  }

  /**
   * Get user orders
   */
  async getUserOrders(
    userId: string,
    filters: {
      page?: number;
      limit?: number;
      status?: string;
    }
  ) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      customerId: userId,
    };

    if (filters.status) {
      where.orderStatus = filters.status;
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            select: {
              id: true,
              productName: true,
              productImage: true,
              quantity: true,
              status: true,
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
      orders: orders.map((order) => {
        // Compute effective status: if DB says pending but every item is cancelled,
        // the order is functionally cancelled (backend bug guard for legacy records).
        const allCancelled =
          order.items.length > 0 &&
          order.items.every((item) => item.status === 'cancelled');
        const effectiveOrderStatus =
          order.orderStatus === 'pending' && allCancelled
            ? 'cancelled'
            : order.orderStatus;

        return {
          id: order.id,
          orderNumber: order.orderNumber,
          totalAmount: Number(order.totalAmount),
          orderStatus: effectiveOrderStatus,
          paymentStatus: order.paymentStatus,
          createdAt: order.createdAt,
          estimatedDeliveryAt: order.estimatedDeliveryAt,
          itemsCount: order._count.items,
          items: order.items.slice(0, 3),
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get order details
   */
  async getOrderDetails(orderId: string, userId: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
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
            city: true,
            area: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
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
   * Cancel order
   */
  async cancelOrder(orderId: string, userId: string, reason: string) {
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        customerId: userId,
      },
      include: {
        items: true,
      },
    });

    if (!order) {
      throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    }

    // Customer can only cancel while order is still pending (before seller has accepted)
    if (order.orderStatus !== 'pending') {
      throw new AppError(
        `Order cannot be cancelled. Current status: ${order.orderStatus}. Cancellation is only allowed before the seller confirms.`,
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
          cancelledBy: 'customer',
        },
      });

      // Cascade cancellation to all order items so the seller UI doesn't
      // show stale "Pending/Confirmed/Preparing" rows with action buttons
      await tx.orderItem.updateMany({
        where: { orderId, status: { notIn: ['cancelled', 'delivered'] } },
        data: { status: 'cancelled' },
      });

      // Restore product stock
      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId || '' },
          data: {
            stockQuantity: { increment: item.quantity },
            totalOrders: { decrement: 1 },
          },
        });
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
          notes: `Cancelled by customer. Reason: ${reason}`,
          changedBy: userId,
        },
      });

      return updatedOrder;
    });

    // Emit order status update
    await realtimeOrderService.emitOrderStatusUpdate(cancelledOrder.id, 'cancelled', userId);

    return {
      orderId: cancelledOrder.id,
      status: cancelledOrder.orderStatus,
      refundAmount: cancelledOrder.paymentStatus === 'paid' ? Number(cancelledOrder.totalAmount) : 0,
      refundStatus: cancelledOrder.paymentStatus === 'paid' ? 'processing' : 'not_required',
    };
  }
}

export default new OrderService();

