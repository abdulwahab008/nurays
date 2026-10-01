'use client';

import { useCallback, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth-store';
import { apiClient } from '../api-client';

export function useSocket() {
  // The socket is state, not just a ref: it is replaced whenever the access token
  // changes, and consumers must re-run their subscriptions when that happens.
  // (A ref changes silently, so listeners stayed attached to a dead socket and
  // live updates stopped after the first token refresh.)
  const [socket, setSocket] = useState<Socket | null>(null);
  const { isAuthenticated } = useAuthStore();
  // Bumped whenever the access token changes (auth:tokens-changed event)
  // to force this effect to re-run and reconnect with the fresh token.
  const [tokenVersion, setTokenVersion] = useState(0);

  useEffect(() => {
    const handler = () => setTokenVersion((v) => v + 1);
    window.addEventListener('auth:tokens-changed', handler);
    return () => window.removeEventListener('auth:tokens-changed', handler);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = apiClient.getAccessToken();
    if (!token) return;

    const next = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    next.on('connect_error', () => {
      // Connection failed (e.g. WS server not running). Fail silently so the app still works.
      if (process.env.NODE_ENV === 'development') {
        console.warn('WebSocket unavailable — real-time updates disabled. Order page still works.');
      }
    });

    setSocket(next);

    return () => {
      next.disconnect();
      setSocket((current) => (current === next ? null : current));
    };
  }, [isAuthenticated, tokenVersion]);

  /**
   * Join an order's room and keep it joined: the server forgets room membership
   * when a connection drops, so it is re-joined on every (re)connect. Returns a
   * cleanup that stops re-joining and leaves the room.
   */
  const joinOrderRoom = useCallback(
    (orderId: string) => {
      if (!socket) return undefined;
      const join = () => socket.emit('join:order', orderId);
      join();
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
    (event: string, callback: (data: any) => void) => {
      if (!socket) return undefined;
      socket.on(event, callback);
      return () => {
        socket.off(event, callback);
      };
    },
    [socket]
  );

  // Stable per socket, so effects that depend on them re-run exactly when the socket changes.
  const onOrderStatusUpdate = useCallback(
    (callback: (data: any) => void) => subscribe('order:status:update', callback),
    [subscribe]
  );
  const onDeliveryTracking = useCallback(
    (callback: (data: any) => void) => subscribe('order:delivery:tracking', callback),
    [subscribe]
  );
  const onNewOrder = useCallback(
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
    joinOrderRoom,
    leaveOrderRoom,
    onOrderStatusUpdate,
    onDeliveryTracking,
    onNewOrder,
    onOrderItemStatusUpdate,
  };
}
