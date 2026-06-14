'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import {
  Snowflake,
  Leaf,
  UtensilsCrossed,
  CookingPot,
  FolderPlus,
  FolderOpen,
  Lightbulb,
  Dot,
  X,
  type LucideIcon,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
}

interface GroupedCategories {
  frozen: Category[];
  fresh: Category[];
  ready_to_eat: Category[];
  ready_to_cook: Category[];
}

interface CategoryRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedProductType?: string;
  onSuccess?: () => void;
}

const productTypeOptions: { value: string; label: string; icon: LucideIcon; color: string }[] = [
  { value: 'frozen', label: 'Frozen', icon: Snowflake, color: 'blue' },
  { value: 'fresh', label: 'Fresh', icon: Leaf, color: 'green' },
  { value: 'ready_to_eat', label: 'Ready to Eat', icon: UtensilsCrossed, color: 'orange' },
  { value: 'ready_to_cook', label: 'Ready to Cook', icon: CookingPot, color: 'purple' },
];

export function CategoryRequestModal({
  isOpen,
  onClose,
  preselectedProductType,
  onSuccess,
}: CategoryRequestModalProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [groupedCategories, setGroupedCategories] = useState<GroupedCategories>({
    frozen: [],
    fresh: [],
    ready_to_eat: [],
    ready_to_cook: [],
  });
  const [productType, setProductType] = useState(preselectedProductType || '');
  const [requestType, setRequestType] = useState<'category' | 'subcategory'>('category');
  const [formData, setFormData] = useState({
    name: '',
    nameUrdu: '',
    description: '',
    parentCategoryId: '',
  });

  // Load categories when modal opens
  useEffect(() => {
    if (isOpen) {
      loadCategories();
      if (preselectedProductType) {
        setProductType(preselectedProductType);
      }
    }
  }, [isOpen, preselectedProductType]);

  const loadCategories = async () => {
    setLoadingCategories(true);
    try {
      const response = await apiClient.get('/categories/grouped');
      if (response.data.success && response.data.data) {
        setGroupedCategories(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoadingCategories(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!productType) {
      showToast('Please select a product type', 'error');
      return;
    }

    if (!formData.name.trim()) {
      showToast('Please enter a category name', 'error');
      return;
    }

    if (requestType === 'subcategory' && !formData.parentCategoryId) {
      showToast('Please select a parent category', 'error');
      return;
    }

    setLoading(true);
    try {
      await apiClient.post('/category-requests', {
        productType,
        suggestedName: formData.name.trim(),
        suggestedNameUrdu: formData.nameUrdu.trim() || undefined,
        description: formData.description.trim() || undefined,
        parentCategoryId: requestType === 'subcategory' ? formData.parentCategoryId : undefined,
      });

      showToast('Category request submitted! Admin will review it shortly.', 'success');
      resetForm();
      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Category request error:', error);
      console.error('Response:', error.response);
      console.error('Status:', error.response?.status);
      const message = error.response?.data?.error?.message || 'Failed to submit request';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', nameUrdu: '', description: '', parentCategoryId: '' });
    setRequestType('category');
    if (!preselectedProductType) {
      setProductType('');
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  const parentCategories = productType 
    ? groupedCategories[productType as keyof GroupedCategories] || []
    : [];

  const selectedTypeInfo = productTypeOptions.find(t => t.value === productType);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Request New Category</h2>
              <p className="text-sm text-gray-500 mt-1">
                Suggest a category that's missing from our list
              </p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Product Type Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Product Type <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {productTypeOptions.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setProductType(type.value);
                    setFormData({ ...formData, parentCategoryId: '' });
                  }}
                  className={`px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                    productType === type.value
                      ? 'ring-2 ring-offset-1 ring-blue-200'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                  style={productType === type.value ? { 
                    backgroundColor: type.color === 'blue' ? '#EFF6FF' : 
                                    type.color === 'green' ? '#F0FDF4' :
                                    type.color === 'orange' ? '#FFF7ED' : '#FAF5FF',
                    borderColor: type.color === 'blue' ? '#3B82F6' :
                                type.color === 'green' ? '#22C55E' :
                                type.color === 'orange' ? '#F97316' : '#A855F7'
                  } : {}}
                >
                  <div className="flex items-center justify-center gap-2">
                    <type.icon className="w-5 h-5" />
                    <span>{type.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Request Type Toggle */}
          {productType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                What would you like to add?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRequestType('category');
                    setFormData({ ...formData, parentCategoryId: '' });
                  }}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                    requestType === 'category'
                      ? 'bg-blue-50 border-blue-500 text-blue-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FolderPlus className="w-5 h-5" />
                    <span>New Category</span>
                  </div>
                  <p className="text-xs mt-1 opacity-70">Main category</p>
                </button>
                <button
                  type="button"
                  onClick={() => setRequestType('subcategory')}
                  className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-all border-2 ${
                    requestType === 'subcategory'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <FolderOpen className="w-5 h-5" />
                    <span>Subcategory</span>
                  </div>
                  <p className="text-xs mt-1 opacity-70">Under existing</p>
                </button>
              </div>
            </div>
          )}

          {/* Parent Category (for subcategory) */}
          {productType && requestType === 'subcategory' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Parent Category <span className="text-red-500">*</span>
              </label>
              {loadingCategories ? (
                <div className="px-4 py-3 bg-gray-50 rounded-xl text-gray-500 text-sm">
                  Loading categories...
                </div>
              ) : parentCategories.length > 0 ? (
                <select
                  value={formData.parentCategoryId}
                  onChange={(e) => setFormData({ ...formData, parentCategoryId: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">Select parent category...</option>
                  {parentCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} {cat.nameUrdu ? `(${cat.nameUrdu})` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="px-4 py-3 bg-amber-50 rounded-xl text-amber-700 text-sm">
                  No categories available for {selectedTypeInfo?.label}. Request a new main category instead.
                </div>
              )}
            </div>
          )}

          {/* Category Name */}
          {productType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {requestType === 'category' ? 'Category' : 'Subcategory'} Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={requestType === 'category' ? "e.g., Frozen Biryani" : "e.g., Chicken Biryani"}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                maxLength={100}
              />
            </div>
          )}

          {/* Urdu Name */}
          {productType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name in Urdu <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={formData.nameUrdu}
                onChange={(e) => setFormData({ ...formData, nameUrdu: e.target.value })}
                placeholder="مثال: منجمد بریانی"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                dir="rtl"
                maxLength={100}
              />
            </div>
          )}

          {/* Description */}
          {productType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description <span className="text-gray-400 font-normal">(Optional)</span>
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the category and what products would go here..."
                rows={3}
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                maxLength={500}
              />
            </div>
          )}

          {/* Info Box */}
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="flex gap-3">
              <Lightbulb className="w-5 h-5 text-blue-500 shrink-0" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">What happens next?</p>
                <ul className="space-y-1 text-blue-600">
                  <li className="flex items-center gap-1"><Dot className="w-4 h-4 shrink-0" /> Admin will review your request</li>
                  <li className="flex items-center gap-1"><Dot className="w-4 h-4 shrink-0" /> You'll be notified when approved</li>
                  <li className="flex items-center gap-1"><Dot className="w-4 h-4 shrink-0" /> Category will appear in your product form</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || !productType || !formData.name.trim()}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting...
                </span>
              ) : (
                'Submit Request'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
