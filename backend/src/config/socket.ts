import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { redisUrl, newRedisConnection } from './redis';
import { verifyToken, isTokenRevoked } from '../utils/jwt';
import prisma from './database';
import { canTakePoolJobs } from '../utils/riderDuty';
import { logger } from '../utils/logger';
import { isSessionActive } from '../services/session.service';

/**
 * The connections of riders who can take a job from the open pool (approved, active, on duty). Pool
 * announcements go to this room and not to every rider, so a rider who cannot claim a job is not woken for it.
 */
export const ON_DUTY_RIDERS_ROOM = 'riders:on-duty';

/** An order id as a client sends it: a short string. The type of whatever else arrives is the client's choice. */
const isOrderId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 64;

// A client event can cost a database query (join:order checks who is a party to the order), and
// one connection sending them in a loop starves every other request of database connections.
// A page sends a couple; past this many a minute a user's events are dropped, on whichever of
// their connections they arrive.
const eventLimit = () => {
  const configured = Number(process.env.SOCKET_EVENTS_PER_MINUTE);
  return configured > 0 ? configured : 120;
};
const eventCounts = new Map<string, { count: number; resetsAt: number }>();

/** Count one more event from this user: false once they have sent more than the limit this minute. */
export function withinEventLimit(userId: string): boolean {
  const now = Date.now();
  if (eventCounts.size >= 5_000) for (const [key, entry] of eventCounts) if (entry.resetsAt <= now) eventCounts.delete(key);
  const entry = eventCounts.get(userId);
  if (!entry || entry.resetsAt <= now) {
    eventCounts.set(userId, { count: 1, resetsAt: now + 60_000 });
    return true;
  }
  entry.count += 1;
  const limit = eventLimit();
  if (entry.count === limit + 1) logger.warn({ userId, limit }, 'Socket events dropped: too many in a minute');
  return entry.count <= limit;
}

/**
 * Listen for an event a client sends. The client chooses the payload, and an exception thrown out of
 * a handler reaches process.on('uncaughtException'), which shuts the whole server down for everyone:
 * whatever goes wrong in a handler is logged here instead.
 */
