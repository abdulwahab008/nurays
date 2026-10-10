import { apiClient, ApiResponse } from '../api-client';

export interface CartItem {
  id: string;
  product: {
    id: string;
    name: string;
    price: number;
    image?: string;
    allergens?: string | null;
    dietaryInfo?: string[];
  };
  variant?: { id: string; name: string; price: number } | null;
  seller: {
    id: string;
    businessName: string;
    businessNameUrdu?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankName?: string | null;
    jazzcashNumber?: string | null;
    jazzcashAccountTitle?: string | null;
    easypaisaNumber?: string | null;
    easypaisaAccountTitle?: string | null;
  };
  quantity: number;
  stockType: 'direct' | 'hub';
  hubId?: string;
  subtotal: number;
}

export interface CartResponse {
  items: CartItem[];
  /** What the tray holds, at the kitchens' prices. Delivery, discounts and tax are worked out where they are known (see `DeliveryEstimate` and checkout). */
  summary: {
    subtotal: number;
    totalItems: number;
    totalSellers: number;
  };
  activeSeller?: {
    id: string;
    businessName: string;
    businessNameUrdu?: string | null;
    bankAccountName?: string | null;
    bankAccountNumber?: string | null;
    bankName?: string | null;
    jazzcashNumber?: string | null;
    jazzcashAccountTitle?: string | null;
    easypaisaNumber?: string | null;
    easypaisaAccountTitle?: string | null;
    community?: { id?: string; name: string; slug?: string } | null;
  } | null;
}

/** What the server says delivering the tray to an address costs. */
export interface DeliveryEstimate {
  /** What the customer pays for delivery (zero when it is free for them). */
  deliveryFee: number;
  isFree: boolean;
  /** False when the kitchen does not deliver to this address (or the order is under its minimum); `reason` says why. */
  isDeliverable?: boolean;
  reason: string | null;
  /** A Nuray rider delivers and the kitchen pays for it. */
  kitchenPaysDelivery?: boolean;
  /**
   * The order amount at which the kitchen's own delivery fee is waived: still to reach while the fee is charged, reached
   * once it is waived. Null (or missing, from an older server) when no rule says so, and then no progress is shown.
   */
  freeDeliveryThreshold?: number | null;
  /** The amount of dishes those rules were checked against: after the kitchen's own deals, before a voucher code. */
  deliverySubtotal?: number;
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
    clearAndAdd?: boolean;
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
    const response = await apiClient.get<ApiResponse<DeliveryEstimate>>(
      `/cart/delivery-estimate?addressId=${encodeURIComponent(addressId)}`
    );
    return response.data;
  },
};

