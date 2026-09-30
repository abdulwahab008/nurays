import { apiClient, ApiResponse } from '../api-client';

export interface FavoriteSellerItem {
  id: string;
  sellerId: string;
  businessName: string;
  businessType: string;
  ratingAverage: number;
  totalReviews: number;
  coverImageUrl?: string | null;
  community?: { id: string; name: string; slug: string } | null;
  distanceKm: number | null;
  availability: {
    isOpen: boolean;
    status: string;
    nextOpenAt: string | null;
    reason: string | null;
  };
  sampleProducts: Array<{
    id: string;
    name: string;
    price: number;
    image: string | null;
  }>;
  savedAt: string;
}

export const favoriteService = {
  getFavorites: async (lat?: number, lng?: number): Promise<FavoriteSellerItem[]> => {
    const params = new URLSearchParams();
    if (lat != null) params.append('lat', String(lat));
    if (lng != null) params.append('lng', String(lng));
    const query = params.toString();
    const res = await apiClient.get<ApiResponse<FavoriteSellerItem[]>>(`/favorites${query ? `?${query}` : ''}`);
    return res.data?.data || [];
  },

  addFavorite: async (sellerId: string) => {
    const res = await apiClient.post<ApiResponse<{ isFavorite: boolean }>>(`/favorites/${sellerId}`);
    return res.data?.data;
  },

  removeFavorite: async (sellerId: string) => {
    const res = await apiClient.delete<ApiResponse<{ isFavorite: boolean }>>(`/favorites/${sellerId}`);
    return res.data?.data;
  },

  checkFavorite: async (sellerId: string): Promise<boolean> => {
    try {
      const res = await apiClient.get<ApiResponse<{ isFavorite: boolean }>>(`/favorites/check/${sellerId}`);
      return !!res.data?.data?.isFavorite;
    } catch {
      return false;
    }
  },

  toggleFavorite: async (sellerId: string): Promise<{ isFavorite: boolean }> => {
    const isFav = await favoriteService.checkFavorite(sellerId);
    if (isFav) {
      await favoriteService.removeFavorite(sellerId);
      return { isFavorite: false };
    } else {
      await favoriteService.addFavorite(sellerId);
      return { isFavorite: true };
    }
  },
};
