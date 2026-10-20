'use client';

import { MAX_VARIANTS, VariantDraft, profitOf } from '@/lib/product-form';

const input = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500';

function MoneyInput({ value, onChange, placeholder }: { value?: number; onChange: (v: number | undefined) => void; placeholder: string }) {
  return (
    <div className="relative">
      <span className="absolute start-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm">Rs.</span>
      <input
        type="number"
        value={value || ''}
        onChange={(e) => onChange(parseFloat(e.target.value) || undefined)}
        placeholder={placeholder}
        min="0"
        className={`${input} ps-10`}
      />
    </div>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <label className="block text-xs font-medium text-gray-700 mb-1">{children}</label>
);

/** Sizes, packs or options of one dish, each with its own price and stock. */
export default function VariantsEditor({
  mode,
  variants,
  open,
  onToggle,
  onAdd,
  onRemove,
  onUpdate,
  onMakeDefault,
}: {
  mode: 'create' | 'edit';
  variants: VariantDraft[];
  open: boolean;
  onToggle: () => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, patch: Partial<VariantDraft>) => void;
  onMakeDefault: (index: number) => void;
}) {
  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-6 border-2 border-purple-200 mt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <span>📦</span> Product Variants
            {variants.length > 0 && <span className="bg-purple-500 text-white px-2 py-0.5 rounded-full text-xs">{variants.length}</span>}
          </h3>
          <p className="text-sm text-gray-600 mt-1">Offer different sizes, packs, or options (e.g., Small/Medium/Large)</p>
        </div>
        <button type="button" onClick={onToggle} className="text-purple-600 hover:text-purple-700 font-medium text-sm">
          {open ? '− Hide' : mode === 'edit' ? '+ Manage Variants' : '+ Add Variants'}
        </button>
      </div>

      {open && (
        <div className="space-y-4">
          {mode === 'create' && (
            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <p className="text-sm font-medium text-gray-700 mb-2">💡 Example: Chicken Samosa</p>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between"><span>→ Small Pack (6 pieces)</span><span className="font-medium">Rs 300</span></div>
                <div className="flex justify-between"><span>→ Medium Pack (12 pieces)</span><span className="font-medium">Rs 550</span></div>
                <div className="flex justify-between"><span>→ Large Pack (24 pieces)</span><span className="font-medium">Rs 1000</span></div>
              </div>
            </div>
          )}

          {variants.map((variant, index) => {
            const profit = variant.price && variant.costPrice ? profitOf(variant.price, variant.costPrice) : null;
            return (
              <div key={variant.id || `new-${index}`} className="bg-white rounded-xl p-4 border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-gray-900">
                    {mode === 'edit' && !variant.id ? 'New Variant' : 'Variant'} {index + 1}
                    {variant.isDefault && <span className="ms-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Default</span>}
                  </h4>
                  <div className="flex gap-2">
                    {!variant.isDefault && (
                      <button type="button" onClick={() => onMakeDefault(index)} className="text-xs text-blue-600 hover:underline">
                        Set as Default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      aria-label={`Remove variant ${index + 1}`}
                      className="text-red-500 hover:text-red-700"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label>Variant Name *</Label>
                    <input
                      type="text"
                      value={variant.name}
                      onChange={(e) => onUpdate(index, { name: e.target.value })}
                      placeholder="e.g., Small Pack (6 pieces)"
                      className={input}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Variant Name (Urdu)</Label>
                    <input
                      type="text"
                      value={variant.nameUrdu || ''}
                      onChange={(e) => onUpdate(index, { nameUrdu: e.target.value })}
                      placeholder="چھوٹا پیک (6 عدد)"
                      className={`${input} text-end`}
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <Label>Price *</Label>
                    <MoneyInput value={variant.price} onChange={(v) => onUpdate(index, { price: v || 0 })} placeholder="300" />
                  </div>
                  <div>
                    <Label>Original Price</Label>
                    <MoneyInput value={variant.originalPrice} onChange={(v) => onUpdate(index, { originalPrice: v })} placeholder="350" />
                  </div>
                  <div>
                    <Label>Your Cost</Label>
                    <MoneyInput value={variant.costPrice} onChange={(v) => onUpdate(index, { costPrice: v })} placeholder="180" />
                  </div>
                  <div>
                    <Label>Stock Quantity *</Label>
                    <input
                      type="number"
                      value={variant.stockQuantity || ''}
                      onChange={(e) => onUpdate(index, { stockQuantity: parseInt(e.target.value, 10) || 0 })}
                      placeholder="50"
                      min="0"
                      className={input}
                    />
                  </div>
                  <div>
                    <Label>Low Stock Alert At</Label>
                    <input
                      type="number"
                      value={variant.stockThreshold || ''}
                      onChange={(e) => onUpdate(index, { stockThreshold: parseInt(e.target.value, 10) || undefined })}
                      placeholder="10"
                      min="0"
                      className={input}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>SKU / Barcode (Optional)</Label>
                    <input
                      type="text"
                      value={variant.sku || ''}
                      onChange={(e) => onUpdate(index, { sku: e.target.value })}
                      placeholder="SM-SAMOSA-6PC"
                      className={input}
                    />
                  </div>
                  {profit && (
                    <div className="col-span-2 bg-emerald-50 rounded-lg p-3 border border-emerald-200">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-600">Profit per unit:</span>
                        <span className="font-bold text-emerald-700">
                          Rs {profit.profit.toFixed(0)}
                          <span className="ms-1 text-gray-500">({profit.margin.toFixed(1)}%)</span>
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={onAdd}
            disabled={variants.length >= MAX_VARIANTS}
            className="w-full py-3 border-2 border-dashed border-purple-300 rounded-xl text-purple-600 hover:bg-purple-50 font-medium flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-xl">+</span> Add Another Variant {variants.length > 0 && `(${variants.length}/${MAX_VARIANTS})`}
          </button>

          <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
            <p className="text-xs font-medium text-blue-800 mb-1">💡 Pro Tips:</p>
            <ul className="text-xs text-blue-700 space-y-0.5">
              <li>• Set the most popular size as &quot;Default&quot;</li>
              <li>• Set low stock alerts to avoid running out</li>
              {mode === 'edit' ? (
                <>
                  <li>• Changes are saved when you click &quot;Save Changes&quot;</li>
                  <li>• Deleted variants will be permanently removed</li>
                </>
              ) : (
                <>
                  <li>• Offer bulk discounts (e.g., Large pack = better Rs/piece)</li>
                  <li>• Maximum {MAX_VARIANTS} variants per product</li>
                </>
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
