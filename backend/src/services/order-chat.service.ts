import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';
import realtimeOrderService from './realtime-order.service';
import { presentFile } from '../storage';

/** The conversation on an order, between its customer, its kitchen and its rider. */
export class OrderChat {
  /**
   * In-App Order Messages (Buyer ↔ Seller / Rider)
   */
  async getOrderMessages(orderId: string, userId: string, role?: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { userType: true },
    });

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });

    const isAdmin = user?.userType === 'admin';

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { customerId: userId },
                ...(seller ? [{ items: { some: { sellerId: seller.id } } }] : []),
                { items: { some: { seller: { userId } } } },
                { delivery: { rider: { userId } } },
              ],
            }),
      },
    });

    if (!order) {
      throw new AppError('Order not found or access denied', 404, 'ORDER_NOT_FOUND');
    }

    // Mark unread messages sent by the counterparty as read (Double Blue Tick)
    // Always "messages from someone else". (A client-supplied ?role= used to
    // steer this, letting a caller mark the other side's messages unread/read.)
    void role;
    const readCondition = { senderId: { not: userId } };

    const markedRead = await prisma.orderMessage.updateMany({
      where: {
        orderId,
        ...readCondition,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    if (markedRead.count > 0) void realtimeOrderService.emitMessagesRead(orderId);

    const messages = await prisma.orderMessage.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
      include: {
        sender: {
          select: {
            id: true,
            userType: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    return Promise.all(messages.map(async (m) => ({
      id: m.id,
      orderId: m.orderId,
      // Who sent it is shown by role, name and `isMe`; the sender's account id stays on the server.
      senderRole: m.senderRole,
      senderName: m.sender.profile?.fullName || m.sender.userType,
      senderAvatar: m.sender.profile?.avatarUrl || null,
      message: m.message,
      messageType: m.messageType || 'text',
      mediaUrl: await presentFile(m.mediaUrl),
      duration: m.duration || null,
      isRead: m.isRead,
      readAt: m.readAt,
      createdAt: m.createdAt,
      isMe: m.senderId === userId,
    })));
  }

  /**
   * Send In-App Order Message (with Voice Notes, Media, & Role Context)
   */
  async sendOrderMessage(
    orderId: string,
    userId: string,
    message: string,
    options?: {
      role?: 'customer' | 'seller' | 'rider';
      messageType?: 'text' | 'voice' | 'image';
      mediaUrl?: string;
      duration?: number;
    }
  ) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, userType: true },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    const seller = await prisma.seller.findUnique({
      where: { userId },
      select: { id: true },
    });

    const isAdmin = user?.userType === 'admin';

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        ...(isAdmin
          ? {}
          : {
              OR: [
                { customerId: userId },
                ...(seller ? [{ items: { some: { sellerId: seller.id } } }] : []),
                { items: { some: { seller: { userId } } } },
                { delivery: { rider: { userId } } },
              ],
            }),
      },
      include: {
        items: {
          select: { sellerId: true, seller: { select: { userId: true } } },
        },
        delivery: { select: { rider: { select: { userId: true } } } },
      },
    });

    if (!order) {
      throw new AppError('Order not found or access denied', 404, 'ORDER_NOT_FOUND');
    }

    // The sender's role comes from their actual relationship to this order, never
    // from the request: a client-supplied role let a customer post as the seller
    // or rider. A caller who genuinely holds several roles (e.g. a seller ordering
    // from their own shop) may pick among those they hold.
    const heldRoles: string[] = [];
    if (order.customerId === userId) heldRoles.push('customer');
    if (seller && order.items.some((i) => i.sellerId === seller.id || i.seller?.userId === userId)) heldRoles.push('seller');
    if (order.delivery?.rider?.userId === userId) heldRoles.push('rider');
    if (isAdmin) heldRoles.push('support');
    const effectiveRole =
      options?.role && heldRoles.includes(options.role) ? options.role : heldRoles[0] ?? 'customer';

    const msgType = options?.messageType || 'text';
    const fallbackMessage = msgType === 'voice' ? '🎙️ Voice note' : (message?.trim() || '');

    const orderMsg = await prisma.orderMessage.create({
      data: {
        orderId,
        senderId: userId,
        senderRole: effectiveRole,
        message: fallbackMessage,
        messageType: msgType,
        mediaUrl: options?.mediaUrl || null,
        duration: options?.duration ? Math.round(options.duration) : null,
        isRead: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            userType: true,
            profile: {
              select: {
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    void realtimeOrderService.emitOrderMessage(orderId, orderMsg.id, effectiveRole);

    return {
      id: orderMsg.id,
      orderId: orderMsg.orderId,
      senderRole: orderMsg.senderRole,
      senderName: orderMsg.sender.profile?.fullName || orderMsg.sender.userType,
      senderAvatar: orderMsg.sender.profile?.avatarUrl || null,
      message: orderMsg.message,
      messageType: orderMsg.messageType,
      mediaUrl: await presentFile(orderMsg.mediaUrl),
      duration: orderMsg.duration,
      isRead: orderMsg.isRead,
      readAt: orderMsg.readAt,
      createdAt: orderMsg.createdAt,
      isMe: true,
    };
  }
}

export default new OrderChat();
