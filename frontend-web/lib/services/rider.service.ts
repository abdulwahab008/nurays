import { apiClient, ApiResponse } from '../api-client';

export interface Delivery {
  id: string;
  orderId: string;
  orderNumber?: string;
  pickupAddress: string;
  deliveryAddress: string;
  status: 'pending' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered';
  pickupTime?: string | null;
  deliveryTime?: string | null;
  createdAt: string;
}

export const riderService = {
  getAvailableDeliveries: async () => {
    const response = await apiClient.get<ApiResponse<Delivery[]>>('/riders/deliveries/available');
    return response.data;
  },

  getMyDeliveries: async () => {
    const response = await apiClient.get<ApiResponse<Delivery[]>>('/riders/deliveries/mine');
    return response.data;
  },

  claimDelivery: async (deliveryId: string) => {
    const response = await apiClient.post<ApiResponse<Delivery>>(`/riders/deliveries/${deliveryId}/claim`, {});
    return response.data;
  },

  updateDeliveryStatus: async (deliveryId: string, status: 'picked_up' | 'in_transit' | 'delivered') => {
    const response = await apiClient.patch<ApiResponse<Delivery>>(`/riders/deliveries/${deliveryId}/status`, { status });
    return response.data;
  },
};
