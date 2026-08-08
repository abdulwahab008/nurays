# Real-Time Order Management

## Overview

The real-time order management system provides live updates for order status changes, order item updates, and delivery tracking using WebSocket connections via Socket.io.

## Features

- **Live Order Status Updates**: Real-time notifications when order status changes
- **Order Item Status Tracking**: Track individual item status within an order
- **New Order Notifications**: Instant alerts for sellers when new orders arrive
- **Delivery Tracking**: Real-time location updates during delivery
- **Role-Based Rooms**: Automatic room assignment based on user roles
- **Order-Specific Rooms**: Join specific order rooms for focused tracking

## WebSocket Connection

### Connection Setup

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  },
  transports: ['websocket', 'polling']
});
```

### Authentication

The WebSocket connection requires JWT authentication. Pass the token in one of two ways:

1. **Via auth object** (recommended):
```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

2. **Via Authorization header**:
```javascript
const socket = io('http://localhost:3001', {
  extraHeaders: {
    Authorization: 'Bearer your-jwt-token'
  }
});
```

## Events

### Client → Server Events

#### Join Order Room
Join a specific order room to receive updates for that order.

```javascript
socket.emit('join:order', 'order-id-here');
```

#### Leave Order Room
Leave an order room when no longer tracking that order.

```javascript
socket.emit('leave:order', 'order-id-here');
```

### Server → Client Events

#### Order Status Update
Emitted when an order's status changes.

```javascript
socket.on('order:status:update', (data) => {
  console.log('Order status updated:', data);
  // {
  //   orderId: 'uuid',
  //   orderNumber: 'ORD-2025-001',
  //   status: 'confirmed',
  //   updatedAt: '2025-01-15T10:30:00Z',
  //   changedBy: 'user-id'
  // }
});
```

**Who receives this:**
- Customer (order owner)
- All sellers with items in the order
- All admins
- All users in the order room

#### Order Item Status Update
Emitted when an individual order item's status changes.

```javascript
socket.on('order:item:status:update', (data) => {
  console.log('Order item status updated:', data);
  // {
  //   orderItemId: 'uuid',
  //   orderId: 'uuid',
  //   orderNumber: 'ORD-2025-001',
  //   status: 'preparing',
  //   updatedAt: '2025-01-15T10:30:00Z'
  // }
});
```

**Who receives this:**
- Customer (order owner)
- Seller (item owner)
- All users in the order room

#### New Order Notification
Emitted when a new order is created.

**For Sellers:**
```javascript
socket.on('order:new', (data) => {
  console.log('New order received:', data);
  // {
  //   orderId: 'uuid',
  //   orderNumber: 'ORD-2025-001',
  //   totalAmount: 5000,
  //   items: [
  //     {
  //       productName: 'Chicken Biryani',
  //       quantity: 2,
  //       totalPrice: 2000
  //     }
  //   ],
  //   createdAt: '2025-01-15T10:00:00Z'
  // }
});
```

**For Admins:**
```javascript
socket.on('order:new', (data) => {
  console.log('New order on platform:', data);
  // {
  //   orderId: 'uuid',
  //   orderNumber: 'ORD-2025-001',
  //   totalAmount: 5000,
  //   customerId: 'uuid',
  //   createdAt: '2025-01-15T10:00:00Z'
  // }
});
```

#### Delivery Tracking Update
Emitted during delivery with location and ETA updates.

```javascript
socket.on('order:delivery:tracking', (data) => {
  console.log('Delivery tracking update:', data);
  // {
  //   orderId: 'uuid',
  //   location: {
  //     latitude: 24.8607,
  //     longitude: 67.0011
  //   },
  //   distanceKm: 2.5,
  //   estimatedArrival: '2025-01-15T11:00:00Z',
  //   updatedAt: '2025-01-15T10:45:00Z'
  // }
});
```

**Who receives this:**
- Customer (order owner)
- All users in the order room

## Connection Events

### Connection Established
```javascript
socket.on('connect', () => {
  console.log('Connected to WebSocket server');
  console.log('Socket ID:', socket.id);
});
```

