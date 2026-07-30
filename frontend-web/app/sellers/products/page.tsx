'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils';

const sidebarItems = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: '📊' },
  { name: 'Orders', href: '/sellers/orders', icon: '📦' },
  { name: 'Products', href: '/sellers/products', icon: '🍽️' },
  { name: 'Inventory', href: '/sellers/products?view=inventory', icon: '📋' },
  { name: 'Promotions', href: '/sellers/promotions', icon: '🏷️' },
  { name: 'Earnings', href: '/sellers/earnings', icon: '💰' },
  { name: 'Analytics', href: '/sellers/analytics', icon: '📈' },
  { name: 'Notifications', href: '/sellers/notifications', icon: '🔔' },
  { name: 'Settings', href: '/sellers/settings', icon: '⚙️' },
];

// Icons
const Icons = {
  food: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.87c1.355 0 2.697.055 4.024.165C17.155 8.51 18 9.473 18 10.608v2.513m-3-4.87v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.38a48.474 48.474 0 00-6-.37c-2.032 0-4.034.125-6 .37m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.17c0 .62-.504 1.124-1.125 1.124H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
    </svg>
  ),
  plus: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  image: (
    <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
};

interface Product {
  id: string;
  name: string;
  price: number;
  costPrice?: number;
  productType?: 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook';
  shelfLifeHours?: number;
  stockQuantity: number;
  unit?: string;
  isActive: boolean;
  approvalStatus: 'pending' | 'approved' | 'rejected';
  images?: Array<{ imageUrl: string; isPrimary: boolean }>;
  category?: { name: string };
}

// Product type display info
const productTypeInfo: Record<string, { label: string; icon: string; color: string }> = {
  frozen: { label: 'Frozen', icon: '❄️', color: 'bg-blue-100 text-blue-700' },
  fresh: { label: 'Fresh', icon: '🥬', color: 'bg-green-100 text-green-700' },
  ready_to_eat: { label: 'Ready to Eat', icon: '🍽️', color: 'bg-orange-100 text-orange-700' },
  ready_to_cook: { label: 'Ready to Cook', icon: '🍳', color: 'bg-purple-100 text-purple-700' },
};

// Format unit for display
const formatUnit = (unit?: string): string => {
  if (!unit) return '';
  
  const unitMap: Record<string, string> = {
    'piece': 'per piece',
    'pack': 'per pack',
    'dozen': 'per dozen',
    '100g': 'per 100g',
    '250g': 'per 250g',
    '500g': 'per 500g',
    '1kg': 'per 1 KG',
    'kg': 'per KG',
  };
  
  return unitMap[unit] || unit;
};

