'use client';

import { ProductFormData } from '@/lib/product-form';

const PREP_PRESETS = [
  { label: 'Burger', mins: 15 },
  { label: 'Shawarma', mins: 20 },
  { label: 'Pasta', mins: 25 },
  { label: 'Biryani', mins: 30 },
  { label: 'Karahi', mins: 45 },
];

/** Name, category, kitchen timing, description, ingredients and the halal mark. */
export default function DetailsSection({
  form,
  update,
  categoryPicker,
}: {
  form: ProductFormData;
  update: (patch: Partial<ProductFormData>) => void;
  categoryPicker: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg">
          <span className="text-2xl">✏️</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Product Details</h2>
          <p className="text-sm text-gray-500">Basic information about your product</p>
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="product-name-input" className="block text-sm font-medium text-gray-700 mb-2">
          Product Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="product-name-input"
          value={form.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g., Chicken Samosa (Pack of 12)"
          maxLength={100}
          className="w-full px-4 py-3 text-lg border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-gray-500">💡 Be specific and include quantity/size</p>
          <span className="text-xs text-gray-500">{form.name.length}/100</span>
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="product-name-urdu-input" className="block text-sm font-medium text-gray-700 mb-2">
          <span>Name in Urdu</span>
          <span className="text-gray-500 font-normal ms-2">(اختیاری - reaches more customers)</span>
        </label>
        <input
          type="text"
          id="product-name-urdu-input"
          value={form.nameUrdu}
          onChange={(e) => update({ nameUrdu: e.target.value })}
          placeholder="مثال: چکن سموسہ (12 کا پیک)"
          maxLength={100}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-end transition-all"
          dir="rtl"
        />
        <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
          <span>🌐</span>
          <span>Urdu names help local customers find your products easily</span>
        </p>
      </div>

      {categoryPicker}

      <div className="mb-6 p-5 bg-gradient-to-r from-brand-50 to-amber-50 border border-brand-200 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-brand-900 flex items-center gap-2">
            <span>⏱️</span> Kitchen Preparation Time (Important)
          </h3>
          <span className="text-xs font-medium text-brand-ink bg-brand-100 px-2.5 py-1 rounded-full">Used by Delivery Engine for JIT Dispatch</span>
        </div>
        <p className="text-xs text-slate-600 mb-3">Estimated minutes required to cook and package this dish after order acceptance.</p>

        <div className="flex flex-wrap gap-2 mb-4">
          {PREP_PRESETS.map((preset) => (
            <button
              key={preset.label}
              id={`prep-preset-${preset.mins}`}
              type="button"
              onClick={() => update({ preparationTime: String(preset.mins) })}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                form.preparationTime === String(preset.mins)
                  ? 'bg-brand text-on-brand shadow-sm shadow-brand-200'
                  : 'bg-white border border-brand-200 text-slate-700 hover:bg-brand-100'
              }`}
            >
              {preset.label} ({preset.mins}m)
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="product-prep-time-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Preparation Time (minutes) <span className="text-brand-ink">*</span>
            </label>
            <input
              type="number"
              id="product-prep-time-input"
              value={form.preparationTime}
              onChange={(e) => update({ preparationTime: e.target.value })}
              placeholder="e.g., 30"
              min="1"
              className="w-full px-4 py-2.5 border border-brand-200 rounded-xl focus:ring-2 focus:ring-brand bg-white text-slate-900 font-bold text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">Order ready estimate for riders</p>
          </div>
          <div>
            <label htmlFor="product-shelf-life-input" className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Shelf Life (hours - Optional)
            </label>
            <input
              type="number"
              id="product-shelf-life-input"
              value={form.shelfLifeHours}
              onChange={(e) => update({ shelfLifeHours: e.target.value })}
              placeholder="e.g., 24"
              min="1"
              className="w-full px-4 py-2.5 border border-brand-200 rounded-xl focus:ring-2 focus:ring-brand bg-white text-slate-900 font-medium text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">Freshness window</p>
          </div>
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="product-description-input" className="block text-sm font-medium text-gray-700 mb-2">
          Description <span className="text-gray-500 font-normal">(Optional but recommended)</span>
        </label>
        <textarea
          id="product-description-input"
          value={form.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder={'Tell customers what makes this special...\n• Key ingredients\n• Taste & texture\n• Perfect for which occasions'}
          rows={4}
          maxLength={500}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-emerald-600">✨ Products with descriptions sell 3x more</p>
          <span className="text-xs text-gray-500">{form.description.length}/500</span>
        </div>
      </div>

      <div className="mb-5">
        <label htmlFor="product-ingredients-input" className="block text-sm font-medium text-gray-700 mb-2">
          Ingredients <span className="text-gray-500 font-normal">(Optional but builds trust)</span>
        </label>
        <textarea
          id="product-ingredients-input"
          value={form.ingredients}
          onChange={(e) => update({ ingredients: e.target.value })}
          placeholder="Example: Chicken mince, wheat flour, onions, spices (cumin, coriander, red chili), salt, oil"
          rows={2}
          maxLength={300}
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
        />
        <div className="flex justify-between items-center mt-1">
          <p className="text-xs text-blue-600">🛡️ Transparency increases customer confidence</p>
          <span className="text-xs text-gray-500">{form.ingredients.length}/300</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-pressed={form.isHalal}
          onClick={() => update({ isHalal: !form.isHalal })}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all ${
            form.isHalal ? 'bg-green-100 text-green-700 border-2 border-green-300' : 'bg-gray-100 text-gray-500 border-2 border-transparent'
          }`}
        >
          {form.isHalal ? (
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
  );
}
