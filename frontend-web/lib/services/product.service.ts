import { apiClient, ApiResponse } from '../api-client';

export interface Product {
  id: string;
  name: string;
  nameUrdu?: string;
  slug: string;
  price: number;
  originalPrice?: number;
  unit: string;
  ratingAverage: number;
  totalReviews: number;
  primaryImage?: string;
  seller: {
    id: string;
    businessName: string;
    rating: number;
    isVerified: boolean;
  };
  stock: {
    direct: number;
    hub: number;
  };
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  categoryId?: string;
  sellerId?: string;
  city?: string;
  area?: string;
  minPrice?: number;
  maxPrice?: number;
  dietary?: string;
  stockType?: 'direct' | 'hub' | 'both';
  productType?: 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook';
  search?: string;
  sort?: 'popular' | 'newest' | 'price_low' | 'price_high' | 'rating';
  isActive?: boolean;
}

export interface ProductsResponse {
  products: Product[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export const productService = {
  getProducts: async (filters: ProductFilters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });

    const response = await apiClient.get<ApiResponse<ProductsResponse>>(
      `/products?${params.toString()}`
    );
    return response.data;
  },

  getProduct: async (idOrSlug: string) => {
    const response = await apiClient.get<ApiResponse<Product>>(`/products/${idOrSlug}`);
    return response.data;
  },
};

