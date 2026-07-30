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

  private async formatTicketWithMessages(ticketId: string) {
    const ticket = await prisma.supportTicket.findUnique({
      where: { id: ticketId },
      include: {
        order: { select: { id: true, orderNumber: true } },
        messages: {
          where: { isInternal: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!ticket) return null;

    // SupportMessage has no `user` relation defined in the schema (only a scalar
    // userId), so authors are resolved with a separate batch lookup.
    const authorIds = [...new Set(ticket.messages.map((m) => m.userId))];
    const authors = await prisma.user.findMany({
      where: { id: { in: authorIds } },
      select: { id: true, userType: true, profile: { select: { fullName: true } } },
    });
    const authorById = new Map(authors.map((a) => [a.id, a]));

    return {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      category: ticket.category,
      subject: ticket.subject,
      description: ticket.description,
      priority: ticket.priority,
      status: ticket.status,
      order: ticket.order ? { id: ticket.order.id, orderNumber: ticket.order.orderNumber } : null,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      messages: ticket.messages.map((m) => {
        const author = authorById.get(m.userId);
        return {
          id: m.id,
          message: m.message,
          authorType: author?.userType ?? 'customer',
          authorName: author?.profile?.fullName || (author?.userType === 'admin' ? 'Support Team' : 'You'),
          createdAt: m.createdAt,
        };
      }),
    };
  }

  /**
   * Get a single ticket + its message thread (customer, must own it)
   */
  async getTicketDetail(userId: string, ticketId: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== userId) {
      throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');
    }
    return this.formatTicketWithMessages(ticketId);
  }

  /**
   * Customer adds a follow-up message to their own ticket
   */
  async addCustomerMessage(userId: string, ticketId: string, message: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket || ticket.userId !== userId) {
      throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');
    }

    await prisma.supportMessage.create({
      data: { ticketId, userId, message },
    });

    // A customer following up on a resolved/closed ticket reopens it.
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      await prisma.supportTicket.update({ where: { id: ticketId }, data: { status: 'open' } });
    }

    return this.formatTicketWithMessages(ticketId);
  }

  /**
   * List all tickets (admin)
   */
  async adminGetTickets(filters: { status?: string; page?: number; limit?: number }) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;

    const where: any = {};
    if (filters.status) where.status = filters.status;

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { email: true, phone: true, profile: { select: { fullName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      tickets: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        category: t.category,
        subject: t.subject,
        priority: t.priority,
        status: t.status,
        customerName: t.user.profile?.fullName || t.user.email || t.user.phone,
        createdAt: t.createdAt,
      })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * Get a single ticket + its message thread (admin — no ownership check)
   */
  async adminGetTicketDetail(ticketId: string) {
    const ticket = await this.formatTicketWithMessages(ticketId);
    if (!ticket) {
      throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');
    }
    return ticket;
  }

  /**
   * Admin replies to a ticket, optionally updating its status
   */
  async adminReply(ticketId: string, adminId: string, message: string, status?: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      throw new AppError('Ticket not found', 404, 'TICKET_NOT_FOUND');
    }

    await prisma.supportMessage.create({
      data: { ticketId, userId: adminId, message },
    });

    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedTo: adminId,
        ...(status && { status }),
        ...(status === 'resolved' && { resolvedAt: new Date() }),
      },
    });

    return this.formatTicketWithMessages(ticketId);
  }
}

export default new SupportService();

