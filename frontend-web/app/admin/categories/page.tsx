'use client';

import { useState, useEffect, useId } from 'react';
import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus, Trash2, X } from 'lucide-react';
import { DashboardLayout, adminSidebarFor } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { LoadError } from '@/components/ui/LoadError';
import { Figure, LoadingLine, StatusPill } from '@/components/admin/AdminListParts';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient, apiErrorMessage } from '@/lib/api-client';
import { useShallow } from 'zustand/react/shallow';

interface Category {
  id: string;
  name: string;
  nameUrdu?: string;
  slug: string;
  description?: string;
  iconUrl?: string;
  parentId?: string;
  /** Which kind of dish it holds: kitchens find a category through the kind of dish they are adding. */
  productType?: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
  children?: Category[];
}

interface CategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CategoryPayload) => void;
  category?: Category | null;
  parentCategories: Category[];
}

const BLANK_CATEGORY_FORM = {
  name: '',
  nameUrdu: '',
  description: '',
  iconUrl: '',
  parentId: '',
  productType: '',
  sortOrder: 0,
  isActive: true,
};

/** What the form sends: an empty parent or product type is left out. */
type CategoryPayload = Omit<typeof BLANK_CATEGORY_FORM, 'parentId' | 'productType'> & { parentId?: string; productType?: string };

const FIELD_LABEL = 'block text-sm font-medium text-ink mb-1.5';
const HINT = 'mt-1 text-xs text-muted';

function categoryFormFor(category?: Category | null) {
  if (!category) return BLANK_CATEGORY_FORM;
  return {
    name: category.name || '',
    nameUrdu: category.nameUrdu || '',
    description: category.description || '',
    iconUrl: category.iconUrl || '',
    parentId: category.parentId || '',
    productType: category.productType || '',
    sortOrder: category.sortOrder || 0,
    isActive: category.isActive ?? true,
  };
}

/** Mounted only while open, so every opening starts from the category being edited (or a blank form). */
function CategoryModal(props: CategoryModalProps) {
  return props.isOpen ? <CategoryForm key={props.category?.id ?? 'new'} {...props} /> : null;
}