function onClientEvent(socket: Socket, userId: string, event: string, handler: (...args: unknown[]) => unknown) {
  socket.on(event, async (...args: unknown[]) => {
    try {
      await handler(...args);
    } catch (err) {
      logger.error({ err, userId }, `${event} failed`);
    }
  });
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

        if (
          !user ||
          user.status !== 'active' ||
          isTokenRevoked(payload, user.tokensValidAfter) ||
          (payload.sid && !(await isSessionActive(payload.sid)))
        ) {
          return next(new Error('Authentication error: User not found or inactive'));
        }

        // Attach user info to socket — use the freshly-queried userType, not
        // the JWT payload's stale snapshot (mirrors the HTTP authenticate()
        // fix; otherwise a role change doesn't take effect for socket room
        // membership until the client reconnects with a new token).
        socket.data.user = {
          userId: payload.userId,
          userType: user.userType,
        };
        // Its own room, so signing out this one device closes this device's connections.
        if (payload.sid) socket.join(`session:${payload.sid}`);

        next();
      } catch (error) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    // Connection handler
    this.io.on('connection', (socket) => {
      const user = socket.data.user as { userId: string; userType: string };

      logger.debug({ userId: user.userId, userType: user.userType, socketId: socket.id }, 'Socket connected');

      // Track user socket
      if (!this.userSockets.has(user.userId)) {
        this.userSockets.set(user.userId, new Set());
      }
      this.userSockets.get(user.userId)!.add(socket.id);

      // Join user-specific room
      socket.join(`user:${user.userId}`);

      // Join role-specific rooms
      socket.join(`role:${user.userType}`);

      // A rider on duty also hears about jobs in the open pool.
      if (user.userType === 'rider') void this.joinOnDutyRoomIfEligible(socket, user.userId);

      // The excess is dropped without an answer: an error here would only be one more line to log per event.
      socket.use((_packet, next) => {
        if (withinEventLimit(user.userId)) next();
      });

      // Join order tracking room if orderId provided
      // Only participants of an order may listen to it: its room carries status
      // changes and the rider's live location. (Any authenticated user could
      // previously join any order id.)
      onClientEvent(socket, user.userId, 'join:order', async (orderId) => {
        try {
          if (!isOrderId(orderId)) return;
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
            logger.warn({ userId: user.userId, orderId }, 'Socket denied an order room');
            return;
          }
          socket.join(`order:${orderId}`);
          logger.debug({ userId: user.userId, orderId }, 'Socket joined an order room');
        } catch (err) {
          logger.error({ err, userId: user.userId, orderId }, 'join:order failed');
        }
      });

      // Leave order room
      onClientEvent(socket, user.userId, 'leave:order', (orderId) => {
        if (!isOrderId(orderId)) return;
        socket.leave(`order:${orderId}`);
        logger.debug({ userId: user.userId, orderId }, 'Socket left an order room');
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.debug({ userId: user.userId, socketId: socket.id }, 'Socket disconnected');
        const userSockets = this.userSockets.get(user.userId);
        if (userSockets) {
          userSockets.delete(socket.id);
          if (userSockets.size === 0) {
            this.userSockets.delete(user.userId);
          }
        }
      });

      // Error handler. A client can emit "error" too, with any payload: only a real Error (the server's own) is logged.
      onClientEvent(socket, user.userId, 'error', (error) => {
        logger.error({ ...(error instanceof Error ? { err: error } : { clientSent: typeof error }), userId: user.userId }, 'Socket error');
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

  /** Whether this rider can take a job from the open pool right now (approved, active, on duty). */
  private async riderCanTakeJobs(userId: string): Promise<boolean> {
    const rider = await prisma.rider.findUnique({ where: { userId }, select: { verificationStatus: true, status: true, isAvailable: true } });
    return canTakePoolJobs(rider);
  }

  /** A rider's connection that opens while they are on duty joins the room pool announcements go to. */
  private async joinOnDutyRoomIfEligible(socket: { join: (room: string) => unknown; leave: (room: string) => unknown }, userId: string): Promise<void> {
    try {
      if (!(await this.riderCanTakeJobs(userId))) return;
      socket.join(ON_DUTY_RIDERS_ROOM);
      // A duty change that landed between the read and the join already ran its own leave for the
      // connections that were in the room, not for this one: look again, so the room never keeps an off-duty rider.
      if (!(await this.riderCanTakeJobs(userId))) socket.leave(ON_DUTY_RIDERS_ROOM);
    } catch (err) {
      logger.error({ err, userId }, 'Could not place a rider in the on-duty room');
    }
  }

  /**
   * Put every connection a rider has into the on-duty room, or take them out (on all instances, via the
   * Redis adapter). Called wherever it can change: going on or off duty, being suspended, approved or rejected.
   */
  setRiderOnDuty(userId: string, onDuty: boolean) {
    const connections = this.io?.in(`user:${userId}`);
    if (onDuty) connections?.socketsJoin(ON_DUTY_RIDERS_ROOM);
    else connections?.socketsLeave(ON_DUTY_RIDERS_ROOM);
  }

  /** Read the rider's standing and put their connections in or out of the on-duty room accordingly. Best effort. */
  async syncRiderDuty(userId: string): Promise<void> {
    try {
      this.setRiderOnDuty(userId, await this.riderCanTakeJobs(userId));
    } catch (err) {
      logger.error({ err, userId }, "Could not update a rider's on-duty room");
    }
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

  /** Close one signed-in device's connections (see session.service.ts). */
  disconnectSession(sessionId: string) {
    this.io?.in(`session:${sessionId}`).disconnectSockets(true);
  }

  /**
   * One event to everyone in any of these rooms. A connection in several of them (a customer
   * who is in the order's room and their own user room) receives it once, not once per room.
   */
  emitToRooms(rooms: string[], event: string, data: unknown) {
    if (this.io && rooms.length > 0) {
      this.io.to(Array.from(new Set(rooms))).emit(event, data);
    }
  }

  emitToUser(userId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  /**
   * Emit event to all users of specific role
   */
  emitToRole(role: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`role:${role}`).emit(event, data);
    }
  }

  /** An event for the riders who can take a job from the open pool (see ON_DUTY_RIDERS_ROOM). */
  emitToOnDutyRiders(event: string, data: unknown) {
    if (this.io) {
      this.io.to(ON_DUTY_RIDERS_ROOM).emit(event, data);
    }
  }

  /**
   * Emit event to order room
   */
  emitToOrder(orderId: string, event: string, data: unknown) {
    if (this.io) {
      this.io.to(`order:${orderId}`).emit(event, data);
    }
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: unknown) {
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

