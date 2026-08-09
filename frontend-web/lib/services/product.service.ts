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
    mealCategories?: string[];
    businessType?: string;
    preOrderOnly?: boolean;
    isAcceptingOrders?: boolean;
    acceptingOrdersReason?: string | null;
    availability?: {
      status: string;
      isOpen: boolean;
      opensAt: string | null;
      closesAt: string | null;
      nextOpenAt: string | null;
      reason: string | null;
    };
  };
  stock: {
    direct: number;
    hub: number;
  };
  allergens?: string | null;
  dietaryInfo?: string[];
  delivery?: {
    deliverable: boolean;
    fee: number;
    distanceKm: number | null;
    reason: string | null;
    estimatedMinMinutes: number;
    estimatedMaxMinutes: number;
  } | null;
  estimatedDeliveryMinMinutes?: number | null;
  estimatedDeliveryMaxMinutes?: number | null;
  minOrderAmountForDelivery?: number | null;
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
  mealCategory?: string;
  openNow?: boolean;
  open247?: boolean;
  deliveryAvailable?: boolean;
  pickupAvailable?: boolean;
  offersAvailable?: boolean;
  freeDelivery?: boolean;
  businessType?: string;
  preOrderOnly?: boolean;
  currentlyBusy?: boolean;
  newKitchens?: boolean;
  fastDelivery?: boolean;
  customerLat?: number;
  customerLng?: number;
  maxDistanceKm?: number;
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

  getProduct: async (idOrSlug: string, customerLat?: number, customerLng?: number) => {
    const params = new URLSearchParams();
    if (customerLat != null) params.append('customerLat', String(customerLat));
    if (customerLng != null) params.append('customerLng', String(customerLng));
    const query = params.toString();
    const response = await apiClient.get<ApiResponse<Product>>(`/products/${idOrSlug}${query ? `?${query}` : ''}`);
    return response.data;
  },
};

