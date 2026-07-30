import { apiClient, ApiResponse } from '../api-client';

export interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    price: number;
    image?: string;
  };
  variant?: { id: string; name: string; price: number } | null;
  seller: {
    id: string;
    businessName: string;
  };
  quantity: number;
  stockType: 'direct' | 'hub';
  hubId?: string;
  subtotal: number;
}

export interface CartResponse {
  items: CartItem[];
  summary: {
    subtotal: number;
    deliveryFee: number;
    discount: number;
    total: number;
    totalItems: number;
    totalSellers: number;
  };
}

export const cartService = {
  getCart: async () => {
    const response = await apiClient.get<ApiResponse<CartResponse>>('/cart');
    return response.data;
  },

  addToCart: async (data: {
    productId: string;
    variantId?: string;
    quantity: number;
    stockType?: 'direct' | 'hub' | 'both';
    hubId?: string;
  }) => {
    const response = await apiClient.post<ApiResponse<CartItem>>('/cart/items', data);
    return response.data;
  },

  updateCartItem: async (itemId: string, quantity: number) => {
    const response = await apiClient.patch<ApiResponse<CartItem>>(`/cart/items/${itemId}`, {
      quantity,
    });
    return response.data;
  },

  removeCartItem: async (itemId: string) => {
    await apiClient.delete(`/cart/items/${itemId}`);
  },

  clearCart: async () => {
    await apiClient.delete('/cart');
  },

  getDeliveryFeeEstimate: async (addressId: string) => {
    const response = await apiClient.get<
      ApiResponse<{ deliveryFee: number; isFree: boolean; reason: string | null }>
    >(`/cart/delivery-estimate?addressId=${encodeURIComponent(addressId)}`);
    return response.data;
  },
};

