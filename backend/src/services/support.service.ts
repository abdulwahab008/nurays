import prisma from '../config/database';
import { AppError } from '../middleware/errorHandler';

export class SupportService {
  /**
   * Create support ticket
   */
  async createTicket(
    userId: string,
    data: {
      orderId?: string;
      category: string;
      subject: string;
      description: string;
      priority?: string;
    }
  ) {
    // Verify order belongs to user if provided
    if (data.orderId) {
      const order = await prisma.order.findUnique({
        where: { id: data.orderId },
      });

      if (!order) {
        throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
      }

      if (order.customerId !== userId) {
        throw new AppError('Access denied', 403, 'ACCESS_DENIED');
      }
    }

    // Generate ticket number
    const ticketCount = await prisma.supportTicket.count();
    const ticketNumber = `TKT${new Date().getFullYear()}${String(ticketCount + 1).padStart(6, '0')}`;

    const ticket = await prisma.supportTicket.create({
      data: {
        userId,
        orderId: data.orderId,
        ticketNumber,
        category: data.category,
        subject: data.subject,
        description: data.description,
        priority: data.priority || 'medium',
        status: 'open',
      },
    });

    return {
      ticketNumber: ticket.ticketNumber,
      status: ticket.status,
      estimatedResponse: 'Within 2 hours',
    };
  }

  /**
   * Get user tickets
   */
  async getUserTickets(
    userId: string,
    filters: {
      status?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {
      userId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((ticket) => ({
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        category: ticket.category,
        subject: ticket.subject,
        description: ticket.description,
        priority: ticket.priority,
        status: ticket.status,
        order: ticket.order
          ? {
              id: ticket.order.id,
              orderNumber: ticket.order.orderNumber,
            }
          : null,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

export default new SupportService();