function CategoryForm({ onClose, onSubmit, category, parentCategories }: CategoryModalProps) {
  const [formData, setFormData] = useState(() => categoryFormFor(category));
  const id = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      parentId: formData.parentId || undefined,
      productType: formData.productType || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-surface sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-6">
          <h2 id={`${id}-title`} className="text-lg font-semibold text-ink">
            {category ? 'Edit category' : 'New category'}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-11 w-11 place-items-center rounded-full text-muted hover:bg-raised">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-name`} className={FIELD_LABEL}>
                Name in English <span className="text-red-700">*</span>
              </label>
              <input
                id={`${id}-name`}
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Parathas"
                className="nuray-input"
                required
              />
            </div>
            <div>
              <label htmlFor={`${id}-name-ur`} className={FIELD_LABEL}>
                Name in Urdu
              </label>
              <input
                id={`${id}-name-ur`}
                type="text"
                value={formData.nameUrdu}
                onChange={(e) => setFormData({ ...formData, nameUrdu: e.target.value })}
                placeholder="پراٹھے"
                className="nuray-input text-end"
                dir="rtl"
              />
            </div>
          </div>

          <div>
            <label htmlFor={`${id}-description`} className={FIELD_LABEL}>
              Description
            </label>
            <textarea
              id={`${id}-description`}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="A line on what belongs here"
              rows={2}
              className="nuray-input h-auto resize-none py-3"
            />
          </div>

          <div>
            <label htmlFor={`${id}-parent`} className={FIELD_LABEL}>
              Parent category
            </label>
            <select
              id={`${id}-parent`}
              value={formData.parentId}
              onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
              className="nuray-input"
            >
              <option value="">None, a top-level category</option>
              {parentCategories
                .filter((c) => c.id !== category?.id)
                .map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
            </select>
            <p className={HINT}>Choose one to make this a subcategory.</p>
          </div>

          <div>
            <label htmlFor={`${id}-type`} className={FIELD_LABEL}>
              Kind of dish {!formData.parentId && <span className="text-red-700">*</span>}
            </label>
            <select
              id={`${id}-type`}
              value={formData.productType}
              onChange={(e) => setFormData({ ...formData, productType: e.target.value })}
              required={!formData.parentId}
              className="nuray-input"
            >
              <option value="">{formData.parentId ? 'Same as the parent category' : 'Choose…'}</option>
              <option value="fresh">Fresh (cooked to order)</option>
              <option value="ready_to_eat">Ready to eat</option>
              <option value="ready_to_cook">Ready to cook</option>
              <option value="frozen">Frozen</option>
            </select>
            <p className={HINT}>Kitchens pick a category through the kind of dish they are adding.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-sort`} className={FIELD_LABEL}>
                Sort order
              </label>
              <input
                id={`${id}-sort`}
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                min="0"
                className="nuray-input"
              />
              <p className={HINT}>Lower numbers come first.</p>
            </div>
            <fieldset>
              <legend className={FIELD_LABEL}>Shown to customers</legend>
              <div className="flex gap-4">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name={`${id}-active`}
                    checked={formData.isActive}
                    onChange={() => setFormData({ ...formData, isActive: true })}
                    className="h-4 w-4 accent-brand"
                  />
                  Active
                </label>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-ink">
                  <input
                    type="radio"
                    name={`${id}-active`}
                    checked={!formData.isActive}
                    onChange={() => setFormData({ ...formData, isActive: false })}
                    className="h-4 w-4 accent-brand"
                  />
                  Inactive
                </label>
              </div>
            </fieldset>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              {category ? 'Save changes' : 'Add category'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CategoryTreeItem({
  category,
  onEdit,
  onDelete,
  level = 0,
}: {
  category: Category;
  onEdit: (cat: Category) => void;
  onDelete: (cat: Category) => void;
  level?: number;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const children = category.children ?? [];
  const hasChildren = children.length > 0;
  const productCount = category.productCount || 0;

  return (
    <li className={level > 0 ? 'ms-4 border-s-2 border-line ps-3 sm:ms-8' : ''}>
      <div className="flex items-start gap-2 rounded-2xl border border-line bg-surface p-3 sm:items-center sm:gap-3 sm:p-4">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Hide' : 'Show'} subcategories of ${category.name}`}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted hover:bg-raised"
          >
            {isExpanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4 rtl:rotate-180" />}
          </button>
        ) : (
          <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 sm:block" />
        )}

        <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-3">
          <div className="min-w-0 flex-1 py-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h3 className="font-semibold text-ink">{category.name}</h3>
              {category.nameUrdu && (
                <span className="text-sm text-muted" dir="rtl">
                  {category.nameUrdu}
                </span>
              )}
              <StatusPill tone={category.isActive ? 'good' : 'neutral'}>{category.isActive ? 'Active' : 'Inactive'}</StatusPill>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span className="rounded bg-raised px-1.5 py-0.5 font-mono">{category.slug}</span>
              <span>
                {productCount} {productCount === 1 ? 'dish' : 'dishes'}
              </span>
              {hasChildren && (
                <span>
                  {children.length} {children.length === 1 ? 'subcategory' : 'subcategories'}
                </span>
              )}
            </p>
          </div>

          <div className="mt-2 flex gap-2 sm:mt-0">
            <Button variant="outline" onClick={() => onEdit(category)} className="px-4">
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Edit
            </Button>
            <Button
              variant="outline"
              onClick={() => onDelete(category)}
              aria-label={`Delete ${category.name}`}
              className="w-11 border-red-200 px-0 text-red-700 hover:bg-red-50"
            >
              <Trash2 aria-hidden="true" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-2 space-y-2">
          {children.map((child) => (
            <CategoryTreeItem key={child.id} category={child} onEdit={onEdit} onDelete={onDelete} level={level + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function flatten(cats: Category[], result: Category[] = []): Category[] {
  cats.forEach((cat) => {
    result.push(cat);
    if (cat.children) flatten(cat.children, result);
  });
  return result;
}

export default function AdminCategoriesPage() {
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  // Why the categories could not be read; shown with a retry instead of an empty list.
  const [loadError, setLoadError] = useState<unknown>(null);
  const { confirm: confirmDialog } = useDialogs();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);

  const loadCategories = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const response = await apiClient.get('/categories?includeInactive=true');
      if (response.data.success) {
        setCategories(response.data.data || []);
      }
    } catch (error) {
      // Never made-up categories: an administrator who edits or deletes one of them would be changing nothing real.
      setLoadError(error);
    } finally {
      setLoading(false);
    }
  };

  // The admin layout's RoleGuard sends signed-out and non-admin visitors away.
  useEffect(() => {
    if (isAuthenticated) loadCategories();
  }, [isAuthenticated]);

  const handleCreateCategory = async (data: CategoryPayload) => {
    try {
      const response = await apiClient.post('/categories', data);
      if (response.data.success) {
        showToast('Category added', 'success');
        setShowModal(false);
        loadCategories();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not add the category'), 'error');
    }
  };

  const handleUpdateCategory = async (data: CategoryPayload) => {
    if (!editingCategory) return;

    try {
      const response = await apiClient.patch(`/categories/${editingCategory.id}`, data);
      if (response.data.success) {
        showToast('Category saved', 'success');
        setShowModal(false);
        setEditingCategory(null);
        loadCategories();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save the category'), 'error');
    }
  };

  const handleDeleteCategory = async (category: Category) => {
    if (
      !(await confirmDialog({
        title: `Delete ${category.name}?`,
        message: 'Dishes in this category are moved to "Uncategorized".',
        confirmText: 'Delete',
      }))
    ) {
      return;
    }

    try {
      const response = await apiClient.delete(`/categories/${category.id}`);
      if (response.data.success) {
        showToast('Category deleted', 'success');
        loadCategories();
      }
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not delete the category'), 'error');
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

  const all = flatten(categories);
  const totalProducts = all.reduce((acc, c) => acc + (c.productCount || 0), 0);
  // The categories could not be read: a dash, not "0" (a count of what nobody has seen).
  const couldNotRead = !loading && Boolean(loadError) && categories.length === 0;
  const figure = (n: number) => (couldNotRead ? '–' : n);

  return (
    <DashboardLayout
      title="Categories"
      subtitle="How dishes are grouped for customers to browse."
      sidebarItems={adminSidebarFor(user?.permissions)}
      userType="admin"
    >
      <div className="max-w-5xl space-y-6">
        <div className="grid grid-cols-3 gap-x-6 gap-y-4" data-testid="category-figures">
          <Figure label="Categories" value={figure(all.length)} />
          <Figure label="Active" value={figure(all.filter((c) => c.isActive).length)} />
          <Figure label="Dishes" value={figure(totalProducts)} />
        </div>

        <div className="flex flex-col gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink">All categories</h2>
            <p className="text-sm text-muted">Top-level categories and the subcategories under them.</p>
          </div>
          <Button onClick={openCreateModal} className="w-full sm:w-auto">
            <Plus aria-hidden="true" className="h-4 w-4" />
            Add category
          </Button>
        </div>

        {loading ? (
          <LoadingLine text="Loading categories" />
        ) : loadError && categories.length === 0 ? (
          <LoadError error={loadError} onRetry={loadCategories} title="We couldn't load the categories" />
        ) : categories.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-soft-ink">
              <FolderTree aria-hidden="true" className="h-6 w-6" />
            </span>
            <h2 className="text-lg font-semibold text-ink">No categories yet</h2>
            <p className="max-w-md text-sm text-muted">Add a category so kitchens can file their dishes and customers can find them.</p>
            <Button onClick={openCreateModal}>Add the first category</Button>
          </div>
        ) : (
          <ul className="space-y-2" data-testid="category-tree">
            {categories.map((category) => (
              <CategoryTreeItem key={category.id} category={category} onEdit={openEditModal} onDelete={handleDeleteCategory} />
            ))}
          </ul>
        )}

        <section aria-labelledby="categories-help" className="rounded-2xl border border-line bg-raised p-4 sm:p-5">
          <h2 id="categories-help" className="mb-2 text-sm font-semibold text-ink">
            How categories work
          </h2>
          <ul className="list-disc space-y-1.5 ps-5 text-sm text-muted">
            <li>
              <span className="font-medium text-ink">Top-level categories</span> are the main groups, such as Parathas.
            </li>
            <li>
              <span className="font-medium text-ink">Subcategories</span> sit under one, such as Stuffed parathas under Parathas.
            </li>
            <li>
              <span className="font-medium text-ink">Sort order</span> sets the order they are shown in; lower numbers come first.
            </li>
            <li>
              <span className="font-medium text-ink">Inactive categories</span> are hidden from customers; their dishes stay in them.
            </li>
            <li>
              <span className="font-medium text-ink">Slugs</span> are made from the name and used in web addresses.
            </li>
          </ul>
        </section>
      </div>

      <CategoryModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setEditingCategory(null);
        }}
        onSubmit={editingCategory ? handleUpdateCategory : handleCreateCategory}
        category={editingCategory}
        parentCategories={all.filter((c) => !c.parentId)}
      />
    </DashboardLayout>
  );
}
