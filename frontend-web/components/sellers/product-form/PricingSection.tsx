'use client';

import { ProductFormData, StockType, UNIT_OPTIONS, discountPercent, profitOf } from '@/lib/product-form';

const FULFILMENT: Array<{ value: StockType; label: string; icon: string; desc: string }> = [
  { value: 'direct', label: 'Direct Delivery', icon: '🚗', desc: 'You deliver to customers' },
  { value: 'hub', label: 'Via Hub', icon: '🏪', desc: 'Hub handles delivery' },
  { value: 'both', label: 'Both', icon: '🔄', desc: 'Either method' },
];

function stockBadge(qty: number) {
  if (qty > 20) return { cls: 'bg-emerald-100 text-emerald-700', text: '✓ Good stock' };
  if (qty > 10) return { cls: 'bg-amber-100 text-amber-700', text: '⚠ Low' };
  return { cls: 'bg-red-100 text-red-700', text: '⚠ Very low' };
}

/** Prices, unit, stock and fulfilment, with what the customer will see and what the kitchen keeps. */
export default function PricingSection({
  form,
  update,
  customUnit,
  onCustomUnit,
  variants,
  menu,
}: {
  form: ProductFormData;
  update: (patch: Partial<ProductFormData>) => void;
  customUnit: string;
  onCustomUnit: (v: string) => void;
  /** The variants editor, shown under the stock. */
  variants: React.ReactNode;
  /** The menu (always / weekly / today) field, shown under the fulfilment. */
  menu: React.ReactNode;
}) {
  const price = parseFloat(form.price);
  const cost = parseFloat(form.costPrice);
  const stock = parseInt(form.stockQuantity, 10);
  const discount = discountPercent(form.price, form.originalPrice);
  const profit = price > 0 && cost > 0 ? profitOf(price, cost) : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center shadow-lg">
          <span className="text-2xl">💰</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Pricing & Stock</h2>
          <p className="text-sm text-gray-500">Set your prices and inventory</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Selling Price <span className="text-red-500">*</span>
          </label>
          <div className="relative group">
            <span className="absolute start-4 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-lg">Rs.</span>
            <input
              type="number"
              id="product-price-input"
              value={form.price}
              onChange={(e) => update({ price: e.target.value })}
              placeholder="299"
              min="0"
              step="any"
              className="w-full ps-14 pe-4 py-3 text-xl font-bold border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all group-hover:border-gray-300"
            />
            {price > 0 && (
              <div className="absolute -top-2 end-2 bg-emerald-700 text-white text-xs px-2 py-0.5 rounded-full font-medium">Customer pays this</div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">💡 Competitive pricing attracts more buyers</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Original Price <span className="text-gray-500 font-normal">(optional - for showing discount)</span>
          </label>
          <div className="relative">
            <span className="absolute start-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">Rs.</span>
            <input
              type="number"
              value={form.originalPrice}
              onChange={(e) => update({ originalPrice: e.target.value })}
              placeholder="350"
              min="0"
              step="any"
              className="w-full ps-14 pe-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>
          {discount > 0 ? (
            <div className="mt-2 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-2">
              <p className="text-green-700 text-sm font-bold flex items-center gap-2">
                <span className="text-lg">🎉</span>
                <span>{discount}% OFF badge will be shown to customers!</span>
              </p>
            </div>
          ) : (
            price > 0 && <p className="text-xs text-gray-500 mt-1">💡 Add original price to show discount percentage</p>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <div className="flex items-center gap-2">
              <span>Your Cost Price</span>
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">🔒 Private</span>
              <span className="text-gray-500 font-normal">(for profit tracking only)</span>
            </div>
          </label>
          <div className="relative">
            <span className="absolute start-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">Rs.</span>
            <input
              type="number"
              value={form.costPrice}
              onChange={(e) => update({ costPrice: e.target.value })}
              placeholder="180"
              min="0"
              step="any"
              className="w-full ps-14 pe-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">💡 Include: ingredients + packaging + labor + overhead costs</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Price is for</label>
          <select
            value={form.unit}
            onChange={(e) => {
              update({ unit: e.target.value });
              if (e.target.value !== 'other') onCustomUnit('');
            }}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          >
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.example})
              </option>
            ))}
          </select>
          {form.unit === 'other' && (
            <input
              type="text"
              value={customUnit}
              onChange={(e) => onCustomUnit(e.target.value)}
              placeholder="e.g., per dozen, per box, per tray"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent mt-2"
            />
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Stock Quantity <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <input
              type="number"
              id="product-stock-input"
              value={form.stockQuantity}
              onChange={(e) => update({ stockQuantity: e.target.value })}
              placeholder="50"
              min="0"
              step="1"
              className="w-full px-4 py-3 text-lg font-semibold border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
            {stock > 0 && (
              <div className="absolute end-3 top-1/2 -translate-y-1/2">
                <span className={`text-xs font-bold px-2 py-1 rounded-full ${stockBadge(stock).cls}`}>{stockBadge(stock).text}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1">📦 How many units you have available</p>
        </div>
      </div>

      {variants}

      <div className="mt-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Fulfillment Method</label>
        <div className="grid grid-cols-3 gap-3">
          {FULFILMENT.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => update({ stockType: option.value })}
              className={`p-3 rounded-xl border-2 text-start transition-all ${
                form.stockType === option.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <span className="text-xl">{option.icon}</span>
              <p className="font-medium text-sm text-gray-900 mt-1">{option.label}</p>
              <p className="text-xs text-gray-500">{option.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {menu}

      {form.price && (
        <div className="mt-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
          <p className="text-sm text-gray-500 mb-1">Customers will see:</p>
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold text-gray-900">Rs. {form.price}</span>
            {discount > 0 && (
              <>
                <span className="text-lg text-gray-500 line-through">Rs. {form.originalPrice}</span>
                <span className="bg-green-700 text-white px-2 py-0.5 rounded-full text-sm font-bold">{discount}% OFF</span>
              </>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {form.unit === 'other' ? customUnit : UNIT_OPTIONS.find((u) => u.value === form.unit)?.label}
          </p>
        </div>
      )}

      {profit && (
        <div className="mt-4 bg-gradient-to-r from-emerald-50 to-green-50 rounded-xl p-4 border border-emerald-200">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">💰</span>
            <p className="text-sm font-semibold text-emerald-800">Your Profit Breakdown (Private)</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Selling Price</span>
              <span className="font-medium">Rs. {form.price}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Your Cost</span>
              <span className="font-medium text-red-600">- Rs. {form.costPrice}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Platform Fee (15%)</span>
              <span className="font-medium text-red-600">- Rs. {profit.fee.toFixed(0)}</span>
            </div>
            <div className="border-t border-emerald-200 pt-2 mt-2">
              <div className="flex justify-between">
                <span className="font-semibold text-emerald-800">Your Profit</span>
                <span className={`font-bold text-lg ${profit.profit > 0 ? 'text-emerald-600' : 'text-red-600'}`}>Rs. {profit.profit.toFixed(0)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-xs text-gray-500">Profit Margin</span>
                <span
                  className={`text-sm font-semibold ${
                    profit.margin > 20 ? 'text-emerald-600' : profit.margin > 10 ? 'text-amber-600' : 'text-red-600'
                  }`}
                >
                  {profit.margin.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
