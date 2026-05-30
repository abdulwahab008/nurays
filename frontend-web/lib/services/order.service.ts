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
  paymentMethod: 'jazzcash' | 'easypaisa' | 'card' | 'safepay' | 'stripe' | 'cod' | 'wallet';
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

export const orderService = {
  createOrder: async (data: CreateOrderRequest) => {
    const response = await apiClient.post<ApiResponse<{ order: Order; payment?: any }>>(
      '/orders',
      data
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

  cancelOrder: async (orderId: string, reason: string) => {
    const response = await apiClient.post<ApiResponse<any>>(`/orders/${orderId}/cancel`, {
      reason,
    });
    return response.data;
  },
};

