'use client';

/**
 * The kitchen's dish form, one for both "Add dish" (POST) and "Edit dish" (PATCH, with its saved
 * photos, variants, visibility and delete). What it refuses, what it sends and the numbers it shows
 * are in lib/product-form.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useShallow } from 'zustand/react/shallow';
import { DashboardLayout, SELLER_SIDEBAR_ITEMS } from '@/components/layout/DashboardShell';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useDialogs } from '@/components/ui/Dialogs';
import { CategoryRequestModal } from '@/components/CategoryRequestModal';
import MenuTypeField, { DEFAULT_MENU, MenuType, MenuValue, menuError, menuPayload } from '@/components/sellers/MenuTypeField';
import { useAuthStore } from '@/lib/store/auth-store';
import { apiClient } from '@/lib/api-client';
import { loginUrlHere } from '@/lib/auth-redirect';
import {
  EMPTY_PRODUCT_FORM,
  MAX_VARIANTS,
  ProductFormData,
  SavedProduct,
  VariantDraft,
  formFromProduct,
  locateCategory,
  newVariant,
  productPayload,
  productProblem,
  saveErrorMessage,
  variantPayload,
  withoutVariant,
} from '@/lib/product-form';
import CategoryPicker, { GroupedCategories, NO_CATEGORIES } from './CategoryPicker';
import DetailsSection from './DetailsSection';
import PhotosSection, { ProductImage } from './PhotosSection';
import PricingSection from './PricingSection';
import VariantsEditor from './VariantsEditor';
import { ShortcutsButton, ShortcutsHelp, useFormShortcuts } from './KeyboardShortcuts';

interface LoadedProduct extends SavedProduct {
  menuType?: string | null;
  availableDays?: number[] | null;
  menuDate?: string | null;
  images?: Array<{ id: string; imageUrl: string; isPrimary: boolean }>;
}

type LoadedVariant = VariantDraft & { id: string };

const apiOrigin = () => process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') || '';
const photoUrl = (url: string) => (url.startsWith('http') ? url : `${apiOrigin()}${url}`);
const todayInKarachi = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

type Props = { mode: 'create' } | { mode: 'edit'; productId: string };

export default function ProductForm(props: Props) {
  const { mode } = props;
  const productId = props.mode === 'edit' ? props.productId : null;
  const router = useRouter();
  const { isAuthenticated, user } = useAuthStore(useShallow((s) => ({ isAuthenticated: s.isAuthenticated, user: s.user })));
  const { showToast } = useToast();
  const { confirm: confirmDialog } = useDialogs();
  const formRef = useRef<HTMLFormElement>(null);

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ProductFormData>(EMPTY_PRODUCT_FORM);
  const [customUnit, setCustomUnit] = useState('');
  const [menu, setMenu] = useState<MenuValue>(DEFAULT_MENU);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [deletedVariantIds, setDeletedVariantIds] = useState<string[]>([]);
  const [showVariants, setShowVariants] = useState(false);
  const [grouped, setGrouped] = useState<GroupedCategories>(NO_CATEGORIES);
  // Why the categories could not be read; shown instead of "No categories available", which would be untrue.
  const [categoriesError, setCategoriesError] = useState<unknown>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [showCategoryRequest, setShowCategoryRequest] = useState(false);
  const { helpOpen, setHelpOpen } = useFormShortcuts(formRef, saving);

  const update = useCallback((patch: Partial<ProductFormData>) => setForm((prev) => ({ ...prev, ...patch })), []);

  const loadCategories = useCallback(async () => {
    try {
      setCategoriesError(null);
      const response = await apiClient.get('/categories/grouped');
      if (response.data.success && response.data.data) setGrouped(response.data.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
      setCategoriesError(error);
    }
  }, []);

  const loadProduct = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        const [productRes, variantsRes] = await Promise.all([
          apiClient.get(`/products/${id}`),
          apiClient.get(`/product-variants/product/${id}`).catch((error) => {
            console.error('Failed to load variants:', error);
            showToast("We couldn't load this dish's variants; saving now leaves them as they are.", 'warning');
            return null;
          }),
        ]);
        const product: LoadedProduct | undefined = productRes.data.success ? productRes.data.data : undefined;
        if (!product) throw new Error('Product not found');

        const filled = formFromProduct(product);
        setForm(filled.form);
        setCustomUnit(filled.customUnit);
        setMenu({
          menuType: (product.menuType as MenuType) || 'fixed',
          availableDays: product.availableDays ?? [],
          onTodaysMenu: !!product.menuDate && product.menuDate.slice(0, 10) === todayInKarachi(),
        });
        setImages(
          (product.images || []).map((img) => ({ id: img.id, url: img.imageUrl, preview: photoUrl(img.imageUrl), isPrimary: img.isPrimary })),
        );
        const saved: LoadedVariant[] = variantsRes?.data?.success ? variantsRes.data.data || [] : [];
        setVariants(saved);
        setShowVariants(saved.length > 0);
      } catch (error) {
        console.error('Failed to load product:', error);
        showToast('Failed to load product', 'error');
        router.push('/sellers/products');
      } finally {
        setLoading(false);
      }
    },
    [router, showToast],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.push(loginUrlHere());
      return;
    }
    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('Access denied. Seller privileges required.', 'error');
      return;
    }
    loadCategories();
    if (productId) loadProduct(productId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per signed-in seller and dish
  }, [isAuthenticated, user, productId]);

  // A saved dish opens with its category's top-level category picked, once both have loaded.
  useEffect(() => {
    if (!form.productType || !form.categoryId) return;
    const found = locateCategory(grouped[form.productType] || [], form.categoryId);
    if (found) setParentId(found.parent ? found.parent.id : found.category.id);
  }, [form.productType, form.categoryId, grouped]);

  /** New photos uploaded, in the order shown after the saved ones; null when the upload failed. */
  const uploadNewPhotos = async (): Promise<string[] | null> => {
    const files = images.filter((img) => img.file).map((img) => img.file as File);
    if (files.length === 0) return [];
    const body = new FormData();
    files.forEach((file) => body.append('images', file));
    try {
      const res = await apiClient.post('/upload/product-images', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      return res.data.success ? res.data.data.images.map((img: { url: string }) => img.url) : null;
    } catch (error) {
      console.error('Image upload failed:', error);
      return null;
    }
  };

  /** Creates the variants of a new dish, or applies the edits to a saved dish's; false when any failed. */
  const saveVariants = async (id: string): Promise<boolean> => {
    try {
      if (mode === 'create') {
        if (variants.length > 0) {
          await apiClient.post('/product-variants/bulk', { productId: id, variants: variants.map(variantPayload) });
        }
        return true;
      }
      for (const variantId of deletedVariantIds) await apiClient.delete(`/product-variants/${variantId}`);
      for (const [index, variant] of variants.entries()) {
        const body = variantPayload(variant, index);
        if (variant.id) await apiClient.patch(`/product-variants/${variant.id}`, body);
        else await apiClient.post('/product-variants', { productId: id, ...body });
      }
      return true;
    } catch (error) {
      console.error('Failed to save variants:', error);
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = productProblem(form, customUnit, { requireCategory: mode === 'create' }) || menuError(menu);
    if (problem) {
      showToast(problem, 'error');
      return;
    }

    try {
      setSaving(true);
      const uploaded = await uploadNewPhotos();
      if (uploaded === null) {
        showToast(mode === 'create' ? 'Failed to upload images. Product will be created without images.' : 'Failed to upload new images', 'warning');
      }
      const savedPhotos = images.filter((img) => img.url).map((img) => img.url as string);
      const body = { ...productPayload(form, customUnit, [...savedPhotos, ...(uploaded || [])], mode), ...menuPayload(menu) };

      const response = productId ? await apiClient.patch(`/products/${productId}`, body) : await apiClient.post('/products', body);
      if (!response.data.success) return;

      const id: string = productId || response.data.data.id;
      const touchedVariants = variants.length > 0 || deletedVariantIds.length > 0;
      const variantsSaved = touchedVariants ? await saveVariants(id) : true;
      const n = variants.length;

      if (!variantsSaved) {
        showToast(
          mode === 'create'
            ? 'Product created but variants failed. You can add them later by editing the product.'
            : 'Product updated but some variants failed. Please try again.',
          'warning',
        );
      } else if (mode === 'create') {
        showToast(
          n > 0
            ? `Product created with ${n} variant${n > 1 ? 's' : ''}! It'll go live once approved by an admin.`
            : "Product submitted for review! It'll go live once approved by an admin.",
          'success',
        );
      } else {
        showToast(touchedVariants ? `Product and ${n} variant(s) updated successfully!` : '✅ Product updated successfully!', 'success');
      }
      router.push('/sellers/products');
    } catch (error) {
      console.error('Failed to save product:', error);
      showToast(saveErrorMessage(error, mode === 'create' ? 'Failed to add product. Please try again.' : 'Failed to update product. Please try again.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    if (
      !(await confirmDialog({
        title: 'Delete this dish?',
        message: 'Are you sure you want to delete this product? This action cannot be undone.',
        confirmText: 'Delete',
      }))
    ) {
      return;
    }
    try {
      setSaving(true);
      const response = await apiClient.delete(`/products/${productId}`);
      if (response.data.success) {
        showToast('Product deleted successfully', 'success');
        router.push('/sellers/products');
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
      showToast(saveErrorMessage(error, 'Failed to delete product'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const addVariant = () => {
    if (variants.length >= MAX_VARIANTS) {
      showToast(`Maximum ${MAX_VARIANTS} variants allowed per product`, 'warning');
      return;
    }
    setVariants((prev) => [...prev, newVariant(form, prev.length)]);
  };

  const removeVariant = (index: number) => {
    const id = variants[index]?.id;
    if (id) setDeletedVariantIds((prev) => [...prev, id]);
    setVariants((prev) => withoutVariant(prev, index));
  };

  if (!isAuthenticated) return null;

  const title = mode === 'create' ? 'Add New Product' : 'Edit Product';
  if (loading) {
    return (
      <DashboardLayout title={title} subtitle="Loading..." sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-500">Loading product...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  const detailsDone = !!form.name && !!form.categoryId;
  const steps = [
    { label: 'Photos', done: images.length > 0 },
    { label: 'Details', done: detailsDone },
    { label: 'Pricing', done: !!form.price },
  ];

  return (
    <DashboardLayout
      title={title}
      subtitle={mode === 'create' ? 'List a new product in your store' : 'Update your product details'}
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-4xl mx-auto">
        <ShortcutsButton onClick={() => setHelpOpen(!helpOpen)} />
        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

        {mode === 'create' && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-5 mb-6 border border-blue-100">
            <div className="flex items-center justify-between max-w-3xl mx-auto">
              {steps.map((step, i) => (
                <div key={step.label} className={`flex items-center ${i < steps.length - 1 ? 'flex-1' : ''}`}>
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        step.done ? 'bg-emerald-600 text-white' : 'bg-white text-gray-400 border-2 border-gray-300'
                      }`}
                    >
                      {step.done ? '✓' : i + 1}
                    </div>
                    <span className={`text-sm font-medium ${step.done ? 'text-emerald-700' : 'text-gray-500'}`}>{step.label}</span>
                  </div>
                  {i < steps.length - 1 && (
                    <div className="flex-1 mx-4 h-1 bg-white rounded-full overflow-hidden">
                      <div className={`h-full bg-emerald-500 transition-all duration-500 ${step.done ? 'w-full' : 'w-0'}`}></div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <form ref={formRef} onSubmit={handleSubmit}>
          {mode === 'edit' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Product Status</h2>
                  <p className="text-sm text-gray-500">Control whether this product is visible to customers</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isActive}
                  aria-label="Visible to customers"
                  onClick={() => update({ isActive: !form.isActive })}
                  className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${form.isActive ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform ${
                      form.isActive ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              <div
                className={`mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  form.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {form.isActive ? '● Live - Visible to customers' : '○ Hidden - Not visible to customers'}
              </div>
            </div>
          )}

          <PhotosSection images={images} onChange={setImages} onTooMany={() => showToast('Maximum 4 images allowed', 'warning')} />

          <DetailsSection
            form={form}
            update={update}
            categoryPicker={
              <CategoryPicker
                productType={form.productType}
                categoryId={form.categoryId}
                parentId={parentId}
                grouped={grouped}
                loadError={categoriesError}
                onRetry={loadCategories}
                onChange={(next) => {
                  setParentId(next.parentId);
                  update(next.productType ? { productType: next.productType, categoryId: next.categoryId } : { categoryId: next.categoryId });
                }}
                onRequestCategory={() => setShowCategoryRequest(true)}
              />
            }
          />

          <PricingSection
            form={form}
            update={update}
            customUnit={customUnit}
            onCustomUnit={setCustomUnit}
            variants={
              <VariantsEditor
                mode={mode}
                variants={variants}
                open={showVariants}
                onToggle={() => setShowVariants(!showVariants)}
                onAdd={addVariant}
                onRemove={removeVariant}
                onUpdate={(index, patch) => setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)))}
                onMakeDefault={(index) => setVariants((prev) => prev.map((v, i) => ({ ...v, isDefault: i === index })))}
              />
            }
            menu={<MenuTypeField value={menu} onChange={setMenu} />}
          />

          <div className="sticky bottom-0 bg-white border-t-2 border-gray-100 -mx-4 px-4 sm:-mx-6 sm:px-6 pt-5 pb-[calc(1.25rem+var(--safe-bottom))] mt-8 rounded-t-3xl shadow-2xl">
            <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3">
              <Button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white py-4 rounded-xl font-bold text-lg shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 transition-all"
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>{mode === 'create' ? 'Creating Product...' : 'Saving...'}</span>
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <span className="text-xl">{mode === 'create' ? '✨' : '💾'}</span>
                    <span>{mode === 'create' ? 'Create Product' : 'Save Changes'}</span>
                    <span className="text-xs opacity-75 ms-2 px-2 py-1 bg-white/20 rounded">Ctrl+S</span>
                  </span>
                )}
              </Button>
              <Link href="/sellers/products" className="sm:w-auto">
                <Button type="button" variant="outline" className="w-full sm:w-40 py-4 rounded-xl border-2 font-semibold hover:bg-gray-50">
                  Cancel
                </Button>
              </Link>
            </div>
          </div>

          {mode === 'create' ? (
            <div className="mt-6 bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-5 border-2 border-amber-200 shadow-sm">
              <h3 className="font-bold text-amber-900 mb-3 flex items-center gap-2 text-lg">
                <span className="text-2xl">💡</span> Pro Tips for Better Sales
              </h3>
              <ul className="text-sm text-amber-700 space-y-1">
                <li>• Use clear, well-lit photos from multiple angles</li>
                <li>• Include quantity in product name (e.g., &quot;Pack of 12&quot;)</li>
                <li>• Add a discount - products with discounts sell 3x more!</li>
                <li>• List all ingredients for customer trust</li>
              </ul>
            </div>
          ) : (
            <div className="mt-8 border border-red-200 rounded-2xl p-6 bg-red-50">
              <h3 className="font-bold text-red-700 mb-2">Danger Zone</h3>
              <p className="text-sm text-red-600 mb-4">Once you delete a product, there is no going back. Please be certain.</p>
              <Button type="button" variant="outline" onClick={handleDelete} disabled={saving} className="border-red-300 text-red-600 hover:bg-red-100">
                🗑️ Delete Product
              </Button>
            </div>
          )}
        </form>
      </div>

      <CategoryRequestModal
        isOpen={showCategoryRequest}
        onClose={() => setShowCategoryRequest(false)}
        preselectedProductType={form.productType || undefined}
      />
    </DashboardLayout>
  );
}
