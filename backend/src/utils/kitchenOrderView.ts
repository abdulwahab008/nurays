import { Prisma } from '@prisma/client';
import { deliveryProviderOf } from './paymentCustody';
import { selfDeliveryFeeFor, sellerPaidDeliveryFor } from './deliveryEarnings';

/**
 * What a kitchen may see of one of its orders.
 *
 * The view is built from an explicit list of fields, both in the database query and in the
 * presenter below. A column added to the orders table later stays out of the kitchen's view
 * until someone adds it here. In particular a kitchen never receives the customer's account id,
 * the address row's owner id, map pin or postcode, the checkout's idempotency key, the payment
 * gateway's transaction id or the handover code.
 *
 * Who sees the customer's phone and street, and when, is a separate product rule; this module
 * keeps today's visibility and only removes what no kitchen needs.
 */

/** The query for one order, as the kitchen with this seller id may read it. */
export function kitchenOrderSelect(sellerId: string) {
  return {
    id: true,
    orderNumber: true,
    orderStatus: true,
    createdAt: true,
    updatedAt: true,
    estimatedDeliveryAt: true,
    deliveredAt: true,
    cancellationReason: true,
    cancelledBy: true,
    notes: true,
    deliveryInstructions: true,
    deliverySlotDate: true,
    deliverySlotTime: true,
    deliveryType: true,
    deliveryProvider: true,
    // Read only to work out this kitchen's delivery earnings; never returned as is.
    deliveryFeeBreakdown: true,
    subtotal: true,
    deliveryFee: true,
    discountAmount: true,
    taxAmount: true,
    totalAmount: true,
    paymentMethod: true,
    paymentStatus: true,
    // What the kitchen needs to confirm or dispute a manual transfer.
    paymentReferenceNumber: true,
    paymentSenderName: true,
    paymentSenderAccount: true,
    paymentProofUrl: true,
    paymentNotes: true,
    paymentSubmittedAt: true,
    paymentDisputeReason: true,
    paymentConfirmedBy: true,
    paymentConfirmedAt: true,
    paidAt: true,
    // The address as it was when the order was placed (older orders have only the saved address).
    deliveryAddressSnapshot: true,
    deliveryAddress: {
      select: { label: true, addressLine1: true, addressLine2: true, houseNumber: true, landmark: true, area: true, city: true },
    },
    customer: { select: { phone: true, profile: { select: { fullName: true } } } },
    items: {
      where: { sellerId },
      select: {
        id: true,
        productId: true,
        variantId: true,
        productName: true,
        variantName: true,
        productImage: true,
        quantity: true,
        unitPrice: true,
        totalPrice: true,
        commissionRate: true,
        commissionAmount: true,
        sellerPayout: true,
        promoDiscount: true,
        fulfillmentType: true,
        status: true,
        createdAt: true,
        product: {
          select: { id: true, name: true, slug: true, images: { where: { isPrimary: true }, take: 1, select: { imageUrl: true } } },
        },
      },
    },
    statusHistory: { orderBy: { createdAt: 'asc' as const }, select: { id: true, status: true, notes: true, createdAt: true } },
  } satisfies Prisma.OrderSelect;
}

export type KitchenOrderRow = Prisma.OrderGetPayload<{ select: ReturnType<typeof kitchenOrderSelect> }>;

