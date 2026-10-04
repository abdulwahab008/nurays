'use client';

import { useCallback, useEffect, useReducer } from 'react';
import type { Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth-store';
import { acquireSocket, currentSocket, onSocketChange, releaseSocket } from '../realtime/socket';

/**
 * Live updates over the tab's shared realtime connection (lib/realtime/socket.ts).
 *
 * The returned functions are stable for a given connection and change when it is replaced
 * (a new access token, a different user), so effects that depend on them re-subscribe to
 * the live connection instead of staying attached to a closed one.
 */
export function useSocket() {
  const { isAuthenticated } = useAuthStore();
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  useEffect(() => onSocketChange(rerender), []);

  useEffect(() => {
    if (isAuthenticated) acquireSocket();
    else releaseSocket();
  }, [isAuthenticated]);

  const socket: Socket | null = isAuthenticated ? currentSocket() : null;
  const connected = !!socket?.connected;

  /**
   * Join an order's room and keep it joined: the server forgets room membership
   * when a connection drops, so it is re-joined on every (re)connect. Returns a
   * cleanup that stops re-joining and leaves the room.
   */
  const joinOrderRoom = useCallback(
    (orderId: string) => {
      if (!socket) return undefined;
      const join = () => socket.emit('join:order', orderId);
      if (socket.connected) join();
      socket.on('connect', join);
      return () => {
        socket.off('connect', join);
        socket.emit('leave:order', orderId);
      };
    },
    [socket]
  );

  const leaveOrderRoom = useCallback(
    (orderId: string) => {
      socket?.emit('leave:order', orderId);
    },
    [socket]
  );

  const subscribe = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (event: string, callback: (data: any) => void) => {
      if (!socket) return undefined;
      socket.on(event, callback);
      return () => {
        socket.off(event, callback);
      };
    },
    [socket]
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onOrderStatusUpdate = useCallback((callback: (data: any) => void) => subscribe('order:status:update', callback), [subscribe]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onDeliveryTracking = useCallback((callback: (data: any) => void) => subscribe('order:delivery:tracking', callback), [subscribe]);
  const onNewOrder = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (callback: (data: { orderId: string; orderNumber: string; totalAmount: number; items?: any[]; createdAt: string }) => void) =>
      subscribe('order:new', callback),
    [subscribe]
  );
  const onOrderItemStatusUpdate = useCallback(
    (callback: (data: { orderItemId: string; orderId: string; orderNumber: string; status: string; updatedAt: string }) => void) =>
      subscribe('order:item:status:update', callback),
    [subscribe]
  );

  return {
    socket,
    connected,
    subscribe,
    joinOrderRoom,
    leaveOrderRoom,
    onOrderStatusUpdate,
    onDeliveryTracking,
    onNewOrder,
    onOrderItemStatusUpdate,
  };
}