### Disconnection
```javascript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Connection Error
```javascript
socket.on('connect_error', (error) => {
  console.error('Connection error:', error.message);
});
```

## User Rooms

Users are automatically added to rooms based on their role:

- **User Room**: `user:{userId}` - All events for a specific user
- **Role Room**: `role:{userType}` - All events for a user type (customer, seller, admin)
- **Order Room**: `order:{orderId}` - All events for a specific order (must join manually)

## API Endpoints

### Get Order Tracking Data

Get comprehensive order tracking information.

```http
GET /api/v1/realtime/orders/:id/track
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "uuid",
    "orderNumber": "ORD-2025-001",
    "orderStatus": "confirmed",
    "paymentStatus": "paid",
    "estimatedDeliveryAt": "2025-01-15T11:00:00Z",
    "deliveredAt": null,
    "statusHistory": [
      {
        "status": "pending",
        "notes": "Order created",
        "changedBy": "user-id",
        "createdAt": "2025-01-15T10:00:00Z"
      }
    ],
    "items": [
      {
        "id": "uuid",
        "productName": "Chicken Biryani",
        "quantity": 2,
        "status": "preparing"
      }
    ],
    "delivery": {
      "status": "assigned",
      "estimatedArrival": "2025-01-15T11:00:00Z",
      "distanceKm": 2.5,
      "estimatedDurationMinutes": 30
    }
  }
}
```

## Example Client Implementation

### React Example

```typescript
import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface OrderStatus {
  orderId: string;
  orderNumber: string;
  status: string;
  updatedAt: string;
}

export const useOrderTracking = (orderId: string, token: string) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    newSocket.on('connect', () => {
      console.log('Connected to WebSocket');
      setIsConnected(true);
      newSocket.emit('join:order', orderId);
    });

    newSocket.on('disconnect', () => {
      setIsConnected(false);
    });

    newSocket.on('order:status:update', (data: OrderStatus) => {
      setOrderStatus(data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('leave:order', orderId);
      newSocket.close();
    };
  }, [orderId, token]);

  return { socket, orderStatus, isConnected };
};
```

### Vanilla JavaScript Example

```javascript
const socket = io('http://localhost:3001', {
  auth: {
    token: localStorage.getItem('jwt_token')
  }
});

socket.on('connect', () => {
  console.log('Connected');
  socket.emit('join:order', 'order-id-here');
});

socket.on('order:status:update', (data) => {
  updateOrderUI(data);
});

socket.on('order:item:status:update', (data) => {
  updateOrderItemUI(data);
});

socket.on('order:delivery:tracking', (data) => {
  updateDeliveryMap(data);
});

function updateOrderUI(data) {
  const statusElement = document.getElementById('order-status');
  statusElement.textContent = data.status;
  statusElement.className = `status-${data.status}`;
}
```

## Order Status Flow

1. **pending** → Order created, awaiting confirmation
2. **confirmed** → Order confirmed, payment processed
3. **preparing** → Sellers preparing items
4. **ready** → All items ready for dispatch
5. **dispatched** → Order dispatched to hub/delivery
6. **in_transit** → Order out for delivery
7. **delivered** → Order delivered to customer
8. **completed** → Order completed (after review period)
9. **cancelled** → Order cancelled
10. **refunded** → Order refunded

## Best Practices

1. **Reconnection Handling**: Implement automatic reconnection with exponential backoff
2. **Token Refresh**: Update token when it expires
3. **Room Management**: Join/leave order rooms as needed to reduce unnecessary updates
4. **Error Handling**: Handle connection errors gracefully
5. **State Management**: Sync WebSocket updates with local state
6. **Performance**: Only join rooms for orders currently being viewed

## Security

- All WebSocket connections require JWT authentication
- Users can only receive updates for orders they have access to
- Role-based access control enforced on the server
- Connection attempts with invalid tokens are rejected

## Troubleshooting

### Connection Fails
- Verify JWT token is valid and not expired
- Check CORS settings in server configuration
- Ensure WebSocket transport is enabled

### Not Receiving Updates
- Verify you've joined the correct order room
- Check user permissions for the order
- Verify order status actually changed

### Frequent Disconnections
- Check network stability
- Implement reconnection logic
- Verify server is running and accessible

