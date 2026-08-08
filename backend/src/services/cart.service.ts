import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getDeliveryFeeForSeller } from '../utils/deliveryFee';

export class CartService {
  /**
   * Get or create cart for user
   */
  private async getOrCreateCart(userId: string) {
    let cart = await prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      cart = await prisma.cart.create({
        data: {
          userId,
        },
      });
    }

    return cart;
  }

  /**
   * Get cart with items
   */
  async getCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        product: {
          include: {
            images: {
              orderBy: { sortOrder: 'asc' },
              take: 1,
            },
            seller: {
              select: {
                id: true,
                businessName: true,
                businessNameUrdu: true,
                isVerified: true,
                ratingAverage: true,
              },
            },
          },
        },
        variant: true,
        seller: {
          select: {
            id: true,
            businessName: true,
            businessNameUrdu: true,
            isVerified: true,
          },
        },
        hub: {
          select: {
            id: true,
            name: true,
            area: true,
          },
        },
      },
    });

    // Calculate summary
    let subtotal = 0;
    const sellers = new Set<string>();
    let totalItems = 0;

    items.forEach((item) => {
      const price = Number(item.priceSnapshot);
      subtotal += price * item.quantity;
      sellers.add(item.sellerId);
      totalItems += item.quantity;
    });

    // Calculate delivery fee (will be calculated at checkout)
    const deliveryFee = 0; // Placeholder
    const discount = 0; // Placeholder
    const total = subtotal + deliveryFee - discount;

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    return {
      items: items.map((item) => {
        const rawImage = item.product.images[0]?.imageUrl || null;
        const image = rawImage
          ? rawImage.startsWith('http')
            ? rawImage
            : `${baseUrl}${rawImage}`
          : null;
        return {
        id: item.id,
        product: {
          id: item.product.id,
          name: item.product.name,
          nameUrdu: item.product.nameUrdu,
          slug: item.product.slug,
          price: Number(item.product.price),
          image,
          allergens: item.product.allergens,
          dietaryInfo: item.product.dietaryInfo,
        },
        variant: item.variant
          ? { id: item.variant.id, name: item.variant.name, price: Number(item.variant.price) }
          : null,
        seller: {
          id: item.seller.id,
          businessName: item.seller.businessName,
          businessNameUrdu: item.seller.businessNameUrdu,
          isVerified: item.seller.isVerified,
        },
        quantity: item.quantity,
        stockType: item.stockType,
        hub: item.hub
          ? {
              id: item.hub.id,
              name: item.hub.name,
              area: item.hub.area,
            }
          : null,
        subtotal: Number(item.priceSnapshot) * item.quantity,
        priceSnapshot: Number(item.priceSnapshot),
      };
      }),
      summary: {
        subtotal,
        deliveryFee,
        discount,
        total,
        totalItems,
        totalSellers: sellers.size,
      },
    };
  }

  /**
   * Get delivery fee estimate for the current cart when delivered to the given address.
   * Fee is the sum of each seller's delivery fee (seller-controlled: free in their areas, fixed or distance-based outside).
   */
  async getDeliveryFeeEstimate(userId: string, addressId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        product: { select: { price: true } },
        seller: {
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
        },
        hub: { select: { id: true, latitude: true, longitude: true } },
      },
    });
    if (items.length === 0) {
      return { deliveryFee: 0, isFree: true, reason: null };
    }
    const address = await prisma.userAddress.findFirst({
      where: { id: addressId, userId },
    });
    if (!address) {
      throw new AppError('Address not found', 404, 'ADDRESS_NOT_FOUND');
    }
    const addr = {
      area: address.area,
      city: address.city,
      latitude: address.latitude != null ? Number(address.latitude) : null,
      longitude: address.longitude != null ? Number(address.longitude) : null,
    };
    const sellerFeeMap = new Map<string, number>();
    for (const item of items) {
      if (sellerFeeMap.has(item.sellerId)) continue;
      const originLat = item.hub?.latitude != null ? Number(item.hub.latitude) : (item.seller.latitude != null ? Number(item.seller.latitude) : null);
      const originLng = item.hub?.longitude != null ? Number(item.hub.longitude) : (item.seller.longitude != null ? Number(item.seller.longitude) : null);
      const fee = getDeliveryFeeForSeller(
        item.seller as Parameters<typeof getDeliveryFeeForSeller>[0],
        addr,
        originLat,
        originLng
      );
      sellerFeeMap.set(item.sellerId, fee);
    }
    const deliveryFee = [...sellerFeeMap.values()].reduce((a, b) => a + b, 0);
    const isFree = deliveryFee === 0;
    let reason: string | null = null;
    if (isFree && sellerFeeMap.size > 0) reason = 'Free delivery to your area';
    return { deliveryFee, isFree, reason };
  }

  /**
   * Add item to cart
   */
  async addToCart(
    userId: string,
    data: {
      productId: string;
      variantId?: string;
      quantity: number;
      stockType?: string;
      hubId?: string;
    }
  ) {
    // Get or create cart
    const cart = await this.getOrCreateCart(userId);

    // Get product by ID or slug
    const product = await prisma.product.findFirst({
      where: {
        OR: [{ id: data.productId }, { slug: data.productId }],
      },
      include: {
        seller: true,
      },
    });

    if (!product) {
      throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
    }

    if (!product.isActive || product.approvalStatus !== 'approved') {
      throw new AppError('Product is not available', 400, 'PRODUCT_UNAVAILABLE');
    }

    const productId = product.id;

    // Resolve the variant, if one was requested — it drives price + stock instead of the base product.
    let variant = null;
    if (data.variantId) {
      variant = await prisma.productVariant.findFirst({
        where: { id: data.variantId, productId, isActive: true },
      });
      if (!variant) {
        throw new AppError('Product variant not found', 404, 'VARIANT_NOT_FOUND');
      }
    }

    // HubInventory only tracks stock per product, not per variant — a variant
    // has no hub-scoped stock to validate against, so force direct fulfillment
    // rather than silently checking the variant's total stock as if it were
    // this hub's stock.
    const effectiveStockType = variant ? 'direct' : (data.stockType || product.stockType);
    const effectiveHubId = variant ? null : (data.hubId || null);

    // Resolve available stock: variant stock takes priority, then hub inventory, else product stock
    let availableStock = variant ? variant.stockQuantity : product.stockQuantity;
    if (!variant && effectiveStockType === 'hub' && effectiveHubId) {
      const hubStock = await prisma.hubInventory.aggregate({
        where: {
          productId,
          hubId: effectiveHubId,
          status: 'available',
        },
        _sum: { quantity: true },
      });
      const hubQty = hubStock._sum.quantity ?? 0;
      if (hubQty >= 0) availableStock = hubQty;
    }

    // Check stock for new add
    if (availableStock < data.quantity) {
      throw new AppError(
        `Insufficient stock. Available: ${availableStock} (you requested ${data.quantity})`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }

    const priceSnapshot = variant ? variant.price : product.price;

    // Find existing cart line by resolved product id + variant (so slug vs uuid doesn't create
    // duplicates, and different variants of the same product stay separate lines)
    const existingItem = await prisma.cartItem.findFirst({
      where: {
        cartId: cart.id,
        productId,
        variantId: variant?.id ?? null,
        stockType: effectiveStockType,
        hubId: effectiveHubId,
      },
    });

    if (existingItem) {
      const newQuantity = existingItem.quantity + data.quantity;

      if (availableStock < newQuantity) {
        throw new AppError(
          `Insufficient stock. Available: ${availableStock}. You already have ${existingItem.quantity} in your cart (adding ${data.quantity} would make ${newQuantity}).`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      const updatedItem = await prisma.cartItem.update({
        where: { id: existingItem.id },
        data: {
          quantity: newQuantity,
          priceSnapshot, // Update price snapshot
        },
        include: {
          product: {
            include: {
              images: {
                where: { isPrimary: true },
                take: 1,
              },
            },
          },
        },
      });

      return updatedItem;
    }

    // Create new cart item (use resolved productId so slug/uuid never duplicates)
    const cartItem = await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId,
        variantId: variant?.id,
        sellerId: product.seller.id,
        quantity: data.quantity,
        stockType: effectiveStockType,
        hubId: effectiveHubId,
        priceSnapshot,
      },
      include: {
        product: {
          include: {
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
          },
        },
      },
    });

    return cartItem;
  }

  /**
   * Update cart item
   */
  async updateCartItem(
    userId: string,
    itemId: string,
    data: {
      quantity?: number;
      stockType?: string;
      hubId?: string;
    }
  ) {
    // Verify cart item belongs to user
    const cart = await this.getOrCreateCart(userId);
    const cartItem = await prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
      include: {
        product: true,
      },
    });

    if (!cartItem) {
      throw new AppError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
    }

    // If quantity is being updated, check stock
    if (data.quantity !== undefined) {
      if (data.quantity <= 0) {
        // Remove item if quantity is 0 or less
        await prisma.cartItem.delete({
          where: { id: itemId },
        });
        return null;
      }

      // Check stock — variant stock takes priority over the base product's
      if (cartItem.variantId) {
        const variant = await prisma.productVariant.findUnique({ where: { id: cartItem.variantId } });
        if (!variant) {
          throw new AppError('Product variant not found', 404, 'VARIANT_NOT_FOUND');
        }
        if (variant.stockQuantity < data.quantity) {
          throw new AppError(
            `Insufficient stock. Available: ${variant.stockQuantity}`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }
      } else {
        const product = await prisma.product.findUnique({
          where: { id: cartItem.productId },
        });

        if (!product) {
          throw new AppError('Product not found', 404, 'PRODUCT_NOT_FOUND');
        }

        if (product.stockQuantity < data.quantity) {
          throw new AppError(
            `Insufficient stock. Available: ${product.stockQuantity}`,
            400,
            'INSUFFICIENT_STOCK'
          );
        }
      }
    }

    // Update cart item
    const updatedItem = await prisma.cartItem.update({
      where: { id: itemId },
      data: {
        quantity: data.quantity,
        stockType: data.stockType,
        hubId: data.hubId,
        priceSnapshot: cartItem.product.price, // Update price snapshot
      },
      include: {
        product: {
          include: {
            images: {
              where: { isPrimary: true },
              take: 1,
            },
          },
        },
      },
    });

    return updatedItem;
  }

  /**
   * Remove item from cart
   */
  async removeFromCart(userId: string, itemId: string) {
    // Verify cart item belongs to user
    const cart = await this.getOrCreateCart(userId);
    const cartItem = await prisma.cartItem.findFirst({
      where: {
        id: itemId,
        cartId: cart.id,
      },
    });

    if (!cartItem) {
      throw new AppError('Cart item not found', 404, 'CART_ITEM_NOT_FOUND');
    }

    await prisma.cartItem.delete({
      where: { id: itemId },
    });

    return { message: 'Item removed from cart' };
  }

  /**
   * Clear cart
   */
  async clearCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);

    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return { message: 'Cart cleared' };
  }

  /**
   * Validate cart before checkout
   */
  async validateCart(userId: string) {
    const cart = await this.getOrCreateCart(userId);
    const items = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
      include: {
        product: true,
        variant: true,
      },
    });

    if (items.length === 0) {
      throw new AppError('Cart is empty', 400, 'CART_EMPTY');
    }

    const errors: string[] = [];

    for (const item of items) {
      // Check if product still exists and is active
      if (!item.product.isActive || item.product.approvalStatus !== 'approved') {
        errors.push(`${item.product.name} is no longer available`);
        continue;
      }

      if (item.variant) {
        if (!item.variant.isActive) {
          errors.push(`${item.product.name} (${item.variant.name}) is no longer available`);
          continue;
        }
        if (item.variant.stockQuantity < item.quantity) {
          errors.push(
            `Insufficient stock for ${item.product.name} (${item.variant.name}). Available: ${item.variant.stockQuantity}`
          );
          continue;
        }
        if (Number(item.variant.price) !== Number(item.priceSnapshot)) {
          errors.push(`Price changed for ${item.product.name} (${item.variant.name})`);
        }
        continue;
      }

      // Check stock
      if (item.product.stockQuantity < item.quantity) {
        errors.push(
          `Insufficient stock for ${item.product.name}. Available: ${item.product.stockQuantity}`
        );
        continue;
      }

      // Check if price changed
      if (Number(item.product.price) !== Number(item.priceSnapshot)) {
        errors.push(`Price changed for ${item.product.name}`);
      }
    }

    if (errors.length > 0) {
      throw new AppError('Cart validation failed', 400, 'CART_VALIDATION_FAILED', errors);
    }

    return { valid: true };
  }
}

export default new CartService();

