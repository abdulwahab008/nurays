'use client';

import { LoadError } from '@/components/ui/LoadError';
import { CategoryNode, PRODUCT_TYPE_OPTIONS, ProductType, locateCategory } from '@/lib/product-form';

export type GroupedCategories = Record<ProductType, CategoryNode[]>;

export const NO_CATEGORIES: GroupedCategories = { frozen: [], fresh: [], ready_to_eat: [], ready_to_cook: [] };

const Step = ({ n }: { n: number }) => (
  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-500 text-white text-xs font-bold me-2">{n}</span>
);

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
  const typeOption = PRODUCT_TYPE_OPTIONS.find((t) => t.value === productType);

  return (
    <>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          <Step n={1} />
          Product Type <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {PRODUCT_TYPE_OPTIONS.map((type) => {
            const isSelected = productType === type.value;
            return (
              <button
                key={type.value}
                type="button"
                onClick={() => {
                  if (!isSelected) onChange({ productType: type.value, categoryId: '', parentId: null });
                }}
                className={`p-4 rounded-xl text-start transition-all border-2 ${
                  isSelected ? `${type.selected} shadow-md` : 'bg-gray-50 border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl">{type.icon}</span>
                  <span className="font-semibold text-gray-900">{type.label}</span>
                </div>
                <p className="text-xs text-gray-500">{type.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {productType && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <Step n={2} />
            Category <span className="text-red-500">*</span>
          </label>
          {categories.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() =>
                    onChange({ categoryId: cat.children && cat.children.length > 0 ? '' : cat.id, parentId: cat.id })
                  }
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0 ${
                    parentId === cat.id ? 'bg-blue-500 text-white shadow-lg shadow-blue-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>{cat.iconUrl || '📦'}</span>
                  <span>{cat.name}</span>
                  {cat.children && cat.children.length > 0 && <span className="text-xs opacity-70 ms-1">({cat.children.length})</span>}
                </button>
              ))}
            </div>
          ) : loadError ? (
            <LoadError compact error={loadError} onRetry={onRetry} title="We couldn't load the categories" />
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 text-center text-gray-500 text-sm">
              No categories available for {typeOption?.label}
            </div>
          )}
        </div>
      )}

      {parent?.children && parent.children.length > 0 && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            <Step n={3} />
            Subcategory in <span className="font-semibold">{parent.name}</span>
          </label>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {parent.children.map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => onChange({ categoryId: sub.id, parentId: parent.id })}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                    categoryId === sub.id ? 'bg-emerald-700 text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                  }`}
                >
                  <span>{sub.iconUrl || '•'}</span>
                  <span>{sub.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {productType && (
        <div className="mb-6">
          <button
            type="button"
            onClick={onRequestCategory}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-2 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Can&apos;t find your category? Request a new one
          </button>
        </div>
      )}

      {selected && (
        <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-4 py-3 rounded-xl mb-6 border border-green-200">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">
            {typeOption?.icon} {typeOption?.label} → {selected.parent ? `${selected.parent.name} → ` : ''}
            {selected.category.name}
          </span>
        </div>
      )}
    </>
  );
}
