import { orderService, type OrderItem } from '@/lib/services/order.service';
import { cartService } from '@/lib/services/cart.service';

/** Puts every dish of an order back in the tray (replacing what is there), as it was ordered: variant, quantity, hub stock. */
export async function addOrderToTray(orderId: string, fallbackItems: OrderItem[] = []): Promise<void> {
  // The order list carries only the first dishes and not how each was stocked; the order itself has all of them.
  const items: OrderItem[] = (await orderService.getOrder(orderId)).data?.items ?? fallbackItems;
  for (const item of items) {
    const productId = item.productId || item.product?.id;
    if (!productId) continue;
    await cartService.addToCart({
      productId,
      variantId: item.variantId || undefined,
      quantity: item.quantity || 1,
      stockType: item.fulfillmentType === 'hub' ? 'hub' : 'direct',
      hubId: item.fulfillmentType === 'hub' ? item.hubId ?? undefined : undefined,
      clearAndAdd: true,
    });
  }
}
