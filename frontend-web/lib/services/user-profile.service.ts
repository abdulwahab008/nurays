import { apiClient, ApiResponse } from '../api-client';

export interface UserProfile {
  id: string;
  phone: string;
  email?: string;
  userType: string;
  isEmailVerified?: boolean;
  profile?: {
    fullName: string;
    avatarUrl?: string;
    city?: string;
    area?: string;
    languagePreference: string;
  };
}

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

export const userProfileService = {
  getProfile: async () => {
    const response = await apiClient.get<ApiResponse<UserProfile>>('/users/me');
    return response.data;
  },

  updateProfile: async (data: {
    fullName?: string;
    email?: string;
    city?: string;
    area?: string;
    languagePreference?: string;
  }) => {
    const response = await apiClient.patch<ApiResponse<UserProfile>>('/users/me', data);
    return response.data;
  },

  updateAvatar: async (avatarUrl: string) => {
    const response = await apiClient.post<ApiResponse<{ avatarUrl: string }>>(
      '/users/me/avatar',
      { avatarUrl }
    );
    return response.data;
  },

  getAddresses: async () => {
    const response = await apiClient.get<ApiResponse<Address[]>>('/users/me/addresses');
    return response.data;
  },

  addAddress: async (data: {
    label?: string;
    addressLine1: string;
    addressLine2?: string;
    area: string;
    city: string;
    postalCode?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
    isDefault?: boolean;
  }) => {
    const response = await apiClient.post<ApiResponse<Address>>('/users/me/addresses', data);
    return response.data;
  },

  updateAddress: async (addressId: string, data: {
    label?: string;
    addressLine1?: string;
    addressLine2?: string;
    area?: string;
    city?: string;
    postalCode?: string;
    landmark?: string;
    latitude?: number;
    longitude?: number;
    isDefault?: boolean;
  }) => {
    const response = await apiClient.patch<ApiResponse<Address>>(`/users/me/addresses/${addressId}`, data);
    return response.data;
  },

  deleteAddress: async (addressId: string) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/users/me/addresses/${addressId}`);
    return response.data;
  },

  setDefaultAddress: async (addressId: string) => {
    const response = await apiClient.patch<ApiResponse<Address>>(`/users/me/addresses/${addressId}`, { isDefault: true });
    return response.data;
  },
};

