import { apiClient, ApiResponse } from '../api-client';

export interface PublicSellerProduct {
  id: string;
  name: string;
  nameUrdu?: string | null;
  description?: string | null;
  price: number;
  originalPrice?: number | null;
  productType: string;
  images: string[];
  preparationTime?: number | null;
  storageDays?: number | null;
  heatingInstructions?: string | null;
  ingredients?: string | null;
  allergens?: string | null;
  dietaryInfo?: string[];
  stockQuantity?: number;
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface PublicSellerAvailability {
  status: 'open' | 'closed' | 'busy' | 'vacation' | 'holiday' | 'preorder_only';
  isOpen: boolean;
  opensAt?: string | null;
  closesAt?: string | null;
  nextOpenAt?: string | null;
  reason?: string | null;
  isManualOverride?: boolean;
}

export interface PublicSeller {
  id: string;
  businessName: string;
  businessNameUrdu?: string | null;
  description?: string | null;
  coverImageUrl?: string | null;
  ratingAverage: number;
  totalReviews: number;
  minPrepTimeMinutes: number | null;
  minOrderAmountForDelivery?: number | null;
  freeDeliveryThreshold?: number | null;
  deliveryFeeType?: string | null;
  deliveryFeeFixed?: number | null;
  deliveryFeeBase?: number | null;
  deliveryFeePerKm?: number | null;
  freeDeliveryRadiusKm?: number | null;
  freeDeliveryAreas?: string[] | null;
  storeNotice?: string | null;
  scheduleMode?: string;
  orderCutoffTime?: string | null;
  preOrderOnly?: boolean;
  isVerified?: boolean;
  verificationStatus?: string;
  availability?: PublicSellerAvailability;
  businessType?: string | null;
  mealCategories?: string[];
  allowCrossCommunity?: boolean;
  community?: {
    id: string;
    name: string;
    slug: string;
    city: string;
    deliveryBaseFee: number;
    crossCommunityBaseFee?: number;
    areaDescription?: string | null;
  } | null;
  chef: {
    name: string;
    avatar?: string | null;
    bio?: string | null;
    area: string;
    city: string;
  };
  products: PublicSellerProduct[];
  productCount?: number;
  reviews?: Array<{
    id: string;
    rating: number;
    comment?: string | null;
    createdAt: string;
    author: string;
    avatar?: string | null;
  }>;
}

export const sellerService = {
  getPublicSellers: async (params?: {
    communityId?: string;
    city?: string;
    search?: string;
    businessType?: string;
    limit?: number;
  }): Promise<PublicSeller[]> => {
    try {
      const res = await apiClient.get<ApiResponse<PublicSeller[]>>('/sellers', { params });
      return res.data?.data || [];
    } catch (err) {
      console.error('Failed to fetch public sellers:', err);
      return [];
    }
  },

  getPublicSeller: async (idOrUserId: string): Promise<PublicSeller | null> => {
    try {
      const res = await apiClient.get<ApiResponse<PublicSeller>>(`/sellers/${idOrUserId}`);
      return res.data?.data || null;
    } catch (err) {
      console.error(`Failed to fetch seller storefront for ${idOrUserId}:`, err);
      return null;
    }
  },
};
