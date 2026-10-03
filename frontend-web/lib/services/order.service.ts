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

export interface Order {
  id: string;
  orderNumber: string;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    status: string;
  }>;
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
  senderId: string;
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
    const response = await apiClient.post<ApiResponse<{ order: Order; payment?: any }>>(
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
    const response = await apiClient.get<ApiResponse<{ orders: Order[]; pagination: any }>>(
      `/orders/me?${params.toString()}`
    );
    return response.data;
  },

  getOrderDetails: async (orderId: string) => {
    const response = await apiClient.get<ApiResponse<Order>>(`/orders/${orderId}`);
    return response.data;
  },

  getOrder: async (orderId: string) => {
    const response = await apiClient.get<ApiResponse<Order>>(`/orders/${orderId}`);
    return response.data;
  },

  cancelOrder: async (orderId: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<any>>(`/orders/${orderId}/cancel`, {
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
    const response = await apiClient.post<ApiResponse<any>>(`/orders/${orderId}/submit-payment`, payload);
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


