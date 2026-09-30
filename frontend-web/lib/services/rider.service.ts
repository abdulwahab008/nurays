import { apiClient, ApiResponse } from '../api-client';

export interface Delivery {
  id: string;
  orderId: string;
  orderNumber?: string;
  totalAmount?: number;
  paymentMethod?: string;
  orderStatus?: string;
  pickupAddress: string;
  deliveryAddress: string;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  status:
    | 'pending'
    | 'assigned'
    | 'arrived_at_pickup'
    | 'picked_up'
    | 'in_transit'
    | 'arrived_at_customer'
    | 'delivered'
    | 'delivery_failed';
  pickupTime?: string | null;
  deliveryTime?: string | null;
  arrivedAtPickup?: string | null;
  arrivedAtCustomer?: string | null;
  estimatedReadyAt?: string | null;
  otpVerifiedAt?: string | null;
  createdAt: string;
  // InDrive bounded price corridor
  standardFee?: number;
  minAskFee?: number;
  maxAskFee?: number;
  distanceKm?: number;
  // Batch corridor match
  isRouteMatch?: boolean;
  batchBonus?: number;
  corridorDistanceKm?: number;
  riderAskFee?: number | null;
}

export interface RiderProfile {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  vehicleNumber: string;
  city: string;
  ratingAverage: number;
  totalDeliveries: number;
  isAvailable: boolean;
  cashInHand: number;
  floatingLimit: number;
}

export const riderService = {
  getRiderProfile: async () => {
    const response = await apiClient.get<ApiResponse<RiderProfile>>('/riders/me');
    return response.data;
  },

  toggleDutyStatus: async (isAvailable?: boolean) => {
    const response = await apiClient.patch<ApiResponse<{ isAvailable: boolean }>>('/riders/duty-status', { isAvailable });
    return response.data;
  },

  getAvailableDeliveries: async () => {
    const response = await apiClient.get<ApiResponse<Delivery[]>>('/riders/deliveries/available');
    return response.data;
  },

  getMyDeliveries: async () => {
    const response = await apiClient.get<ApiResponse<Delivery[]>>('/riders/deliveries/mine');
    return response.data;
  },

  claimDelivery: async (deliveryId: string, askFee?: number) => {
    const response = await apiClient.post<ApiResponse<Delivery>>(`/riders/deliveries/${deliveryId}/claim`, { askFee });
    return response.data;
  },

  updateDeliveryStatus: async (
    deliveryId: string,
    status:
      | 'arrived_at_pickup'
      | 'picked_up'
      | 'in_transit'
      | 'arrived_at_customer'
      | 'delivered'
      | 'delivery_failed',
    reason?: string,
    otp?: string
  ) => {
    const response = await apiClient.patch<ApiResponse<Delivery>>(
      `/riders/deliveries/${deliveryId}/status`,
      { status, reason, otp }
    );
    return response.data;
  },

  sendLocationUpdate: async (deliveryId: string, latitude: number, longitude: number) => {
    const response = await apiClient.post<ApiResponse<{
      delivery: Delivery;
      currentLocation: { latitude: number; longitude: number };
      distanceToPickupMeters: number;
      distanceToDeliveryMeters: number;
      isInsidePickupGeofence: boolean;
      isInsideDeliveryGeofence: boolean;
      autoTriggeredStatus: string | null;
    }>>(`/riders/deliveries/${deliveryId}/location`, { latitude, longitude });
    return response.data;
  },
};
