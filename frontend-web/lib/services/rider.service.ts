import { apiClient } from '../api-client';

export interface AvailableDelivery {
  orderId: string;
  orderNumber: string;
  status: string;
  total: number;
  itemCount: number;
  seller: string;
  deliveryAddress: string;
  createdAt: string;
}

export interface MyDelivery {
  orderId: string;
  orderNumber: string;
  deliveryStatus: string;
  orderStatus: string;
  total: number;
  itemCount: number;
  seller: string;
  deliveryAddress: string | null;
  dest: { lat: number | null; lng: number | null };
}

export const riderService = {
  async available(): Promise<AvailableDelivery[]> {
    const res = await apiClient.get<{ success: boolean; data: AvailableDelivery[] }>('/rider/deliveries/available');
    return res.data.data;
  },
  async mine(): Promise<MyDelivery[]> {
    const res = await apiClient.get<{ success: boolean; data: MyDelivery[] }>('/rider/deliveries/mine');
    return res.data.data;
  },
  async accept(orderId: string) {
    const res = await apiClient.post(`/rider/deliveries/${orderId}/accept`, {});
    return res.data;
  },
  async updateStatus(orderId: string, status: 'picked_up' | 'on_the_way' | 'delivered') {
    const res = await apiClient.patch(`/rider/deliveries/${orderId}/status`, { status });
    return res.data;
  },
  async pushLocation(orderId: string, latitude: number, longitude: number) {
    const res = await apiClient.post('/rider/location', { orderId, latitude, longitude });
    return res.data;
  },
};
