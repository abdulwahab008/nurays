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
  productProblems,
  saveErrorMessage,
  variantPayload,
  withoutVariant,
} from '@/lib/product-form';
import CategoryPicker, { GroupedCategories, NO_CATEGORIES } from './CategoryPicker';
import DetailsSection from './DetailsSection';
import PhotosSection, { ProductImage } from './PhotosSection';
import PricingSection from './PricingSection';
import VariantsEditor from './VariantsEditor';
import DeliveryMenuSection from './DeliveryMenuSection';
import { FieldErrorsContext, SwitchRow } from './fields';
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
  // What stopped the last save, by field; the messages go once the kitchen changes something.
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { helpOpen, setHelpOpen } = useFormShortcuts(formRef, saving);

  const update = useCallback((patch: Partial<ProductFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setFieldErrors((prev) => (Object.keys(prev).length ? {} : prev));
  }, []);

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
            showToast("We couldn't load this dish's sizes; saving now leaves them as they are.", 'warning');
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
        showToast("We couldn't open this dish.", 'error');
        router.push('/sellers/products');
      } finally {
        setLoading(false);
      }
    },
    [router, showToast],
  );

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace(loginUrlHere());
      return;
    }
    if (user?.userType !== 'seller' && user?.user_type !== 'seller') {
      router.push('/dashboard');
      showToast('This page is for kitchens.', 'error');
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
    const problems = productProblems(form, customUnit, { requireCategory: mode === 'create', variants });
    setFieldErrors(problems);
    const first = Object.keys(problems)[0];
    if (first) {
      if (!showVariants && first.startsWith('variant-')) setShowVariants(true);
      const field = document.getElementById(first);
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field?.focus({ preventScroll: true });
      const count = Object.keys(problems).length;
      showToast(count === 1 ? problems[first] : `Fix the ${count} things marked in red.`, 'error');
      return;
    }
    const menuProblem = menuError(menu);
    if (menuProblem) {
      showToast(menuProblem, 'error');
      return;
    }

    try {
      setSaving(true);
      const uploaded = await uploadNewPhotos();
      if (uploaded === null) {
        showToast(mode === 'create' ? 'The photos did not upload. The dish is saved without them.' : 'The new photos did not upload.', 'warning');
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
            ? "Dish saved, but its sizes were not. Open it and add them again."
            : 'Changes saved, but some sizes were not. Try saving again.',
          'warning',
        );
        // The dish exists now: going on as "Add a dish" would make a second one.
        if (mode === 'create') {
          router.push(`/sellers/products/${id}/edit`);
          return;
        }
      } else if (mode === 'create') {
        showToast(
          n > 0
            ? `Dish saved with ${n} size${n > 1 ? 's' : ''}. Customers can order it once Nuray has checked it.`
            : "Dish saved. Customers can order it once Nuray has checked it.",
          'success',
        );
      } else {
        showToast('Changes saved.', 'success');
      }
      router.push('/sellers/products');
    } catch (error) {
      console.error('Failed to save product:', error);
      showToast(saveErrorMessage(error, mode === 'create' ? 'The dish was not saved. Try again.' : 'Your changes were not saved. Try again.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!productId) return;
    if (
      !(await confirmDialog({
        title: 'Delete this dish?',
        message: 'It leaves your menu for good. This cannot be undone.',
        confirmText: 'Delete',
      }))
    ) {
      return;
    }
    try {
      setSaving(true);
      const response = await apiClient.delete(`/products/${productId}`);
      if (response.data.success) {
        showToast('Dish deleted.', 'success');
        router.push('/sellers/products');
      }
    } catch (error) {
      console.error('Failed to delete product:', error);
      showToast(saveErrorMessage(error, 'The dish was not deleted. Try again.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const addVariant = () => {
    if (variants.length >= MAX_VARIANTS) {
      showToast(`A dish can have up to ${MAX_VARIANTS} sizes.`, 'warning');
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

  const title = mode === 'create' ? 'Add a dish' : 'Edit dish';
  if (loading) {
    return (
      <DashboardLayout title={title} sidebarItems={SELLER_SIDEBAR_ITEMS} userType="seller">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3 py-10 text-sm text-muted" role="status">
            <span className="h-5 w-5 rounded-full border-2 border-line-strong border-t-brand-600 motion-safe:animate-spin" aria-hidden="true" />
            Loading the dish…
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title={title}
      subtitle={mode === 'create' ? 'Customers can order it once Nuray has checked it.' : undefined}
      sidebarItems={SELLER_SIDEBAR_ITEMS}
      userType="seller"
    >
      <div className="max-w-3xl">
        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}

        <FieldErrorsContext.Provider value={fieldErrors}>
        <form ref={formRef} onSubmit={handleSubmit} noValidate>
          {mode === 'edit' && (
            <section aria-label="Showing to customers" className="border-b border-line pb-6 mb-8">
              <SwitchRow
                checked={form.isActive}
                onChange={() => update({ isActive: !form.isActive })}
                label={form.isActive ? 'Showing to customers' : 'Hidden from customers'}
                hint={form.isActive ? 'Customers can see and order this dish.' : 'Customers cannot see this dish until you show it.'}
                ariaLabel="Visible to customers"
              />
            </section>
          )}

          <PhotosSection images={images} onChange={setImages} onTooMany={() => showToast('You can add up to 4 photos', 'warning')} />

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
                onUpdate={(index, patch) => {
                  setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, ...patch } : v)));
                  setFieldErrors((prev) => (Object.keys(prev).length ? {} : prev));
                }}
                onMakeDefault={(index) => setVariants((prev) => prev.map((v, i) => ({ ...v, isDefault: i === index })))}
              />
            }
          />

          <DeliveryMenuSection form={form} update={update} menu={<MenuTypeField value={menu} onChange={setMenu} />} />

          {mode === 'edit' && (
            <section aria-labelledby="dish-delete" className="border-t border-line py-8">
              <h2 id="dish-delete" className="text-sm font-semibold text-ink">
                Delete this dish
              </h2>
              <p className="mt-1 text-sm text-muted">It leaves your menu for good. To take it off for a while, hide it instead.</p>
              <Button
                type="button"
                variant="outline"
                onClick={handleDelete}
                disabled={saving}
                className="mt-4 border-red-200 text-red-700 hover:bg-red-50"
              >
                Delete dish
              </Button>
            </section>
          )}

          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-page/95 py-4 pb-[calc(1rem+var(--safe-bottom,0px))] backdrop-blur">
            <ShortcutsButton onClick={() => setHelpOpen(!helpOpen)} />
            <span className="hidden flex-1 sm:block" />
            <Link href="/sellers/products" className="flex-1 sm:flex-none">
              <Button type="button" variant="outline" className="w-full">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none sm:px-8">
              {saving ? (mode === 'create' ? 'Adding…' : 'Saving…') : mode === 'create' ? 'Add dish' : 'Save changes'}
            </Button>
          </div>
        </form>
        </FieldErrorsContext.Provider>
      </div>

      <CategoryRequestModal
        isOpen={showCategoryRequest}
        onClose={() => setShowCategoryRequest(false)}
        preselectedProductType={form.productType || undefined}
      />
    </DashboardLayout>
  );
}
