import { apiClient, ApiResponse } from '../api-client';

export interface Address {
  id: string;
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  area: string;
  city: string;
  postalCode?: string;
  landmark?: string;
  isDefault: boolean;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

export const addressService = {
  getAddresses: async () => {
    const response = await apiClient.get<ApiResponse<Address[]>>('/users/me/addresses');
    return response.data;
  },

  addAddress: async (data: {
    label?: string;
    address_line1: string;
    address_line2?: string;
    area: string;
    city: string;
    postal_code?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
    is_default?: boolean;
  }) => {
    const response = await apiClient.post<ApiResponse<Address>>('/users/me/addresses', data);
    return response.data;
  },
};

