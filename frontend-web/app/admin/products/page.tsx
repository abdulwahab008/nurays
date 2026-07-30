'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserLayout } from '@/components/layout/UserLayout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

interface Product {
  id: string;
  name: string;
  price: number;
  seller: {
    businessName: string;
  };
  isActive: boolean;
  moderationStatus: string;
  images?: Array<{ imageUrl: string; isPrimary: boolean }>;
}

export default function AdminProductsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/admin/login');
      return;
    }

    if (user?.user_type !== 'admin' && user?.userType !== 'admin') {
      router.push('/products');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }

    loadProducts();
  }, [isAuthenticated, user, filter, router]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/admin/products${filter !== 'all' ? `?moderationStatus=${filter}` : ''}`);
      if (response.data.success) {
        setProducts(response.data.data.products || []);
      } else {
        setProducts([]);
      }
    } catch (error: any) {
      console.error('Failed to load products:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleModerate = async (productId: string, action: 'approve' | 'reject') => {
    try {
      await apiClient.post(`/admin/products/${productId}/moderate`, {
        approved: action === 'approve',
        reason: action === 'reject' ? 'Rejected by admin' : undefined,
      });
      showToast(`Product ${action === 'approve' ? 'approved' : 'rejected'} successfully`, 'success');
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to moderate product', 'error');
    }
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      approved: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return statusMap[status] || 'bg-gray-100 text-gray-800';
  };

  if (!isAuthenticated || (user?.user_type !== 'admin' && user?.userType !== 'admin')) {
    return null;
  }

  return (
    <UserLayout showSidebar={true} showNavbar={true}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Product Moderation</h1>
          <p className="text-gray-600 mt-1">Review and moderate products on the platform</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'approved', 'rejected'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-md font-medium transition-colors ${
                  filter === status
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm p-12 text-center">
            <div className="text-6xl mb-4">🍽️</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No products found</h2>
            <p className="text-gray-600">No products match your current filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="h-48 bg-gray-200 overflow-hidden">
                  {product.images && product.images[0] ? (
                    <img
                      src={product.images[0].imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <span className="text-4xl">🍽️</span>
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1">{product.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">Seller: {product.seller.businessName}</p>
                  <p className="text-lg font-bold text-green-600 mb-3">{formatPrice(product.price)}</p>
                  <div className="flex items-center justify-between mb-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(product.moderationStatus)}`}>
                      {product.moderationStatus}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs ${product.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {product.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {product.moderationStatus === 'pending' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleModerate(product.id, 'approve')}
                        className="bg-green-600 hover:bg-green-700 flex-1"
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleModerate(product.id, 'reject')}
                        className="border-red-300 text-red-600 hover:bg-red-50 flex-1"
                      >
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </UserLayout>
  );
}

