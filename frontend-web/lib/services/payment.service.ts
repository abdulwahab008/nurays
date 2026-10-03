import { apiClient, ApiResponse } from '../api-client';

export interface PaymentMethodInfo {
  id: 'cod' | 'safepay' | 'wallet' | 'jazzcash' | 'easypaisa' | 'bank';
  name: string;
  kind: 'cash' | 'online' | 'wallet' | 'manual_transfer';
  isAvailable: boolean;
  description: string;
}

export interface WalletTransaction {
  id: string;
  type: 'debit' | 'credit' | 'topup';
  amount: number;
  balanceAfter: number;
  description: string | null;
  status: string;
  orderId: string | null;
  orderNumber?: string | null;
  createdAt: string;
}

export interface WalletSummary {
  balance: number;
  currency: string;
  isLocked: boolean;
  recentTransactions: WalletTransaction[];
  topUp: { available: boolean; min: number; max: number };
}

export interface OrderPaymentStatus {
  paymentStatus: string;
  paymentMethod: string;
  orderStatus: string;
  paidAt: string | null;
  canPayOnline: boolean;
  lastAttempt: { status: string; createdAt: string; amount: number } | null;
}

export const paymentService = {
  getMethods: async (): Promise<PaymentMethodInfo[]> => {
    const res = await apiClient.get<ApiResponse<PaymentMethodInfo[]>>('/payments/methods');
    return res.data.data ?? [];
  },

  getWallet: async (): Promise<WalletSummary> => {
    const res = await apiClient.get<ApiResponse<WalletSummary>>('/payments/wallet');
    return res.data.data!;
  },

  getWalletTransactions: async (page = 1, limit = 20) => {
    const res = await apiClient.get<
      ApiResponse<{ transactions: WalletTransaction[]; pagination: { page: number; totalPages: number; total: number } }>
    >('/payments/wallet/transactions', { params: { page, limit } });
    return res.data.data!;
  },

  /** Start a top-up; returns the payment page to send the customer to. */
  startTopUp: async (amount: number): Promise<string> => {
    const res = await apiClient.post<ApiResponse<{ redirectUrl: string }>>('/payments/wallet/topup', { amount });
    return res.data.data!.redirectUrl;
  },

  /** Start paying an online order; returns the payment page to send the customer to. */
  startOrderPayment: async (orderId: string): Promise<string> => {
    const res = await apiClient.post<ApiResponse<{ redirectUrl: string }>>('/payments/process', {
      orderId,
      paymentMethod: 'safepay',
    });
    const url = res.data.data?.redirectUrl;
    if (!url) throw new Error('No payment page was returned');
    return url;
  },

  getOrderPaymentStatus: async (orderId: string): Promise<OrderPaymentStatus> => {
    const res = await apiClient.get<ApiResponse<OrderPaymentStatus>>(`/payments/orders/${orderId}/status`);
    return res.data.data!;
  },
};
