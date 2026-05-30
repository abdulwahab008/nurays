'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/auth-store';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
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

    const token = localStorage.getItem('access_token');
    if (!token) return;

    const socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect_error', () => {
      // Connection failed (e.g. WS server not running). Fail silently so the app still works.
      if (process.env.NODE_ENV === 'development') {
        console.warn('WebSocket unavailable — real-time updates disabled. Order page still works.');
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [isAuthenticated, tokenVersion]);

  const joinOrderRoom = (orderId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join:order', orderId);
    }
  };

  const leaveOrderRoom = (orderId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('leave:order', orderId);
    }
  };

  const onOrderStatusUpdate = (callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on('order:status:update', callback);
      return () => {
        socketRef.current?.off('order:status:update', callback);
      };
    }
  };

  const onDeliveryTracking = (callback: (data: any) => void) => {
    if (socketRef.current) {
      socketRef.current.on('order:delivery:tracking', callback);
      return () => {
        socketRef.current?.off('order:delivery:tracking', callback);
      };
    }
  };

  const onNewOrder = (callback: (data: { orderId: string; orderNumber: string; totalAmount: number; items?: any[]; createdAt: string }) => void) => {
    if (socketRef.current) {
      socketRef.current.on('order:new', callback);
      return () => {
        socketRef.current?.off('order:new', callback);
      };
    }
  };

  const onOrderItemStatusUpdate = (callback: (data: { orderItemId: string; orderId: string; orderNumber: string; status: string; updatedAt: string }) => void) => {
    if (socketRef.current) {
      socketRef.current.on('order:item:status:update', callback);
      return () => {
        socketRef.current?.off('order:item:status:update', callback);
      };
    }
  };

  return {
    socket: socketRef.current,
    joinOrderRoom,
    leaveOrderRoom,
    onOrderStatusUpdate,
    onDeliveryTracking,
    onNewOrder,
    onOrderItemStatusUpdate,
  };
}

