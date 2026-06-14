import { apiClient } from '../api-client';

export interface FavoriteProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  unit: string;
  ratingAverage: number;
  totalReviews: number;
  primaryImage: string | null;
  isActive: boolean;
  seller: { businessName: string; isVerified: boolean } | null;
}

export const favoriteService = {
  async list(): Promise<FavoriteProduct[]> {
    const res = await apiClient.get<{ success: boolean; data: FavoriteProduct[] }>('/favorites');
    return res.data.data;
  },
  async ids(): Promise<string[]> {
    const res = await apiClient.get<{ success: boolean; data: string[] }>('/favorites/ids');
    return res.data.data;
  },
  async add(productId: string): Promise<void> {
    await apiClient.post('/favorites', { productId });
  },
  async remove(productId: string): Promise<void> {
    await apiClient.delete(`/favorites/${productId}`);
  },
};
