'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FolderOpen, CheckCircle2, UtensilsCrossed, BookOpen, Dot } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';

const adminSidebarItems = [
  { name: 'Dashboard', href: '/admin', icon: '📊' },
  { name: 'Users', href: '/admin/users', icon: '👥' },
  { name: 'Sellers', href: '/admin/sellers', icon: '🏪' },
  { name: 'Categories', href: '/admin/categories', icon: '📁' },
  { name: 'Products', href: '/admin/products', icon: '🍽️' },
  { name: 'Orders', href: '/admin/orders', icon: '📦' },
  { name: 'Hubs', href: '/admin/hubs', icon: '🏭' },
  { name: 'Reports', href: '/admin/reports', icon: '📈' },
  { name: 'Settings', href: '/admin/settings', icon: '⚙️' },
];

// Icons
const Icons = {
  plus: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  ),
  folder: (
    <svg className="w-16 h-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  ),
  edit: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  trash: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  ),
  chevronDown: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  ),
};

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  parentId?: string;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  children?: Category[];
}

// Create/Edit Category Modal
interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
  category?: Category | null;
  parentCategories: Category[];
}

function CategoryModal({ isOpen, onClose, onSubmit, category, parentCategories }: CategoryModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    nameUrdu: '',
    description: '',
    iconUrl: '',
    parentId: '',
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name || '',
        nameUrdu: category.nameUrdu || '',
        description: category.description || '',
        iconUrl: category.iconUrl || '',
        parentId: category.parentId || '',
        sortOrder: category.sortOrder || 0,
        isActive: category.isActive ?? true,
      });
    } else {
      setFormData({
        name: '',
        nameUrdu: '',
        description: '',
        iconUrl: '',
        parentId: '',
        sortOrder: 0,
        isActive: true,
      });
    }
  }, [category, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      parentId: formData.parentId || undefined,
    });
  };

  // Predefined icons for frozen food categories
  const categoryIcons = [
    { name: 'Parathas', icon: '🫓', url: '/icons/paratha.png' },
    { name: 'Samosas', icon: '🥟', url: '/icons/samosa.png' },
    { name: 'Rolls', icon: '🌯', url: '/icons/roll.png' },
    { name: 'Kebabs', icon: '🍢', url: '/icons/kebab.png' },
    { name: 'Meals', icon: '🍱', url: '/icons/meal.png' },
    { name: 'Desserts', icon: '🍨', url: '/icons/dessert.png' },
    { name: 'Snacks', icon: '🍿', url: '/icons/snacks.png' },
    { name: 'Drinks', icon: '🥤', url: '/icons/drinks.png' },
    { name: 'Biryani', icon: '🍚', url: '/icons/biryani.png' },
    { name: 'Naan', icon: '🍞', url: '/icons/naan.png' },
    { name: 'Pizza', icon: '🍕', url: '/icons/pizza.png' },
    { name: 'Chicken', icon: '🍗', url: '/icons/chicken.png' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">
              {category ? 'Edit Category' : 'Create New Category'}
            </h2>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Category Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name (English) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Frozen Parathas"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Name (Urdu)
              </label>
              <input
                type="text"
                value={formData.nameUrdu}
                onChange={(e) => setFormData({ ...formData, nameUrdu: e.target.value })}
                placeholder="منجمد پراٹھے"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-right"
                dir="rtl"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Brief description of this category..."
              rows={2}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Icon Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Category Icon
            </label>
            <div className="grid grid-cols-6 gap-2">
              {categoryIcons.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => setFormData({ ...formData, iconUrl: item.icon })}
                  className={`p-3 rounded-xl text-2xl transition-all ${
                    formData.iconUrl === item.icon
                      ? 'bg-blue-100 ring-2 ring-blue-500'
                      : 'bg-gray-50 hover:bg-gray-100'
                  }`}
                  title={item.name}
                >
                  {item.icon}
                </button>
              ))}
            </div>
          </div>

          {/* Parent Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Parent Category
              <span className="text-gray-400 font-normal ml-2">(for subcategories)</span>
            </label>
            <select
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="">None (Top-level category)</option>
              {parentCategories
                .filter(c => c.id !== category?.id)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Sort Order & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sort Order
              </label>
              <input
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                min="0"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1">Lower numbers appear first</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Status
              </label>
              <div className="flex gap-3 mt-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="isActive"
                    checked={formData.isActive}
                    onChange={() => setFormData({ ...formData, isActive: true })}
                    className="w-4 h-4 text-blue-500"
                  />
                  <span className="text-sm">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="isActive"
                    checked={!formData.isActive}
                    onChange={() => setFormData({ ...formData, isActive: false })}
                    className="w-4 h-4 text-blue-500"
                  />
                  <span className="text-sm">Inactive</span>
                </label>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 py-3"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 text-white"
            >
              {category ? 'Update Category' : 'Create Category'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Category Tree Item Component
function CategoryTreeItem({
  category,
  onEdit,
  onDelete,
  level = 0,
}: {
  category: Category;
  onEdit: (cat: Category) => void;
  onDelete: (id: string) => void;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;

  return (
    <div className={level > 0 ? 'ml-8 border-l-2 border-gray-100' : ''}>
      <div className={`flex items-center gap-4 p-4 bg-white rounded-xl border border-gray-100 hover:shadow-md transition-all ${level > 0 ? 'ml-4' : ''}`}>
        {/* Expand/Collapse */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`p-1 rounded hover:bg-gray-100 transition-colors ${!hasChildren && 'invisible'}`}
        >
          {isExpanded ? Icons.chevronDown : Icons.chevronRight}
        </button>

        {/* Icon */}
        <div className="w-12 h-12 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl flex items-center justify-center text-2xl">
          {category.iconUrl || '📁'}
        </div>

        {/* Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{category.name}</h3>
            {category.nameUrdu && (
              <span className="text-sm text-gray-400">({category.nameUrdu})</span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              category.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              {category.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500 mt-1">
            <span className="bg-gray-100 px-2 py-0.5 rounded text-xs font-mono">
              {category.slug}
            </span>
            <span>{category.productCount || 0} products</span>
            {hasChildren && (
              <span>{category.children?.length} subcategories</span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(category)}
            className="flex items-center gap-1"
          >
            {Icons.edit}
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(category.id)}
            className="text-red-500 border-red-200 hover:bg-red-50 flex items-center gap-1"
          >
            {Icons.trash}
          </Button>
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {category.children?.map((child) => (
            <CategoryTreeItem
              key={child.id}
              category={child}
              onEdit={onEdit}
              onDelete={onDelete}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminCategoriesPage() {
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    if (user?.userType !== 'admin' && user?.user_type !== 'admin') {
      router.push('/dashboard');
      showToast('Access denied. Admin privileges required.', 'error');
      return;
    }

    loadCategories();
  }, [isAuthenticated, user, router]);

  const loadCategories = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/categories?includeInactive=true');
      if (response.data.success) {
        setCategories(response.data.data || []);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
      // Fallback to default categories for demo
      setCategories([
        {
          id: '1',
          name: 'Frozen Parathas',
          nameUrdu: 'منجمد پراٹھے',
          slug: 'frozen-parathas',
          iconUrl: '🫓',
          sortOrder: 1,
          isActive: true,
          productCount: 24,
          children: [
            {
              id: '1-1',
              name: 'Plain Parathas',
              nameUrdu: 'سادہ پراٹھے',
              slug: 'plain-parathas',
              parentId: '1',
              sortOrder: 1,
              isActive: true,
              productCount: 8,
            },
            {
              id: '1-2',
              name: 'Stuffed Parathas',
              nameUrdu: 'بھرے ہوئے پراٹھے',
              slug: 'stuffed-parathas',
              parentId: '1',
              sortOrder: 2,
              isActive: true,
              productCount: 16,
            },
          ],
        },
        {
          id: '2',
          name: 'Frozen Samosas',
          nameUrdu: 'منجمد سموسے',
          slug: 'frozen-samosas',
          iconUrl: '🥟',
          sortOrder: 2,
          isActive: true,
          productCount: 15,
          children: [],
        },
        {
          id: '3',
          name: 'Frozen Rolls',
          nameUrdu: 'منجمد رولز',
          slug: 'frozen-rolls',
          iconUrl: '🌯',
          sortOrder: 3,
          isActive: true,
          productCount: 12,
          children: [],
        },
        {
          id: '4',
          name: 'Kebabs & Tikkas',
          nameUrdu: 'کباب اور ٹکے',
          slug: 'kebabs-tikkas',
          iconUrl: '🍢',
          sortOrder: 4,
          isActive: true,
          productCount: 20,
          children: [],
        },
        {
          id: '5',
          name: 'Ready Meals',
          nameUrdu: 'تیار کھانے',
          slug: 'ready-meals',
          iconUrl: '🍱',
          sortOrder: 5,
          isActive: true,
          productCount: 30,
          children: [],
        },
        {
          id: '6',
          name: 'Frozen Desserts',
          nameUrdu: 'منجمد میٹھے',
          slug: 'frozen-desserts',
          iconUrl: '🍨',
          sortOrder: 6,
          isActive: false,
          productCount: 5,
          children: [],
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Get flat list of categories for parent selection
  const getFlatCategories = (cats: Category[], result: Category[] = []): Category[] => {
    cats.forEach((cat) => {
      result.push(cat);
      if (cat.children) {
        getFlatCategories(cat.children, result);
      }
    });
    return result;
  };

  const handleCreateCategory = async (data: any) => {
    try {
      const response = await apiClient.post('/categories', data);
      if (response.data.success) {
        showToast('Category created successfully!', 'success');
        setShowModal(false);
        loadCategories();
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to create category', 'error');
    }
  };

  const handleUpdateCategory = async (data: any) => {
    if (!editingCategory) return;
    
    try {
      const response = await apiClient.patch(`/categories/${editingCategory.id}`, data);
      if (response.data.success) {
        showToast('Category updated successfully!', 'success');
        setShowModal(false);
        setEditingCategory(null);
        loadCategories();
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to update category', 'error');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category? Products in this category will be moved to "Uncategorized".')) {
      return;
    }
    
    try {
      const response = await apiClient.delete(`/categories/${id}`);
      if (response.data.success) {
        showToast('Category deleted successfully!', 'success');
        loadCategories();
      }
    } catch (error: any) {
      showToast(error.response?.data?.error?.message || 'Failed to delete category', 'error');
    }
  };

  const openEditModal = (category: Category) => {
    setEditingCategory(category);
    setShowModal(true);
  };

  const openCreateModal = () => {
    setEditingCategory(null);
    setShowModal(true);
  };

  if (!isAuthenticated) {
    return null;
  }

  // Stats
  const totalCategories = getFlatCategories(categories).length;
  const activeCategories = getFlatCategories(categories).filter(c => c.isActive).length;
  const totalProducts = getFlatCategories(categories).reduce((acc, c) => acc + (c.productCount || 0), 0);

  return (
    <DashboardLayout
      title="Category Management"
      subtitle="Organize products into categories for easy navigation"
      sidebarItems={adminSidebarItems}
      userType="admin"
    >
      <div className="max-w-6xl mx-auto">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <FolderOpen className="w-8 h-8 text-ink-500" />
              <div>
                <p className="text-sm text-gray-500">Total Categories</p>
                <p className="text-2xl font-bold text-gray-900">{totalCategories}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-forest-500" />
              <div>
                <p className="text-sm text-gray-500">Active Categories</p>
                <p className="text-2xl font-bold text-green-600">{activeCategories}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-3">
              <UtensilsCrossed className="w-8 h-8 text-ink-500" />
              <div>
                <p className="text-sm text-gray-500">Total Products</p>
                <p className="text-2xl font-bold text-blue-600">{totalProducts}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">All Categories</h2>
            <p className="text-sm text-gray-500">Manage your product categories and subcategories</p>
          </div>
          <Button 
            onClick={openCreateModal}
            className="bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200 flex items-center gap-2"
          >
            {Icons.plus}
            Add Category
          </Button>
        </div>

        {/* Categories List */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading categories...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
              {Icons.folder}
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No categories yet</h2>
            <p className="text-gray-500 mb-8 max-w-md mx-auto">
              Create categories to organize your products and help customers find what they're looking for.
            </p>
            <Button 
              onClick={openCreateModal}
              className="bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200"
            >
              Create First Category
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((category) => (
              <CategoryTreeItem
                key={category.id}
                category={category}
                onEdit={openEditModal}
                onDelete={handleDeleteCategory}
              />
            ))}
          </div>
        )}

        {/* Info Box */}
        <div className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-ink-900" />
            How Categories Work
          </h3>
          <ul className="text-sm text-gray-600 space-y-2">
            <li className="flex items-start"><Dot className="w-4 h-4 mt-0.5 shrink-0 text-ink-500" /><span><strong>Parent Categories</strong> are top-level groupings (e.g., "Frozen Parathas")</span></li>
            <li className="flex items-start"><Dot className="w-4 h-4 mt-0.5 shrink-0 text-ink-500" /><span><strong>Subcategories</strong> are nested under parent categories (e.g., "Stuffed Parathas" under "Frozen Parathas")</span></li>
            <li className="flex items-start"><Dot className="w-4 h-4 mt-0.5 shrink-0 text-ink-500" /><span><strong>Sort Order</strong> determines display sequence (lower numbers appear first)</span></li>
            <li className="flex items-start"><Dot className="w-4 h-4 mt-0.5 shrink-0 text-ink-500" /><span><strong>Inactive categories</strong> won't show to customers but products remain linked</span></li>
            <li className="flex items-start"><Dot className="w-4 h-4 mt-0.5 shrink-0 text-ink-500" /><span><strong>Slugs</strong> are auto-generated from names for SEO-friendly URLs</span></li>
          </ul>
        </div>
      </div>

      {/* Create/Edit Modal */}
      <CategoryModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCategory(null);
        }}
        onSubmit={editingCategory ? handleUpdateCategory : handleCreateCategory}
        category={editingCategory}
        parentCategories={getFlatCategories(categories).filter(c => !c.parentId)}
      />
    </DashboardLayout>
  );
}