export interface KitchenOrderContext {
  sellerId: string;
  businessName: string | null;
  businessNameUrdu: string | null;
  /** The kitchen's own delivery setting, used for orders placed before the provider was stored on the order. */
  sellerDeliveryProvider?: string | null;
  /** The payment receipt as a short-lived link (the stored value is private). */
  paymentProofUrl: string | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/**
 * The door the kitchen hands the order to: the address as it was when the order was placed, never
 * the pin or postcode. A field the snapshot does not have at all (orders placed before it kept the
 * house number and landmark) comes from the saved address, which is all there is for it; a field the
 * snapshot has, even an empty one, is final, so a later edit of the saved address cannot move it.
 */
function kitchenAddress(order: KitchenOrderRow) {
  const live = order.deliveryAddress as Record<string, unknown> | null;
  const snap = order.deliveryAddressSnapshot && typeof order.deliveryAddressSnapshot === 'object' && !Array.isArray(order.deliveryAddressSnapshot)
    ? (order.deliveryAddressSnapshot as Record<string, unknown>)
    : null;
  if (!live && !snap) return null;
  const pick = (key: string) => (snap && key in snap ? text(snap[key]) : text(live?.[key]));
  return {
    label: (live?.label as string | null | undefined) ?? null,
    addressLine1: pick('addressLine1'),
    addressLine2: pick('addressLine2'),
    houseNumber: pick('houseNumber'),
    landmark: pick('landmark'),
    area: pick('area'),
    city: pick('city'),
  };
}

export function presentKitchenOrder(order: KitchenOrderRow, ctx: KitchenOrderContext) {
  const sellerTotals = order.items.reduce(
    (t, i) => ({
      subtotal: t.subtotal + Number(i.totalPrice),
      commission: t.commission + Number(i.commissionAmount),
      payout: t.payout + Number(i.sellerPayout),
    }),
    { subtotal: 0, commission: 0, payout: 0 }
  );

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    estimatedDeliveryAt: order.estimatedDeliveryAt,
    deliveredAt: order.deliveredAt,
    cancellationReason: order.cancellationReason,
    cancelledBy: order.cancelledBy,
    notes: order.notes,
    deliveryInstructions: order.deliveryInstructions,
    deliverySlotDate: order.deliverySlotDate,
    deliverySlotTime: order.deliverySlotTime,
    deliveryType: order.deliveryType,
    deliveryProvider: order.deliveryProvider,
    // Who hands the order over: the kitchen itself (self-delivery or pickup) or a Nuray rider.
    sellerHandsOver: order.deliveryType === 'self_pickup' || deliveryProviderOf(order, ctx.sellerDeliveryProvider) === 'self',
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.deliveryFee),
    discountAmount: Number(order.discountAmount),
    taxAmount: Number(order.taxAmount),
    totalAmount: Number(order.totalAmount),
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    paymentReferenceNumber: order.paymentReferenceNumber,
    paymentSenderName: order.paymentSenderName,
    paymentSenderAccount: order.paymentSenderAccount,
    paymentProofUrl: ctx.paymentProofUrl,
    paymentNotes: order.paymentNotes,
    paymentSubmittedAt: order.paymentSubmittedAt,
    paymentDisputeReason: order.paymentDisputeReason,
    paymentConfirmedBy: order.paymentConfirmedBy,
    paymentConfirmedAt: order.paymentConfirmedAt,
    paidAt: order.paidAt,
    customer: order.customer
      ? { phone: order.customer.phone, profile: order.customer.profile ? { fullName: order.customer.profile.fullName } : null }
      : null,
    deliveryAddress: kitchenAddress(order),
    items: order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      productName: i.productName,
      variantName: i.variantName,
      productImage: i.productImage,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
      commissionRate: Number(i.commissionRate),
      commissionAmount: Number(i.commissionAmount),
      sellerPayout: Number(i.sellerPayout),
      promoDiscount: Number(i.promoDiscount),
      fulfillmentType: i.fulfillmentType,
      status: i.status,
      createdAt: i.createdAt,
      seller: { businessName: ctx.businessName, businessNameUrdu: ctx.businessNameUrdu },
      product: i.product
        ? { id: i.product.id, name: i.product.name, slug: i.product.slug, images: i.product.images.map((img) => ({ imageUrl: img.imageUrl })) }
        : null,
    })),
    statusHistory: order.statusHistory.map((h) => ({ id: h.id, status: h.status, notes: h.notes, createdAt: h.createdAt })),
    sellerTotals: {
      ...sellerTotals,
      // Delivery fee this kitchen keeps because it delivers the order itself.
      deliveryFeeKept: selfDeliveryFeeFor(order.deliveryFeeBreakdown, ctx.sellerId),
      // Nuray's delivery fee for a Nuray rider, paid by the kitchen out of its earnings.
      deliveryFeePaid: sellerPaidDeliveryFor(order.deliveryFeeBreakdown, ctx.sellerId),
    },
  };
}
