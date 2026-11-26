import prisma from '../config/database';
import type { JobArea } from '../utils/dispatch';

/** Each order's area (utils/dispatch.ts inRiderArea): the kitchen's community and city, the customer's community. */
export async function jobAreas(orderIds: string[]): Promise<Map<string, JobArea>> {
  const orders = await prisma.order.findMany({
    where: { id: { in: orderIds } },
    select: {
      id: true,
      deliveryAddress: { select: { communityId: true, city: true } },
      items: { select: { status: true, seller: { select: { communityId: true, community: { select: { city: true } } } } }, take: 5 },
    },
  });
  return new Map(
    orders.map((o) => {
      const kitchen = (o.items.find((i) => i.status !== 'cancelled') ?? o.items[0])?.seller;
      return [o.id, { pickupCommunityId: kitchen?.communityId ?? null, dropoffCommunityId: o.deliveryAddress?.communityId ?? null, city: kitchen?.community?.city ?? o.deliveryAddress?.city ?? null }];
    })
  );
}
