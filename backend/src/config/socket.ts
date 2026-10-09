import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisUrl, newRedisConnection } from './redis';
import { verifyToken, isTokenRevoked } from '../utils/jwt';
import prisma from './database';

export interface SocketUser {
  userId: string;
  userType: string;
  socketId: string;
}

class SocketManager {
  private io: SocketIOServer | null = null;
  private userSockets: Map<string, Set<string>> = new Map(); // userId -> Set of socketIds

  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        credentials: true,
      },
      transports: ['websocket', 'polling'],
    });

    // With Redis, events emitted on any instance reach clients connected to every instance
    // (and room operations like socketsLeave apply everywhere). Without it, only this one.
    if (redisUrl()) {
      // The adapter publishes without awaiting; while Redis is down commands wait in the
      // offline queue and flush on reconnect instead of failing one by one into Sentry.
      const pub = newRedisConnection('socket-pub', { maxRetriesPerRequest: null });
      const sub = newRedisConnection('socket-sub', { maxRetriesPerRequest: null });
      this.io.adapter(createAdapter(pub, sub));
    }

    // Authentication middleware
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');

        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        const payload = verifyToken(token);

        // Verify user exists and is active
        const user = await prisma.user.findUnique({
          where: { id: payload.userId },
          select: { id: true, status: true, userType: true, tokensValidAfter: true },
        });

        if (!user || user.status !== 'active' || isTokenRevoked(payload, user.tokensValidAfter)) {
          return next(new Error('Authentication error: User not found or inactive'));
        }

        // Attach user info to socket — use the freshly-queried userType, not
        // the JWT payload's stale snapshot (mirrors the HTTP authenticate()
        // fix; otherwise a role change doesn't take effect for socket room
        // membership until the client reconnects with a new token).
        (socket as any).user = {
          userId: payload.userId,
          userType: user.userType,
        };

        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      const user = (socket as any).user as { userId: string; userType: string };

      console.log(`🔌 User ${user.userId} (${user.userType}) connected: ${socket.id}`);

      // Track user socket
      if (!this.userSockets.has(user.userId)) {
        this.userSockets.set(user.userId, new Set());
      }
      this.userSockets.get(user.userId)!.add(socket.id);

      // Join user-specific room
      socket.join(`user:${user.userId}`);

      // Join role-specific rooms
      socket.join(`role:${user.userType}`);

      // Join order tracking room if orderId provided
      // Only participants of an order may listen to it: its room carries status
      // changes and the rider's live location. (Any authenticated user could
      // previously join any order id.)
      socket.on('join:order', async (orderId: string) => {
        try {
          if (typeof orderId !== 'string' || orderId.length === 0 || orderId.length > 64) return;
          const allowed =
            user.userType === 'admin' ||
            (await prisma.order.count({
              where: {
                id: orderId,
                OR: [
                  { customerId: user.userId },
                  { items: { some: { seller: { userId: user.userId } } } },
                  { delivery: { rider: { userId: user.userId } } },
                ],
              },
            })) > 0;
          if (!allowed) {
            console.warn(`⛔ User ${user.userId} denied order room: ${orderId}`);
            return;
          }
          socket.join(`order:${orderId}`);
          console.log(`📦 User ${user.userId} joined order room: ${orderId}`);
        } catch (err) {
          console.error('join:order failed:', err);
        }
      });

      // Leave order room
      socket.on('leave:order', (orderId: string) => {
        socket.leave(`order:${orderId}`);
        console.log(`📦 User ${user.userId} left order room: ${orderId}`);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        console.log(`🔌 User ${user.userId} disconnected: ${socket.id}`);
        const userSockets = this.userSockets.get(user.userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.userSockets.delete(user.userId);
          }
        }
      });

      // Error handler
      socket.on('error', (error) => {
        console.error(`Socket error for user ${user.userId}:`, error);
      });
    });

    return this.io;
  }

  /** Disconnect every client and stop accepting new ones (graceful shutdown). */
  async close(): Promise<void> {
    if (!this.io) return;
    const io = this.io;
    this.io = null;
    await new Promise<void>((resolve) => io.close(() => resolve()));
  }

  getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.io not initialized. Call initialize() first.');
    }
    return this.io;
  }

  /**
   * Emit event to specific user
   */
  /**
   * Take a user's open connections out of an order's room. Room membership is only checked when
   * joining, so when someone stops being a party to the order (a rider unassigned by a retry) they
   * must be removed explicitly or they keep receiving its status and live-location events.
   */
  removeUserFromOrder(userId: string, orderId: string) {
    this.io?.in(`user:${userId}`).socketsLeave(`order:${orderId}`);
  }

  /**
   * Close every live connection a user has (all instances, via the Redis adapter). Called wherever
   * their sessions are ended: logout, suspension, role change, password reset, account closure. A
   * token is only checked at the handshake, so without this an ended session keeps receiving events.
   */
  disconnectUser(userId: string) {
    this.io?.in(`user:${userId}`).disconnectSockets(true);
  }

  /**
   * One event to everyone in any of these rooms. A connection in several of them (a customer
   * who is in the order's room and their own user room) receives it once, not once per room.
   */
  emitToRooms(rooms: string[], event: string, data: any) {
    if (this.io && rooms.length > 0) {
      this.io.to(Array.from(new Set(rooms))).emit(event, data);
    }
  }

  emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Emit event to all users of specific role
   */
  emitToRole(role: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`role:${role}`).emit(event, data);
    }
  }

  /**
   * Emit event to order room
   */
  emitToOrder(orderId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`order:${orderId}`).emit(event, data);
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  /**
   * Get connected users count
   */
  getConnectedUsersCount(): number {
    return this.userSockets.size;
  }
}

export default new SocketManager();

