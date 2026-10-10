import { apiClient, ApiResponse } from '../api-client';

export interface CreateOrderRequest {
  items: Array<{
    productId: string;
    quantity: number;
    stockType?: 'direct' | 'hub' | 'both';
    hubId?: string;
  }>;
  deliveryType: 'home_delivery' | 'hub_pickup' | 'self_pickup';
  deliveryAddressId?: string;
  hubId?: string;
  deliverySlotDate?: string;
  deliverySlotTime?: 'morning' | 'afternoon' | 'evening';
  paymentMethod: 'jazzcash' | 'easypaisa' | 'card' | 'safepay' | 'bank' | 'cod' | 'wallet';
  promotionCode?: string;
  deliveryInstructions?: string;
}

/**
 * A dish of an order, as the API sends it to the customer who placed it. The list sends only the first three dishes and
 * the fields up to `status`; the order's own page sends all of them, with the kitchen and the dish.
 */
export interface OrderItem {
  id: string;
  productId?: string;
  variantId?: string | null;
  variantName?: string | null;
  productName: string;
  productImage?: string | null;
  quantity: number;
  unitPrice?: number | string;
  totalPrice?: number | string;
  status: string;
  seller?: { id?: string; businessName?: string; businessNameUrdu?: string | null } | null;
  product?: { id?: string; name?: string; slug?: string; images?: Array<{ imageUrl: string }> } | null;
}

/** An order in the customer's list (`GET /orders/me`), or just placed (`POST /orders`). */
export interface Order {
  id: string;
  orderNumber: string;
  totalAmount: number;
  orderStatus: string;
  /** The status under its older name: a live update sets both, and old data may carry only this one. */
  status?: string;
  paymentStatus: string;
  createdAt: string;
  estimatedDeliveryAt?: string | null;
  /** How many dishes the order has; `items` holds only the first three in the list. */
  itemsCount?: number;
  items: OrderItem[];
}

/** What `POST /orders` answers with: the order just placed, and the state of its payment. */
export interface PlacedOrder {
  id: string;
  orderNumber: string;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  items: OrderItem[];
}

/** What `POST /orders/:id/cancel` answers with, including what became of any money already paid. */
export interface CancelledOrder {
  orderId: string;
  status: string;
  refundAmount: number;
  refundStatus: 'refunded_to_wallet' | 'pending_manual_transfer' | 'not_required';
}

/** The address an order goes to, as the order was placed (the server applies the frozen copy over the saved address). */
export interface OrderAddress {
  addressLine1?: string;
  addressLine2?: string | null;
  area?: string;
  city?: string;
  houseNumber?: string | null;
  landmark?: string | null;
  postalCode?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
}

/** One order on its own page (`GET /orders/:id`), as its customer sees it. */
export interface OrderDetails extends Order {
  subtotal?: number;
  deliveryFee?: number;
  discountAmount?: number;
  taxAmount?: number;
  paymentMethod?: string;
  paymentReferenceNumber?: string | null;
  paymentSubmittedAt?: string | null;
  paymentProofUrl?: string | null;
  paymentSenderAccount?: string | null;
  deliveryType?: string;
  deliverySlotDate?: string | null;
  deliverySlotTime?: string | null;
  /** The code the customer gives the rider; only the customer is sent it. */
  handoverCode?: string | null;
  deliveryAddress?: OrderAddress | null;
  statusHistory?: Array<{ status?: string; createdAt: string }>;
  delivery?: {
    deliveryTime?: string | null;
    arrivedAtCustomer?: string | null;
    /** The rider's last position, sent only while the food is on its way. */
    riderLocation?: { latitude: number; longitude: number; updatedAt?: string | null; distanceKm?: number | null } | null;
    /** The rider's first name and vehicle. */
    rider?: { name?: string | null; vehicleType?: string | null; vehicleNumber?: string | null } | null;
  } | null;
}

/** Paging of a list. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface SellerPaymentAccount {
  provider: string;
  accountTitle?: string;
  accountNumber: string;
  isPrimary?: boolean;
}

export interface SellerPaymentDetails {
  sellerId: string;
  sellerName: string;
  accounts: SellerPaymentAccount[];
  instructions?: string;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  senderRole: string;
  senderName?: string;
  senderAvatar?: string | null;
  message: string;
  messageType?: 'text' | 'voice' | 'image';
  mediaUrl?: string | null;
  duration?: number | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
  isMe?: boolean;
}

export const orderService = {
  /**
   * Place an order. `idempotencyKey` identifies one checkout attempt: sending the same
   * key again (a retry after a timeout) returns the order already placed instead of
   * creating a second one.
   */
  createOrder: async (data: CreateOrderRequest, idempotencyKey?: string) => {
    const response = await apiClient.post<ApiResponse<{ order: PlacedOrder; payment?: { gateway: string; status: string } }>>(
      '/orders',
      data,
      idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
    );
    return response.data;
  },

  getMyOrders: async (filters?: { status?: string; page?: number; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value));
        }
      });
    }
    const response = await apiClient.get<ApiResponse<{ orders: Order[]; pagination: Pagination; statusCounts?: Record<string, number> }>>(
      `/orders/me?${params.toString()}`
    );
    return response.data;
  },

  getOrderDetails: async (orderId: string) => {
    const response = await apiClient.get<ApiResponse<OrderDetails>>(`/orders/${orderId}`);
    return response.data;
  },

  getOrder: async (orderId: string) => {
    const response = await apiClient.get<ApiResponse<OrderDetails>>(`/orders/${orderId}`);
    return response.data;
  },

  cancelOrder: async (orderId: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<CancelledOrder>>(`/orders/${orderId}/cancel`, {
      reason,
    });
    return response.data;
  },

  getSellerPaymentDetails: async (orderId: string) => {
    const response = await apiClient.get<ApiResponse<SellerPaymentDetails>>(`/orders/${orderId}/payment-details`);
    return response.data;
  },

  submitManualPayment: async (
    orderId: string,
    data: {
      referenceNumber?: string;
      transactionId?: string;
      senderName?: string;
      senderAccount?: string;
      proofUrl?: string;
      notes?: string;
    }
  ) => {
    const payload = {
      referenceNumber: data.referenceNumber || data.transactionId || '',
      senderName: data.senderName,
      senderAccount: data.senderAccount,
      proofUrl: data.proofUrl,
      notes: data.notes,
    };
    const response = await apiClient.post<ApiResponse<unknown>>(`/orders/${orderId}/submit-payment`, payload);
    return response.data;
  },

  getOrderMessages: async (orderId: string, role?: string) => {
    const query = role ? `?role=${role}` : '';
    const response = await apiClient.get<ApiResponse<OrderMessage[]>>(`/orders/${orderId}/messages${query}`);
    return response.data;
  },

  sendOrderMessage: async (
    orderId: string,
    message: string,
    options?: {
      role?: 'customer' | 'seller' | 'rider';
      messageType?: 'text' | 'voice' | 'image';
      mediaUrl?: string;
      duration?: number;
    }
  ) => {
    const response = await apiClient.post<ApiResponse<OrderMessage>>(`/orders/${orderId}/messages`, {
      message,
      role: options?.role,
      messageType: options?.messageType || 'text',
      mediaUrl: options?.mediaUrl,
      duration: options?.duration,
    });
    return response.data;
  },
};


