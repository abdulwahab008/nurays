'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

const sidebarItems = [
  { name: 'Dashboard', href: '/sellers/dashboard', icon: '' },
  { name: 'Orders', href: '/sellers/orders', icon: '' },
  { name: 'Products', href: '/sellers/products', icon: '' },
  { name: 'Inventory', href: '/sellers/products?view=inventory', icon: '' },
  { name: 'Promotions', href: '/sellers/promotions', icon: '' },
  { name: 'Earnings', href: '/sellers/earnings', icon: '' },
  { name: 'Analytics', href: '/sellers/analytics', icon: '' },
  { name: 'Notifications', href: '/sellers/notifications', icon: '' },
  { name: 'Settings', href: '/sellers/settings', icon: '' },
];

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
  iconUrl?: string;
  parentId?: string | null;
  productType?: string;
  children?: Category[];
}

interface GroupedCategories {
  frozen: Category[];
  fresh: Category[];
  ready_to_eat: Category[];
  ready_to_cook: Category[];
}

interface ProductImage {
  id?: string;
  file?: File;
  preview: string;
  isPrimary: boolean;
  isExisting?: boolean;
  url?: string;
}

interface Product {
  id: string;
  name: string;
  nameUrdu?: string;
  description?: string;
  categoryId?: string;
  price: number;
  originalPrice?: number;
  costPrice?: number;
  productType?: string;
  shelfLifeHours?: number;
  preparationTime?: number;
  unit: string;
  stockQuantity: number;
  stockType: string;
  ingredients?: string;
  dietaryInfo?: string[];
  isActive: boolean;
  images?: Array<{ id: string; imageUrl: string; isPrimary: boolean }>;
  category?: { id: string; name: string; parentId?: string };
}

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams();
  const productId = params.id as string;
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [groupedCategories, setGroupedCategories] = useState<GroupedCategories>({
    frozen: [],
    fresh: [],
    ready_to_eat: [],
    ready_to_cook: [],
  });
  const [images, setImages] = useState<ProductImage[]>([]);
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [customUnit, setCustomUnit] = useState('');
  
  // Variant system state
  const [showVariants, setShowVariants] = useState(false);
  const [variants, setVariants] = useState<Array<{
    id?: string;
    name: string;
    nameUrdu?: string;
    sku?: string;
    price: number;
    originalPrice?: number;
    costPrice?: number;
    stockQuantity: number;
    stockThreshold?: number;
    weightGrams?: number;
    isDefault: boolean;
    isActive: boolean;
    sortOrder: number;
  }>>([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState<string[]>([]);
  
  // Form data
  const [formData, setFormData] = useState({
    name: '',
    nameUrdu: '',
    categoryId: '',
    description: '',
    price: '',
    originalPrice: '',
    costPrice: '',  // Seller's cost to make the product
    productType: '' as '' | 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook',
    shelfLifeHours: '',  // How long product stays fresh
    preparationTime: '', // Minutes to prepare for made-to-order
    unit: 'piece',
    stockQuantity: '50',
    stockType: 'direct' as 'direct' | 'hub' | 'both',
    ingredients: '',
    isHalal: true,
    isActive: true,
  });

  // Product type options
  const productTypeOptions = [
    { value: 'frozen', label: 'Frozen', labelUrdu: 'منجمد', icon: '❄️', description: 'Stored frozen, long shelf life' },
    { value: 'fresh', label: 'Fresh', labelUrdu: 'تازہ', icon: '🥬', description: 'Made fresh daily, same-day delivery' },
    { value: 'ready_to_eat', label: 'Ready to Eat', labelUrdu: 'کھانے کے لیے تیار', icon: '🍽️', description: 'Ready to eat immediately' },
    { value: 'ready_to_cook', label: 'Ready to Cook', labelUrdu: 'پکانے کے لیے تیار', icon: '🍳', description: 'Prepared, needs cooking' },
  ];

  // Unit options
  const unitOptions = [
    { value: 'piece', label: 'Per Piece', labelUrdu: 'فی عدد', example: '1 samosa' },
    { value: 'pack', label: 'Per Pack', labelUrdu: 'فی پیک', example: '6 samosas' },
    { value: 'dozen', label: 'Per Dozen', labelUrdu: 'فی درجن', example: '12 pieces' },
    { value: '100g', label: 'Per 100g', labelUrdu: 'فی 100 گرام', example: '100 grams' },
    { value: '250g', label: 'Per 250g', labelUrdu: 'فی 250 گرام', example: '250 grams' },
    { value: '500g', label: 'Per 500g', labelUrdu: 'فی 500 گرام', example: '500 grams' },
    { value: '1kg', label: 'Per 1 KG', labelUrdu: 'فی 1 کلو', example: '1000 grams' },
    { value: 'kg', label: 'Per KG', labelUrdu: 'فی کلو', example: 'per kilogram' },
    { value: 'other', label: 'Other (Custom)', labelUrdu: 'دیگر', example: 'Custom unit' },
  ];

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

    loadCategories();
    loadProduct();
  }, [isAuthenticated, user, router, productId]);

  const loadProductVariants = async () => {
    try {
      const response = await apiClient.get(`/product-variants/product/${productId}`);
      if (response.data.success && response.data.data) {
        const loadedVariants = response.data.data.map((v: any) => ({
          id: v.id,
          name: v.name,
          nameUrdu: v.nameUrdu,
          sku: v.sku,
          price: v.price,
          originalPrice: v.originalPrice,
          costPrice: v.costPrice,
          stockQuantity: v.stockQuantity,
          stockThreshold: v.stockThreshold,
          weightGrams: v.weightGrams,
          isDefault: v.isDefault,
          isActive: v.isActive,
          sortOrder: v.sortOrder,
        }));
        setVariants(loadedVariants);
        if (loadedVariants.length > 0) {
          setShowVariants(true);
        }
      }
    } catch (error) {
      console.error('Failed to load variants:', error);
    }
  };

  // Load variants after product is loaded
  useEffect(() => {
    if (productId && !loading) {
      loadProductVariants();
    }
  }, [productId, loading]);

  const loadCategories = async () => {
    try {
      // Use the new grouped endpoint
      const response = await apiClient.get('/categories/grouped');
      if (response.data.success && response.data.data) {
        setGroupedCategories(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
      // Fallback to default structure
      setGroupedCategories({
        frozen: [],
        fresh: [],
        ready_to_eat: [],
        ready_to_cook: [],
      });
    }
  };

  // Get categories for selected product type
  const getCategoriesForSelectedType = (): Category[] => {
    if (!formData.productType) return [];
    return groupedCategories[formData.productType] || [];
  };

  // Get selected parent category
  const getSelectedParentCategory = (): Category | null => {
    if (!selectedParentId) return null;
    const categories = getCategoriesForSelectedType();
    return categories.find(c => c.id === selectedParentId) || null;
  };

  // Get selected subcategory info for display
  const getSelectedCategoryInfo = () => {
    if (!formData.categoryId) return null;
    const categories = getCategoriesForSelectedType();
    
    // Check if it's a parent category
    const parentMatch = categories.find(c => c.id === formData.categoryId);
    if (parentMatch) {
      return { category: parentMatch, parent: null };
    }
    
    // Check subcategories
    for (const parent of categories) {
      const subMatch = parent.children?.find(c => c.id === formData.categoryId);
      if (subMatch) {
        return { category: subMatch, parent };
      }
    }
    return null;
  };

  // Variant helper functions
  const addVariant = () => {
    if (variants.length >= 20) {
      showToast('Maximum 20 variants allowed per product', 'error');
      return;
    }
    
    setVariants([...variants, {
      id: '',
      name: '',
      nameUrdu: '',
      sku: '',
      price: Number(formData.price) || 0,
      originalPrice: Number(formData.originalPrice) || 0,
      costPrice: Number(formData.costPrice) || 0,
      stockQuantity: 0,
      stockThreshold: 10,
      weightGrams: 0,
      isDefault: variants.length === 0,
      isActive: true,
      sortOrder: variants.length,
    }]);
  };

  const removeVariant = (index: number) => {
    const variant = variants[index];
    if (variant.id) {
      setDeletedVariantIds([...deletedVariantIds, variant.id]);
    }
    setVariants(variants.filter((_, i) => i !== index));
  };

  const updateVariant = (index: number, field: string, value: any) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const setVariantAsDefault = (index: number) => {
    const updated = variants.map((v, i) => ({
      ...v,
      isDefault: i === index
    }));
    setVariants(updated);
  };

  const loadProduct = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/products/${productId}`);
      
      if (response.data.success && response.data.data) {
        const product: Product = response.data.data;
        
        const productCategoryId = product.categoryId || product.category?.id || '';
        const productType = (product.productType as '' | 'frozen' | 'fresh' | 'ready_to_eat' | 'ready_to_cook') || '';
        
        // Check if unit is a custom value (not in predefined list)
        const predefinedUnits = ['piece', 'pack', 'dozen', '100g', '250g', '500g', '1kg', 'kg'];
        const productUnit = product.unit || 'piece';
        const isCustomUnit = !predefinedUnits.includes(productUnit);
        
        if (isCustomUnit) {
          setCustomUnit(productUnit);
        }
        
        setFormData({
          name: product.name || '',
          nameUrdu: product.nameUrdu || '',
          categoryId: productCategoryId,
          description: product.description || '',
          price: String(product.price || ''),
          originalPrice: product.originalPrice ? String(product.originalPrice) : '',
          costPrice: product.costPrice ? String(product.costPrice) : '',
          productType: productType,
          shelfLifeHours: product.shelfLifeHours ? String(product.shelfLifeHours) : '',
          preparationTime: product.preparationTime ? String(product.preparationTime) : '',
          unit: isCustomUnit ? 'other' : productUnit,
          stockQuantity: String(product.stockQuantity || 50),
          stockType: (product.stockType as 'direct' | 'hub' | 'both') || 'direct',
          ingredients: product.ingredients || '',
          isHalal: product.dietaryInfo?.includes('Halal') ?? true,
          isActive: product.isActive ?? true,
        });

        // Set selected parent category based on existing product category
        // We need to find the parent in the grouped categories
        if (productCategoryId && productType) {
          // Categories will be available after groupedCategories loads
          // We'll set selectedParentId in a useEffect when categories are loaded
        }

        // Load existing images
        if (product.images && product.images.length > 0) {
          const existingImages: ProductImage[] = product.images.map(img => ({
            id: img.id,
            preview: img.imageUrl.startsWith('http') ? img.imageUrl : `${process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '')}${img.imageUrl}`,
            isPrimary: img.isPrimary,
            isExisting: true,
            url: img.imageUrl,
          }));
          setImages(existingImages);
        }
      }
    } catch (error: any) {
      console.error('Failed to load product:', error);
      showToast('Failed to load product', 'error');
      router.push('/sellers/products');
    } finally {
      setLoading(false);
    }
  };

  // Effect to set selectedParentId when product and categories are loaded
  useEffect(() => {
    if (!formData.categoryId || !formData.productType) return;
    
    const categories = getCategoriesForSelectedType();
    if (categories.length === 0) return;
    
    // Check if it's a parent category
    const isParent = categories.find(c => c.id === formData.categoryId);
    if (isParent) {
      setSelectedParentId(formData.categoryId);
    } else {
      // Find parent of this subcategory
      const parent = categories.find(c => 
        c.children?.some(child => child.id === formData.categoryId)
      );
      if (parent) {
        setSelectedParentId(parent.id);
      }
    }
  }, [formData.categoryId, formData.productType, groupedCategories]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (images.length >= 4) {
        showToast('Maximum 4 images allowed', 'warning');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const newImage: ProductImage = {
          file,
          preview: event.target?.result as string,
          isPrimary: images.length === 0,
          isExisting: false,
        };
        setImages((prev) => [...prev, newImage]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    const imageToRemove = images[index];
    
    // Track deleted existing images
    if (imageToRemove.isExisting && imageToRemove.id) {
      setDeletedImageIds(prev => [...prev, imageToRemove.id!]);
    }
    
    setImages((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      // Reassign primary if removed
      if (imageToRemove.isPrimary && updated.length > 0) {
        updated[0].isPrimary = true;
      }
      return updated;
    });
  };

  const setPrimaryImage = (index: number) => {
    setImages((prev) => {
      const updated = prev.map((img, i) => ({
        ...img,
        isPrimary: i === index,
      }));
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name.trim()) {
      showToast('Please enter product name', 'error');
      return;
    }
    if (!formData.price || parseFloat(formData.price) <= 0) {
      showToast('Please enter a valid price', 'error');
      return;
    }
    if (formData.unit === 'other' && !customUnit.trim()) {
      showToast('Please enter a custom unit type', 'error');
      return;
    }

    try {
      setSaving(true);

      // Upload new images
      let newImageUrls: string[] = [];
      const newImages = images.filter(img => !img.isExisting && img.file);
      
      if (newImages.length > 0) {
        const formDataUpload = new FormData();
        newImages.forEach((img) => {
          if (img.file) {
            formDataUpload.append('images', img.file);
          }
        });
        
        try {
          const uploadResponse = await apiClient.post('/upload/product-images', formDataUpload, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          
          if (uploadResponse.data.success) {
            newImageUrls = uploadResponse.data.data.images.map((img: { url: string }) => img.url);
          }
        } catch (uploadError: any) {
          console.error('Image upload failed:', uploadError);
          showToast('Failed to upload new images', 'warning');
        }
      }

      // Collect existing image URLs that weren't deleted
      const existingImageUrls = images
        .filter(img => img.isExisting && img.url)
        .map(img => img.url!);

      // Prepare update data
      const productData = {
        name: formData.name.trim(),
        nameUrdu: formData.nameUrdu?.trim() || undefined,
        categoryId: formData.categoryId || undefined,
        description: formData.description?.trim() || undefined,
        price: parseFloat(formData.price),
        originalPrice: formData.originalPrice ? parseFloat(formData.originalPrice) : undefined,
        costPrice: formData.costPrice ? parseFloat(formData.costPrice) : undefined,
        productType: formData.productType,
        shelfLifeHours: formData.shelfLifeHours ? parseInt(formData.shelfLifeHours) : undefined,
        preparationTime: formData.preparationTime ? parseInt(formData.preparationTime) : undefined,
        unit: formData.unit === 'other' ? customUnit.trim() : formData.unit,
        stockQuantity: parseInt(formData.stockQuantity) || 50,
        stockType: formData.stockType,
        ingredients: formData.ingredients?.trim() || undefined,
        dietaryInfo: formData.isHalal ? ['Halal'] : [],
        isActive: formData.isActive,
        images: [...existingImageUrls, ...newImageUrls],
      };

      console.log('Updating product:', productData);
      const response = await apiClient.patch(`/products/${productId}`, productData);

      if (response.data.success) {
        // Handle variant updates
        if (variants.length > 0 || deletedVariantIds.length > 0) {
          try {
            // Delete removed variants
            for (const variantId of deletedVariantIds) {
              await apiClient.delete(`/product-variants/${variantId}`);
            }

            // Update or create variants
            for (const variant of variants) {
              const variantData = {
                name: variant.name,
                nameUrdu: variant.nameUrdu || null,
                sku: variant.sku || null,
                price: variant.price,
                originalPrice: variant.originalPrice || null,
                costPrice: variant.costPrice || null,
                stockQuantity: variant.stockQuantity,
                stockThreshold: variant.stockThreshold || 10,
                weightGrams: variant.weightGrams || null,
                isDefault: variant.isDefault,
                isActive: variant.isActive,
                sortOrder: variant.sortOrder,
              };

              if (variant.id) {
                // Update existing variant
                await apiClient.patch(`/product-variants/${variant.id}`, variantData);
              } else {
                // Create new variant
                await apiClient.post('/product-variants', {
                  productId: productId,
                  ...variantData,
                });
              }
            }
            
            showToast(`Product and ${variants.length} variant(s) updated successfully!`, 'success');
          } catch (variantError) {
            console.error('Failed to update variants:', variantError);
            showToast('Product updated but some variants failed. Please try again.', 'warning');
          }
        } else {
          showToast('✅ Product updated successfully!', 'success');
        }
        
        router.push('/sellers/products');
      }
    } catch (error: any) {
      console.error('Failed to update product:', error);
      
      if (error.response?.data?.error?.details) {
        const details = error.response.data.error.details;
        const fieldErrors = details.map((d: any) => `${d.field}: ${d.message}`).join(', ');
        showToast(`Validation error: ${fieldErrors}`, 'error');
      } else {
        const errorMsg = error.response?.data?.error?.message || 
                         error.response?.data?.message ||
                         'Failed to update product. Please try again.';
        showToast(errorMsg, 'error');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      return;
    }

    try {
      setSaving(true);
      const response = await apiClient.delete(`/products/${productId}`);
      
      if (response.data.success) {
        showToast('Product deleted successfully', 'success');
        router.push('/sellers/products');
      }
    } catch (error: any) {
      console.error('Failed to delete product:', error);
      showToast(error.response?.data?.error?.message || 'Failed to delete product', 'error');
    } finally {
      setSaving(false);
    }
  };

  const selectedCategoryInfo = getSelectedCategoryInfo();
  const discount = formData.originalPrice && formData.price 
    ? Math.round(((parseFloat(formData.originalPrice) - parseFloat(formData.price)) / parseFloat(formData.originalPrice)) * 100)
    : 0;

  if (!isAuthenticated) return null;

  if (loading) {
    return (
      <DashboardLayout
        title="Edit Product"
        subtitle="Loading..."
        sidebarItems={sidebarItems}
        userType="seller"
      >
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading product...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Edit Product"
      subtitle="Update your product details"
      sidebarItems={sidebarItems}
      userType="seller"
    >
      <div className="max-w-4xl mx-auto">
        <form onSubmit={handleSubmit}>
          {/* Product Status Toggle */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Product Status</h2>
                <p className="text-sm text-gray-500">Control whether this product is visible to customers</p>
              </div>
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                  formData.isActive ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                    formData.isActive ? 'translate-x-7' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <div className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
              formData.isActive 
                ? 'bg-emerald-100 text-emerald-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {formData.isActive ? '● Live - Visible to customers' : '○ Hidden - Not visible to customers'}
            </div>
          </div>

          {/* Product Images */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Product Photos</h2>
            <p className="text-sm text-gray-500 mb-4">Add up to 4 photos. First photo will be the main image.</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Existing & New Images */}
              {images.map((img, index) => (
                <div key={index} className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 group">
                  <img src={img.preview} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                  {img.isPrimary && (
                    <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                      Main
                    </div>
                  )}
                  {img.isExisting && (
                    <div className="absolute bottom-2 left-2 bg-gray-800 text-white text-xs px-2 py-1 rounded-full opacity-75">
                      Existing
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeImage(index)}
                    className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              
              {/* Upload Button */}
              {images.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 transition-all flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-blue-500"
                >
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span className="text-xs font-medium">Add Photo</span>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Product Details</h2>
            
            {/* Product Name */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Chicken Samosa (Pack of 12)"
                className="w-full px-4 py-3 text-lg border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Urdu Name (Optional) */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name in Urdu <span className="text-gray-400 font-normal">(اختیاری)</span>
              </label>
              <input
                type="text"
                value={formData.nameUrdu}
                onChange={(e) => setFormData({ ...formData, nameUrdu: e.target.value })}
                placeholder="مثال: چکن سموسہ (12 کا پیک)"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                dir="rtl"
              />
            </div>

            {/* Category Selection - Three Step Flow */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Category <span className="text-red-500">*</span>
              </label>
              
              {/* Step 1: Product Type Selection */}
              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">1</span>
                  Select product type:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {productTypeOptions.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => {
                        if (formData.productType !== type.value) {
                          setFormData({ ...formData, productType: type.value as typeof formData.productType, categoryId: '' });
                          setSelectedParentId(null);
                        }
                      }}
                      className={`p-3 rounded-xl text-left transition-all ${
                        formData.productType === type.value
                          ? 'bg-blue-50 border-2 border-blue-500 shadow-md'
                          : 'bg-gray-50 border-2 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{type.icon}</span>
                        <span className="font-semibold text-gray-900 text-sm">{type.label}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{type.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: Parent Categories - Only show if product type is selected */}
              {formData.productType && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                    <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">2</span>
                    Select category:
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                    {getCategoriesForSelectedType().map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          setSelectedParentId(cat.id);
                          // If no children, select this category directly
                          if (!cat.children || cat.children.length === 0) {
                            setFormData({ ...formData, categoryId: cat.id });
                          } else {
                            // Clear category selection when switching parents
                            setFormData({ ...formData, categoryId: '' });
                          }
                        }}
                        className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                          selectedParentId === cat.id
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-200'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span>{cat.iconUrl || '📦'}</span>
                        <span>{cat.name}</span>
                        {cat.children && cat.children.length > 0 && (
                          <span className="text-xs opacity-70 ml-1">({cat.children.length})</span>
                        )}
                      </button>
                    ))}
                    {getCategoriesForSelectedType().length === 0 && (
                      <p className="text-sm text-gray-400 italic">No categories available for this product type</p>
                    )}
                  </div>
                </div>
              )}

              {/* Step 3: Subcategories (if parent has children) */}
              {selectedParentId && (() => {
                const parentCat = getSelectedParentCategory();
                if (parentCat?.children && parentCat.children.length > 0) {
                  return (
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 mb-3">
                      <p className="text-xs text-gray-500 mb-3 flex items-center gap-1">
                        <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">3</span>
                        Select subcategory in <span className="font-semibold">{parentCat.name}</span>:
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {parentCat.children.map((subCat) => (
                          <button
                            key={subCat.id}
                            type="button"
                            onClick={() => setFormData({ ...formData, categoryId: subCat.id })}
                            className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                              formData.categoryId === subCat.id
                                ? 'bg-emerald-500 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                            }`}
                          >
                            <span>{subCat.iconUrl || '•'}</span>
                            <span>{subCat.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Selected Category Display */}
              {selectedCategoryInfo && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>
                    ✅ Selected: {productTypeOptions.find(t => t.value === formData.productType)?.icon}{' '}
                    {productTypeOptions.find(t => t.value === formData.productType)?.label}
                    {selectedCategoryInfo.parent ? ` → ${selectedCategoryInfo.parent.name}` : ''}
                    {' → '}{selectedCategoryInfo.category.name}
                  </span>
                </div>
              )}
            </div>

            {/* Shelf Life & Preparation Time - Show based on product type */}
            {formData.productType && formData.productType !== 'frozen' && (
              <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <h3 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <span>⏰</span> Freshness & Timing
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Shelf Life (hours)
                    </label>
                    <input
                      type="number"
                      value={formData.shelfLifeHours}
                      onChange={(e) => setFormData({ ...formData, shelfLifeHours: e.target.value })}
                      placeholder="e.g., 24"
                      min="1"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">How long stays fresh</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Prep Time (minutes)
                    </label>
                    <input
                      type="number"
                      value={formData.preparationTime}
                      onChange={(e) => setFormData({ ...formData, preparationTime: e.target.value })}
                      placeholder="e.g., 30"
                      min="1"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-transparent text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Time to prepare order</p>
                  </div>
                </div>
              </div>
            )}

            {/* Description */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe your product - taste, ingredients, serving suggestions..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              />
            </div>

            {/* Ingredients */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Ingredients <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={formData.ingredients}
                onChange={(e) => setFormData({ ...formData, ingredients: e.target.value })}
                placeholder="e.g., Chicken, flour, onions, spices, oil"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Halal Badge */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFormData({ ...formData, isHalal: !formData.isHalal })}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
                  formData.isHalal
                    ? 'bg-green-100 text-green-700 border-2 border-green-300'
                    : 'bg-gray-100 text-gray-500 border-2 border-transparent'
                }`}
              >
                {formData.isHalal ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-5 h-5 rounded border-2 border-gray-300" />
                )}
                <span className="font-medium">Halal Certified</span>
                <span className="text-lg">☪️</span>
              </button>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Pricing & Stock</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Selling Price */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Selling Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold">Rs.</span>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full pl-14 pr-4 py-3 text-xl font-bold border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Original Price (for discount) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Original Price <span className="text-gray-400 font-normal">(if discounted)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">Rs.</span>
                  <input
                    type="number"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                    placeholder="0"
                    min="0"
                    className="w-full pl-14 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {discount > 0 && (
                  <p className="text-green-600 text-sm mt-1 font-medium">
                    🎉 {discount}% OFF
                  </p>
                )}
              </div>

              {/* Cost Price - For seller's profit tracking */}
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Cost Price <span className="text-gray-400 font-normal">(for profit tracking - not shown to customers)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">Rs.</span>
                  <input
                    type="number"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: e.target.value })}
                    placeholder="What it costs you to make/buy"
                    min="0"
                    className="w-full pl-14 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">Include ingredients, packaging, labor costs</p>
              </div>

              {/* Unit Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Price is for
                </label>
                <select
                  value={formData.unit}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, unit: value });
                    if (value !== 'other') {
                      setCustomUnit('');
                    }
                  }}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                >
                  {unitOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} ({opt.example})
                    </option>
                  ))}
                </select>
                {formData.unit === 'other' && (
                  <input
                    type="text"
                    value={customUnit}
                    onChange={(e) => setCustomUnit(e.target.value)}
                    placeholder="e.g., per dozen, per box, per tray"
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-2"
                  />
                )}
              </div>

              {/* Stock Quantity */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stock Quantity
                </label>
                <input
                  type="number"
                  value={formData.stockQuantity}
                  onChange={(e) => setFormData({ ...formData, stockQuantity: e.target.value })}
                  placeholder="50"
                  min="0"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Product Variants Section */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-200 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <span>📦</span> Product Variants
                    {variants.length > 0 && (
                      <span className="bg-purple-500 text-white px-2 py-0.5 rounded-full text-xs">
                        {variants.length}
                      </span>
                    )}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Manage different sizes, packs, or options
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowVariants(!showVariants)}
                  className="text-purple-600 hover:text-purple-700 font-medium text-sm"
                >
                  {showVariants ? '− Hide' : '+ Manage Variants'}
                </button>
              </div>

              {showVariants && (
                <div className="space-y-4">
                  {/* Variant list */}
                  {variants.map((variant, index) => (
                    <div key={variant.id || index} className="bg-white rounded-xl p-4 border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">
                          {variant.id ? `Variant ${index + 1}` : `New Variant ${index + 1}`}
                          {variant.isDefault && (
                            <span className="ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                              Default
                            </span>
                          )}
                        </h4>
                        <div className="flex gap-2">
                          {!variant.isDefault && (
                            <button
                              type="button"
                              onClick={() => setVariantAsDefault(index)}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Set as Default
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeVariant(index)}
                            className="text-red-500 hover:text-red-700"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Variant Name *
                          </label>
                          <input
                            type="text"
                            value={variant.name}
                            onChange={(e) => updateVariant(index, 'name', e.target.value)}
                            placeholder="e.g., Small Pack (6 pieces)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Variant Name (Urdu)
                          </label>
                          <input
                            type="text"
                            value={variant.nameUrdu || ''}
                            onChange={(e) => updateVariant(index, 'nameUrdu', e.target.value)}
                            placeholder="چھوٹا پیک (6 عدد)"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-right focus:ring-2 focus:ring-purple-500"
                            dir="rtl"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Price *
                          </label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                              Rs.
                            </span>
                            <input
                              type="number"
                              value={variant.price || ''}
                              onChange={(e) => updateVariant(index, 'price', parseFloat(e.target.value) || 0)}
                              placeholder="300"
                              min="0"
                              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Original Price
                          </label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                              Rs.
                            </span>
                            <input
                              type="number"
                              value={variant.originalPrice || ''}
                              onChange={(e) => updateVariant(index, 'originalPrice', parseFloat(e.target.value) || undefined)}
                              placeholder="350"
                              min="0"
                              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Your Cost
                          </label>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                              Rs.
                            </span>
                            <input
                              type="number"
                              value={variant.costPrice || ''}
                              onChange={(e) => updateVariant(index, 'costPrice', parseFloat(e.target.value) || undefined)}
                              placeholder="180"
                              min="0"
                              className="w-full pl-10 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Stock Quantity *
                          </label>
                          <input
                            type="number"
                            value={variant.stockQuantity || ''}
                            onChange={(e) => updateVariant(index, 'stockQuantity', parseInt(e.target.value) || 0)}
                            placeholder="50"
                            min="0"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Low Stock Alert At
                          </label>
                          <input
                            type="number"
                            value={variant.stockThreshold || ''}
                            onChange={(e) => updateVariant(index, 'stockThreshold', parseInt(e.target.value) || undefined)}
                            placeholder="10"
                            min="0"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                          />
                        </div>

                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            SKU / Barcode (Optional)
                          </label>
                          <input
                            type="text"
                            value={variant.sku || ''}
                            onChange={(e) => updateVariant(index, 'sku', e.target.value)}
                            placeholder="SM-SAMOSA-6PC"
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                          />
                        </div>

                        {variant.price && variant.costPrice && (
                          <div className="col-span-2 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                            <div className="flex justify-between text-xs">
                              <span className="text-gray-600">Profit per unit:</span>
                              <span className="font-bold text-emerald-700">
                                Rs {(variant.price - variant.costPrice - (variant.price * 0.15)).toFixed(0)}
                                <span className="ml-1 text-gray-500">
                                  ({(((variant.price - variant.costPrice - (variant.price * 0.15)) / variant.price) * 100).toFixed(1)}%)
                                </span>
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={addVariant}
                    disabled={variants.length >= 20}
                    className="w-full py-3 border-2 border-dashed border-purple-300 rounded-xl text-purple-600 hover:bg-purple-50 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="text-xl">+</span> Add Another Variant {variants.length > 0 && `(${variants.length}/20)`}
                  </button>

                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <p className="text-xs font-medium text-blue-800 mb-1">💡 Pro Tips:</p>
                    <ul className="text-xs text-blue-700 space-y-0.5">
                      <li>• Changes are saved when you click "Update Product"</li>
                      <li>• Deleted variants will be permanently removed</li>
                      <li>• Set low stock alerts to avoid running out</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Stock Type */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fulfillment Method
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: 'direct', label: 'Direct Delivery', icon: '🚗', desc: 'You deliver to customers' },
                  { value: 'hub', label: 'Via Hub', icon: '🏪', desc: 'Hub handles delivery' },
                  { value: 'both', label: 'Both', icon: '🔄', desc: 'Either method' },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({ ...formData, stockType: option.value as 'direct' | 'hub' | 'both' })}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      formData.stockType === option.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="text-xl">{option.icon}</span>
                    <p className="font-medium text-sm text-gray-900 mt-1">{option.label}</p>
                    <p className="text-xs text-gray-500">{option.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Price Preview */}
            {formData.price && (
              <div className="mt-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                <p className="text-sm text-gray-500 mb-1">Customers will see:</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold text-gray-900">Rs. {formData.price}</span>
                  {formData.originalPrice && parseFloat(formData.originalPrice) > parseFloat(formData.price) && (
                    <>
                      <span className="text-lg text-gray-400 line-through">Rs. {formData.originalPrice}</span>
                      <span className="bg-green-500 text-white px-2 py-0.5 rounded-full text-sm font-bold">
                        {discount}% OFF
                      </span>
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  {unitOptions.find(u => u.value === formData.unit)?.label}
                </p>
              </div>
            )}

            {/* Profit Calculator - Only visible to seller */}
            {formData.price && formData.costPrice && parseFloat(formData.costPrice) > 0 && (
              <div className="mt-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-lg">💰</span>
                  <p className="text-sm font-semibold text-emerald-800">Your Profit Breakdown (Private)</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Selling Price</span>
                    <span className="font-medium">Rs. {formData.price}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Your Cost</span>
                    <span className="font-medium text-red-600">- Rs. {formData.costPrice}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Platform Fee (15%)</span>
                    <span className="font-medium text-red-600">- Rs. {(parseFloat(formData.price) * 0.15).toFixed(0)}</span>
                  </div>
                  <div className="border-t border-emerald-200 pt-2 mt-2">
                    <div className="flex justify-between">
                      <span className="font-semibold text-emerald-800">Your Profit</span>
                      <span className={`font-bold text-lg ${
                        (parseFloat(formData.price) - parseFloat(formData.costPrice) - (parseFloat(formData.price) * 0.15)) > 0
                          ? 'text-emerald-600' 
                          : 'text-red-600'
                      }`}>
                        Rs. {(parseFloat(formData.price) - parseFloat(formData.costPrice) - (parseFloat(formData.price) * 0.15)).toFixed(0)}
                      </span>
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-500">Profit Margin</span>
                      <span className={`text-sm font-semibold ${
                        ((parseFloat(formData.price) - parseFloat(formData.costPrice) - (parseFloat(formData.price) * 0.15)) / parseFloat(formData.price) * 100) > 20
                          ? 'text-emerald-600' 
                          : ((parseFloat(formData.price) - parseFloat(formData.costPrice) - (parseFloat(formData.price) * 0.15)) / parseFloat(formData.price) * 100) > 10
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}>
                        {((parseFloat(formData.price) - parseFloat(formData.costPrice) - (parseFloat(formData.price) * 0.15)) / parseFloat(formData.price) * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              type="submit"
              disabled={saving}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-semibold text-lg shadow-lg shadow-blue-200"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              ) : (
                <>
                  <span className="mr-2">💾</span>
                  Save Changes
                </>
              )}
            </Button>
            
            <Link href="/sellers/products" className="sm:w-auto">
              <Button
                type="button"
                variant="outline"
                className="w-full py-4 rounded-xl"
              >
                Cancel
              </Button>
            </Link>
          </div>

          {/* Danger Zone */}
          <div className="mt-8 border border-red-200 rounded-2xl p-6 bg-red-50">
            <h3 className="font-bold text-red-700 mb-2">Danger Zone</h3>
            <p className="text-sm text-red-600 mb-4">
              Once you delete a product, there is no going back. Please be certain.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={handleDelete}
              disabled={saving}
              className="border-red-300 text-red-600 hover:bg-red-100"
            >
              🗑️ Delete Product
            </Button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
