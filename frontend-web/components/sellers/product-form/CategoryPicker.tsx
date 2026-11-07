'use client';

import { LoadError } from '@/components/ui/LoadError';
import { CategoryNode, PRODUCT_TYPE_OPTIONS, ProductType, locateCategory } from '@/lib/product-form';
import { chipClass, labelClass, optionClass } from './fields';
import { useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';

export type GroupedCategories = Record<ProductType, CategoryNode[]>;

export const NO_CATEGORIES: GroupedCategories = { frozen: [], fresh: [], ready_to_eat: [], ready_to_cook: [] };

/**
 * Product type, then category, then subcategory when the category has some. Changing the type
 * clears the category; picking a category without subcategories selects it.
 */
export default function CategoryPicker({
  productType,
  categoryId,
  parentId,
  grouped,
  loadError,
  onRetry,
  onChange,
  onRequestCategory,
}: {
  productType: '' | ProductType;
  categoryId: string;
  parentId: string | null;
  grouped: GroupedCategories;
  loadError: unknown;
  onRetry: () => void;
  onChange: (next: { productType?: ProductType; categoryId: string; parentId: string | null }) => void;
  onRequestCategory: () => void;
}) {
  const categories = productType ? grouped[productType] || [] : [];
  const parent = categories.find((c) => c.id === parentId) || null;
  const selected = locateCategory(categories, categoryId);
  const t = useT(kitchenProductFormMessages);

  return (
    <>
      <div role="group" aria-labelledby="product-type-label">
        <p id="product-type-label" className={labelClass}>
          {t('type')}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {PRODUCT_TYPE_OPTIONS.map((type) => {
            const isSelected = productType === type.value;
            return (
              <button
                key={type.value}
                type="button"
                aria-pressed={isSelected}
                onClick={() => {
                  if (!isSelected) onChange({ productType: type.value, categoryId: '', parentId: null });
                }}
                className={optionClass(isSelected)}
              >
                <span className="block text-[15px] font-semibold text-ink">{t(`ptype.${type.value}`)}</span>
                <span className="mt-0.5 block text-sm text-muted">{t(`ptype.${type.value}.desc`)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {productType && (
        <div role="group" aria-labelledby="product-category-label">
          <p id="product-category-label" className={labelClass}>
            {t('category')}
          </p>
          {categories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  aria-pressed={parentId === cat.id}
                  onClick={() => onChange({ categoryId: cat.children && cat.children.length > 0 ? '' : cat.id, parentId: cat.id })}
                  className={chipClass(parentId === cat.id)}
                >
                  {cat.name}
                  {cat.children && cat.children.length > 0 && <span className="text-muted tabular-nums">({cat.children.length})</span>}
                </button>
              ))}
            </div>
          ) : loadError ? (
            <LoadError compact error={loadError} onRetry={onRetry} title={t('categoriesFailed')} />
          ) : (
            <p className="text-sm text-muted">{t('noCategories')}</p>
          )}
        </div>
      )}

      {parent?.children && parent.children.length > 0 && (
        <div role="group" aria-labelledby="product-subcategory-label">
          <p id="product-subcategory-label" className={labelClass}>
            {t('kindOf', { name: parent.name })}
          </p>
          <div className="flex flex-wrap gap-2">
            {parent.children.map((sub) => (
              <button
                key={sub.id}
                type="button"
                aria-pressed={categoryId === sub.id}
                onClick={() => onChange({ categoryId: sub.id, parentId: parent.id })}
                className={chipClass(categoryId === sub.id)}
              >
                {sub.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {productType && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {selected ? (
            <p className="text-sm text-muted">
              {t('listedUnder')}{' '}
              <span className="font-medium text-ink">
                {selected.parent ? `${selected.parent.name}, ` : ''}
                {selected.category.name}
              </span>
            </p>
          ) : (
            <span />
          )}
          <button type="button" onClick={onRequestCategory} className="min-h-11 text-sm font-medium text-brand-ink underline-offset-4 hover:underline">
            {t('askCategory')}
          </button>
        </div>
      )}
    </>
  );
}