export default function SellerProductsPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [updatingStock, setUpdatingStock] = useState<{[key: string]: boolean}>({});
  const [stockValues, setStockValues] = useState<{[key: string]: number}>({});
  const [showBulkUpdate, setShowBulkUpdate] = useState(false);
  const [bulkStockValue, setBulkStockValue] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [editingStock, setEditingStock] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }

    loadProducts();
  }, [isAuthenticated, user, router]);

  const loadProducts = async () => {
    try {
      setLoading(true);
      // Use the dedicated seller products endpoint that shows ALL products (including pending)
      const response = await apiClient.get('/products/seller/my-products');
      if (response.data.success) {
        setProducts(response.data.data.products || []);
      }
    } catch (error: any) {
      console.error('Failed to load products:', error);
      // If endpoint doesn't exist, show empty state with message
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (productId: string, currentStatus: boolean) => {
    try {
      await apiClient.patch(`/products/${productId}`, { isActive: !currentStatus });
      showToast(`Product ${!currentStatus ? 'activated' : 'deactivated'} successfully`, 'success');
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update product', 'error');
    }
  };

  const handleQuickStockUpdate = async (productId: string, newStock: number) => {
    if (newStock < 0) {
      showToast('Stock quantity cannot be negative', 'error');
      return;
    }
    
    try {
      setUpdatingStock(prev => ({ ...prev, [productId]: true }));
      await apiClient.patch(`/products/${productId}`, { stockQuantity: newStock });
      showToast('Stock updated successfully', 'success');
      
      // Update local state immediately for better UX
      setProducts(prev => prev.map(p => 
        p.id === productId ? { ...p, stockQuantity: newStock } : p
      ));
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update stock', 'error');
    } finally {
      setUpdatingStock(prev => ({ ...prev, [productId]: false }));
    }
  };

  const handleBulkStockUpdate = async () => {
    if (!bulkStockValue || selectedProducts.length === 0) {
      showToast('Please enter stock value and select products', 'error');
      return;
    }

    const stockNum = parseInt(bulkStockValue);
    if (stockNum < 0) {
      showToast('Stock quantity cannot be negative', 'error');
      return;
    }

    try {
      setLoading(true);
      await Promise.all(
        selectedProducts.map(productId => 
          apiClient.patch(`/products/${productId}`, { stockQuantity: stockNum })
        )
      );
      showToast(`Updated stock for ${selectedProducts.length} products`, 'success');
      setShowBulkUpdate(false);
      setBulkStockValue('');
      setSelectedProducts([]);
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to bulk update', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleProductSelection = (productId: string) => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await apiClient.delete(`/products/${productId}`);
      showToast('Product deleted successfully', 'success');
      loadProducts();
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to delete product', 'error');
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout
      title="My Products"
      subtitle="Manage your product listings"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-7xl mx-auto">
        {/* Header with Actions */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Products</h1>
            <p className="text-sm text-gray-500 mt-1">Manage your product inventory and stock levels</p>
          </div>
          
          <div className="flex gap-2 w-full sm:w-auto">
            {products.length > 0 && (
              <button 
                onClick={() => setShowBulkUpdate(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                Bulk Update
                {selectedProducts.length > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs font-semibold text-emerald-700 bg-emerald-100 rounded">
                    {selectedProducts.length}
                  </span>
                )}
              </button>
            )}
            <Link href="/sellers/products/new">
              <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add Product
              </button>
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading products...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.food}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No products yet</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Start selling by adding your first product. It only takes a few minutes to create a listing.
            </p>
            <Link href="/sellers/products/new">
              <Button size="lg" className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200">
                Add Your First Product
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {products.map((product) => (
              <div 
                key={product.id} 
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-lg transition-all duration-300 group"
              >
                {/* Product Image */}
                <div className="h-48 bg-gradient-to-br from-gray-100 to-gray-50 overflow-hidden relative">
                  {product.images && product.images[0] ? (
                    <img
                      src={product.images[0].imageUrl.startsWith('http') 
                        ? product.images[0].imageUrl 
                        : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3001'}${product.images[0].imageUrl}`
                      }
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-2">
                      {Icons.image}
                      <span className="text-xs text-gray-400">No image</span>
                    </div>
                  )}
                  {/* Moderation / Live-Hidden Status Badge */}
                  <div className="absolute top-3 right-3">
                    {product.approvalStatus === 'pending' ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold shadow-sm bg-amber-500 text-white">
                        ⏳ Pending review
                      </span>
                    ) : product.approvalStatus === 'rejected' ? (
                      <span className="px-3 py-1 rounded-full text-xs font-semibold shadow-sm bg-red-500 text-white">
                        ✕ Rejected
                      </span>
                    ) : (
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold shadow-sm ${
                        product.isActive
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-400 text-white'
                      }`}>
                        {product.isActive ? '● Live' : '○ Hidden'}
                      </span>
                    )}
                  </div>
                  {/* Product Type Badge */}
                  <div className="absolute top-3 left-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      productTypeInfo[product.productType || 'frozen']?.color || 'bg-blue-100 text-blue-700'
                    }`}>
                      {productTypeInfo[product.productType || 'frozen']?.icon} {productTypeInfo[product.productType || 'frozen']?.label}
                    </span>
                  </div>
                </div>

                {/* Product Details */}
                <div className="p-5">
                  <h3 className="font-semibold text-gray-900 mb-2 truncate">{product.name}</h3>
                  
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-xl font-bold text-emerald-600">{formatPrice(product.price)}</p>
                      {product.unit && (
                        <p className="text-xs text-gray-500 mt-0.5">{formatUnit(product.unit)}</p>
                      )}
                    </div>
                    <span className={`text-sm font-medium px-2 py-1 rounded-lg ${
                      product.stockQuantity > 10 
                        ? 'bg-emerald-50 text-emerald-700' 
                        : product.stockQuantity > 0 
                          ? 'bg-amber-50 text-amber-700' 
                          : 'bg-red-50 text-red-700'
                    }`}>
                      {product.stockQuantity > 0 ? `${product.stockQuantity} in stock` : 'Out of stock'}
                    </span>
                  </div>

                  {/* Profit Display - Always same height */}
                  <div className="mb-3 h-14">
                    {product.costPrice && product.costPrice > 0 ? (
                      <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between h-full">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs font-medium text-gray-600">Your Profit:</span>
                        </div>
                        <span className="text-sm font-bold text-emerald-700">
                          {formatPrice(product.price - product.costPrice - (product.price * 0.15))}
                          <span className="text-emerald-600 ml-1 text-xs">
                            ({((product.price - product.costPrice - (product.price * 0.15)) / product.price * 100).toFixed(0)}%)
                          </span>
                        </span>
                      </div>
                    ) : (
                      <div></div>
                    )}
                  </div>

                  {/* Stock Update Input (conditional) - Smaller */}
                  {editingStock[product.id] && (
                    <div className="mb-3 flex gap-1.5">
                      <input
                        type="number"
                        min="0"
                        value={stockValues[product.id] ?? product.stockQuantity}
                        onChange={(e) => setStockValues(prev => ({ ...prev, [product.id]: parseInt(e.target.value) || 0 }))}
                        className="w-20 px-2 py-1.5 border-2 border-blue-300 rounded text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        disabled={updatingStock[product.id]}
                        placeholder="Qty"
                        autoFocus
                      />
                      <button
                        onClick={async () => {
                          await handleQuickStockUpdate(product.id, stockValues[product.id] ?? product.stockQuantity);
                          setEditingStock(prev => ({ ...prev, [product.id]: false }));
                        }}
                        disabled={updatingStock[product.id] || (stockValues[product.id] ?? product.stockQuantity) === product.stockQuantity}
                        className={`p-1.5 rounded text-white transition-all ${
                          updatingStock[product.id]
                            ? 'bg-gray-400 cursor-not-allowed'
                            : (stockValues[product.id] ?? product.stockQuantity) === product.stockQuantity
                              ? 'bg-gray-300 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700'
                        }`}
                        title="Save"
                      >
                        {updatingStock[product.id] ? (
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingStock(prev => ({ ...prev, [product.id]: false }));
                          setStockValues(prev => ({ ...prev, [product.id]: product.stockQuantity }));
                        }}
                        className="p-1.5 bg-gray-100 text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded transition-colors"
                        title="Cancel"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Action Buttons - Icons Only */}
                  <div className="grid grid-cols-4 gap-2">
                    {/* Update Stock Button */}
                    <button
                      onClick={() => setEditingStock(prev => ({ ...prev, [product.id]: !prev[product.id] }))}
                      className="flex flex-col items-center justify-center p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-all group"
                      title="Update Stock"
                    >
                      <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </button>

                    {/* Edit Button */}
                    <Link href={`/sellers/products/${product.id}/edit`}>
                      <button
                        className="w-full flex flex-col items-center justify-center p-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-all"
                        title="Edit Product"
                      >
                        <svg className="w-6 h-6 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </Link>

                    {/* Hide/Show Button */}
                    <button
                      onClick={() => handleToggleActive(product.id, product.isActive)}
                      className={`flex flex-col items-center justify-center p-3 border rounded-lg transition-all ${
                        product.isActive 
                          ? 'bg-orange-50 hover:bg-orange-100 border-orange-200' 
                          : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                      }`}
                      title={product.isActive ? 'Hide Product' : 'Show Product'}
                    >
                      {product.isActive ? (
                        <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>

                    {/* Delete Button */}
                    <button
                      onClick={() => {
                        if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
                          handleDeleteProduct(product.id);
                        }
                      }}
                      className="flex flex-col items-center justify-center p-3 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition-all"
                      title="Delete Product"
                    >
                      <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bulk Stock Update Modal */}
      {showBulkUpdate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Bulk Stock Update</h2>
                <button
                  onClick={() => {
                    setShowBulkUpdate(false);
                    setSelectedProducts([]);
                    setBulkStockValue('');
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  New Stock Quantity (will apply to all selected products)
                </label>
                <input
                  type="number"
                  min="0"
                  value={bulkStockValue}
                  onChange={(e) => setBulkStockValue(e.target.value)}
                  placeholder="Enter stock quantity"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                />
              </div>

              <div className="mb-4 flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Select Products ({selectedProducts.length} selected)
                </label>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedProducts(products.map(p => p.id))}
                  >
                    Select All
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelectedProducts([])}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                {products.map((product) => (
                  <div
                    key={product.id}
                    onClick={() => toggleProductSelection(product.id)}
                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedProducts.includes(product.id)
                        ? 'border-emerald-500 bg-emerald-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="w-5 h-5 text-emerald-500 rounded focus:ring-emerald-500"
                        />
                        <div>
                          <p className="font-medium text-gray-900">{product.name}</p>
                          <p className="text-sm text-gray-500">Current stock: {product.stockQuantity}</p>
                        </div>
                      </div>
                      <span className="text-sm font-medium text-emerald-600">
                        {formatPrice(product.price)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowBulkUpdate(false);
                    setSelectedProducts([]);
                    setBulkStockValue('');
                  }}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBulkStockUpdate}
                  disabled={!bulkStockValue || selectedProducts.length === 0 || loading}
                  className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  {loading ? 'Updating...' : `Update ${selectedProducts.length} Products`}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

