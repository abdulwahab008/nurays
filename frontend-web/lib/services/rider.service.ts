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
    | 'delivery_failed'
    | 'cancelled';
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
  // Unknown (null) when either end's location isn't known.
  distanceKm?: number | null;
  // Batch corridor match
  isRouteMatch?: boolean;
  batchBonus?: number;
  corridorDistanceKm?: number | null;
  riderAskFee?: number | null;
  // What this rider is paid for the job, fixed when they claimed it.
  riderFee?: number | null;
  riderBonus?: number | null;
  // A cash order that would take the rider past their cash limit.
  exceedsCashLimit?: boolean;
}

export interface RiderProfile {
  id: string;
  name: string | null;
  phone: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  city: string | null;
  ratingAverage: number;
  totalDeliveries: number;
  isAvailable: boolean;
  /** Cash collected at the door and not yet handed in. */
  cashInHand: number;
  /** The most cash this rider may carry before cash orders stop being offered. */
  floatingLimit: number;
  /** What the platform owes the rider (negative: what the rider owes). */
  balance: number;
}

export type RiderLedgerType = 'delivery_fee' | 'bonus' | 'cod_collected' | 'cash_deposit' | 'payout' | 'adjustment';

export interface RiderLedgerEntry {
  id: string;
  type: RiderLedgerType;
  /** Signed: + the platform owes the rider more, − less. */
  amount: number;
  orderId: string | null;
  reference: string | null;
  note: string | null;
  createdAt: string;
}

export interface RiderMoneySummary {
  balance: number;
  cashHeld: number;
  /** Pay earned and not yet paid to the rider (balance + cash held). */
  unpaid: number;
  earned: number;
  paidOut: number;
  cashLimit: number;
  earnedToday: number;
  earnedThisWeek: number;
  deliveriesToday: number;
  deliveriesThisWeek: number;
}

export interface RiderEarnings extends RiderMoneySummary {
  entries: RiderLedgerEntry[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const LEDGER_LABELS: Record<RiderLedgerType, string> = {
  delivery_fee: 'Delivery fee',
  bonus: 'Route bonus',
  cod_collected: 'Cash collected',
  cash_deposit: 'Cash handed in',
  payout: 'Paid to you',
  adjustment: 'Adjustment',
};

export const riderService = {
  getRiderProfile: async () => {
    const response = await apiClient.get<ApiResponse<RiderProfile>>('/riders/me');
    return response.data;
  },

  getEarnings: async (page = 1) => {
    const response = await apiClient.get<ApiResponse<RiderEarnings>>('/riders/me/earnings', { params: { page } });
    return response.data.data!;
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
      distanceToPickupMeters: number | null;
      distanceToDeliveryMeters: number | null;
      isInsidePickupGeofence: boolean;
      isInsideDeliveryGeofence: boolean;
      autoTriggeredStatus: string | null;
    }>>(`/riders/deliveries/${deliveryId}/location`, { latitude, longitude });
    return response.data;
  },
};
