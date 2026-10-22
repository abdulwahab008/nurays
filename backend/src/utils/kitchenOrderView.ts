import { Prisma } from '@prisma/client';
import { deliveryProviderOf } from './paymentCustody';
import { selfDeliveryFeeFor, sellerPaidDeliveryFor } from './deliveryEarnings';
import { doorField } from './addressSnapshot';

/**
 * What a kitchen may see of one of its orders.
 *
 * The view is built from an explicit list of fields, both in the database query and in the
 * presenter below. A column added to the orders table later stays out of the kitchen's view
 * until someone adds it here. In particular a kitchen never receives the customer's account id,
 * the address row's owner id, map pin or postcode, the checkout's idempotency key, the payment
 * gateway's transaction id or the handover code.
 *
 * The customer's phone and door (street, house, landmark) follow `kitchenContactRule` (PRIV-4): the
 * kitchen sees them only when it hands the order over itself, from accepting it until a day after delivery.
 */

/** How long after delivery the kitchen still sees the customer's phone and door (for a forgotten item, a question). */
export const CONTACT_AFTER_DELIVERY_MS = 24 * 60 * 60 * 1000;

/** The order states between accepting an order and its delivery. */
const ACCEPTED_STATUSES = ['confirmed', 'preparing', 'ready', 'dispatched', 'in_transit', 'delivery_failed'];

/**
 * Why the customer's phone and door are hidden from the kitchen, or null when it sees them.
 *  - nuray_rider:  a Nuray rider (or a hub) hands the order over; the rider and support do the contact.
 *  - not_accepted: the kitchen has not accepted the order yet (or it was cancelled before).
 *  - closed:       delivered more than a day ago, or cancelled or refunded.
 * The area and city are always shown, and the customer's first name; the full name with the contact.
 */
export type ContactHidden = 'nuray_rider' | 'not_accepted' | 'closed' | null;

export function kitchenContactRule(
  order: { orderStatus: string; deliveryType: string; deliveryProvider?: string | null; deliveryFeeBreakdown?: unknown; deliveredAt?: Date | null },
  sellerDeliveryProvider?: string | null,
  now: Date = new Date()
): ContactHidden {
  const handsOver = order.deliveryType === 'self_pickup' || deliveryProviderOf(order, sellerDeliveryProvider) === 'self';
  if (!handsOver) return 'nuray_rider';
  if (order.orderStatus === 'delivered' || order.orderStatus === 'completed') {
    const at = order.deliveredAt?.getTime();
    return at != null && now.getTime() - at <= CONTACT_AFTER_DELIVERY_MS ? null : 'closed';
  }
  if (order.orderStatus === 'cancelled' || order.orderStatus === 'refunded') return 'closed';
  return ACCEPTED_STATUSES.includes(order.orderStatus) ? null : 'not_accepted';
}

/** The first word of a name: what a kitchen sees of the customer while the contact is hidden. */
export const firstName = (name: string | null | undefined): string | null => name?.trim().split(/\s+/)[0] || null;

/** The door fields that go with the phone. */
const DOOR_FIELDS = ['addressLine1', 'addressLine2', 'houseNumber', 'landmark'] as const;
export function withoutDoor<T extends Record<string, unknown> | null>(address: T): T {
  if (!address) return address;
  const out: Record<string, unknown> = { ...address };
  for (const f of DOOR_FIELDS) if (f in out) out[f] = null;
  return out as T;
}

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
  const live = order.deliveryAddress;
  if (!live && !order.deliveryAddressSnapshot) return null;
  const pick = (key: 'addressLine1' | 'addressLine2' | 'houseNumber' | 'landmark' | 'area' | 'city') => text(doorField(order.deliveryAddressSnapshot, live, key));
  return {
    label: live?.label ?? null,
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

  const contactHidden = kitchenContactRule(order, ctx.sellerDeliveryProvider);
  const fullName = order.customer?.profile?.fullName ?? null;

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
      ? {
          phone: contactHidden ? null : order.customer.phone,
          profile: order.customer.profile ? { fullName: contactHidden ? firstName(fullName) : fullName } : null,
        }
      : null,
    deliveryAddress: contactHidden ? withoutDoor(kitchenAddress(order)) : kitchenAddress(order),
    // Why the phone and door are not shown (null when they are): see kitchenContactRule.
    contactHidden,
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
