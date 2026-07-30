import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { verifyToken } from '../utils/jwt';
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
          select: { id: true, status: true, userType: true },
        });

        if (!user || user.status !== 'active') {
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
      socket.on('join:order', (orderId: string) => {
        socket.join(`order:${orderId}`);
        console.log(`📦 User ${user.userId} joined order room: ${orderId}`);
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

  getIO(): SocketIOServer {
    if (!this.io) {
      throw new Error('Socket.io not initialized. Call initialize() first.');
    }
    return this.io;
  }

  /**
   * Emit event to specific user
   */
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

