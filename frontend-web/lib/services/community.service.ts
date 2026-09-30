import { apiClient, ApiResponse } from '../api-client';

export interface Community {
  id: string;
  name: string;
  slug: string;
  city: string;
  areaDescription?: string | null;
  centerLatitude: number;
  centerLongitude: number;
  radiusKm: number;
  neighborCommunityIds: string[];
  crossCommunityEnabled: boolean;
  deliveryBaseFee: number;
  crossCommunityBaseFee: number;
  sellerCount?: number;
}

export interface CommunityKitchen {
  id: string;
  businessName: string;
  businessType: string;
  description?: string | null;
  ratingAverage: number;
  totalReviews?: number;
  coverImageUrl?: string | null;
  allowCrossCommunity: boolean;
  minPrepTimeMinutes?: number;
  chefName?: string;
  avatar?: string | null;
  cuisines?: string[];
  isOpen?: boolean;
  opensAt?: string;
  closesAt?: string;
  acceptsPreOrders?: boolean;
  preOrderDeliveryTime?: string;
  products?: Array<{
    id: string;
    name: string;
    price: number;
    productType: string;
  }>;
}

export interface CommunityDetail extends Community {
  neighbors: Array<{
    id: string;
    name: string;
    slug: string;
    deliveryBaseFee: number;
    crossCommunityBaseFee: number;
  }>;
  sellers: CommunityKitchen[];
}

export interface DetectCommunityResult {
  community: {
    id: string;
    name: string;
    slug: string;
    city: string;
    centerLatitude: number;
    centerLongitude: number;
    deliveryBaseFee: number;
  };
  distanceKm: number;
  isInsideRadius: boolean;
}

export const communityService = {
  getCommunities: async (): Promise<Community[]> => {
    const res = await apiClient.get<ApiResponse<Community[]>>('/communities');
    return res.data?.data || [];
  },

  getCommunity: async (identifier: string): Promise<CommunityDetail | null> => {
    const res = await apiClient.get<ApiResponse<CommunityDetail>>(`/communities/${identifier}`);
    return res.data?.data || null;
  },

  detectCommunity: async (lat: number, lng: number): Promise<DetectCommunityResult | null> => {
    const res = await apiClient.post<ApiResponse<DetectCommunityResult>>('/communities/detect', {
      latitude: lat,
      longitude: lng,
    });
    return res.data?.data || null;
  },

  setPrimaryCommunity: async (communityId: string) => {
    const res = await apiClient.post<ApiResponse<{ success: boolean; primaryCommunity: any }>>(
      '/communities/me/primary',
      { communityId }
    );
    return res.data?.data;
  },
};
