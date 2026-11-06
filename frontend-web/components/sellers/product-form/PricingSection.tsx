'use client';

import { PRODUCT_FIELD, ProductFormData, UNIT_OPTIONS, discountPercent, profitOf } from '@/lib/product-form';
import { FieldError, FormSection, fieldClass, hintClass, labelClass, useFieldError } from './fields';

function stockBadge(qty: number) {
  if (qty > 20) return { cls: 'bg-brand-soft text-brand-soft-ink', text: 'Good stock' };
  if (qty > 10) return { cls: 'bg-accent-soft text-accent-soft-ink', text: 'Low' };
  return { cls: 'bg-red-50 text-red-700', text: 'Very low' };
}

function MoneyField({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const { inputProps, errorClass } = useFieldError(id);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-muted">Rs</span>
      <input
        type="number"
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min="0"
        step="any"
        {...inputProps}
        className={`${fieldClass} ps-10 tabular-nums ${errorClass}`}
      />
    </div>
  );
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex items-baseline justify-between gap-4 py-2">
    <dt className="text-sm text-muted">{label}</dt>
    <dd className="text-sm text-ink tabular-nums">{value}</dd>
  </div>
);

/** Prices, unit and stock, with what the customer will see and what the kitchen keeps. */
export default function PricingSection({
  form,
  update,
  customUnit,
  onCustomUnit,
  variants,
}: {
  form: ProductFormData;
  update: (patch: Partial<ProductFormData>) => void;
  customUnit: string;
  onCustomUnit: (v: string) => void;
  /** The variants editor, shown under the stock. */
  variants: React.ReactNode;
}) {
  const price = parseFloat(form.price);
  const cost = parseFloat(form.costPrice);
  const stock = parseInt(form.stockQuantity, 10);
  const discount = discountPercent(form.price, form.originalPrice);
  const profit = price > 0 && cost > 0 ? profitOf(price, cost) : null;
  const customUnitError = useFieldError(PRODUCT_FIELD.customUnit);
  const stockError = useFieldError(PRODUCT_FIELD.stock);
  const unitLabel = form.unit === 'other' ? customUnit : UNIT_OPTIONS.find((u) => u.value === form.unit)?.label;

  return (
    <FormSection id="dish-price" title="Price and stock">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <label htmlFor="product-price-input" className={labelClass}>
            Price
          </label>
          <MoneyField id="product-price-input" value={form.price} onChange={(v) => update({ price: v })} placeholder="299" />
          <FieldError id={PRODUCT_FIELD.price} />
          <p className={hintClass}>What the customer pays.</p>
        </div>

        <div>
          <label htmlFor="product-original-price-input" className={labelClass}>
            Price before discount <span className="font-normal text-muted">(optional)</span>
          </label>
          <MoneyField
            id="product-original-price-input"
            value={form.originalPrice}
            onChange={(v) => update({ originalPrice: v })}
            placeholder="350"
          />
          <FieldError id={PRODUCT_FIELD.originalPrice} />
          <p className={hintClass}>
            {discount > 0 ? <span className="text-brand-ink">Customers see {discount}% off.</span> : 'Set it higher than the price to show a discount.'}
          </p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="product-cost-price-input" className={labelClass}>
            What it costs you to make <span className="font-normal text-muted">(optional, only you see it)</span>
          </label>
          <MoneyField id="product-cost-price-input" value={form.costPrice} onChange={(v) => update({ costPrice: v })} placeholder="180" />
          <p className={hintClass}>Ingredients, packaging and your time, so we can show what you keep.</p>
        </div>

        <div>
          <label htmlFor="product-unit-select" className={labelClass}>
            Price is for
          </label>
          <select
            id="product-unit-select"
            value={form.unit}
            onChange={(e) => {
              update({ unit: e.target.value });
              if (e.target.value !== 'other') onCustomUnit('');
            }}
            className={fieldClass}
          >
            {UNIT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.example})
              </option>
            ))}
          </select>
          {form.unit === 'other' && (
            <>
              <input
                type="text"
                id={PRODUCT_FIELD.customUnit}
                aria-label="Your own unit"
                value={customUnit}
                onChange={(e) => onCustomUnit(e.target.value)}
                placeholder="e.g. per dozen, per box, per tray"
                {...customUnitError.inputProps}
                className={`${fieldClass} mt-2 ${customUnitError.errorClass}`}
              />
              <FieldError id={PRODUCT_FIELD.customUnit} />
            </>
          )}
        </div>

        <div>
          <label htmlFor="product-stock-input" className={`${labelClass} flex items-center justify-between gap-2`}>
            <span>How many you have</span>
            {stock > 0 && (
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${stockBadge(stock).cls}`}>{stockBadge(stock).text}</span>
            )}
          </label>
          <input
            type="number"
            id="product-stock-input"
            value={form.stockQuantity}
            onChange={(e) => update({ stockQuantity: e.target.value })}
            placeholder="50"
            min="0"
            step="1"
            {...stockError.inputProps}
            className={`${fieldClass} tabular-nums ${stockError.errorClass}`}
          />
          <FieldError id={PRODUCT_FIELD.stock} />
          {form.stockQuantity.trim() === '0' && <p className={hintClass}>Sold out: customers cannot order it until you add more.</p>}
        </div>
      </div>

      {form.price && (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted">Customers see</p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="text-2xl font-semibold text-ink tabular-nums">Rs {form.price}</span>
              {discount > 0 && (
                <>
                  <span className="text-sm text-muted line-through tabular-nums">Rs {form.originalPrice}</span>
                  <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-ink">{discount}% off</span>
                </>
              )}
            </p>
            {unitLabel && <p className="text-sm text-muted">{unitLabel}</p>}
          </div>

          {profit && (
            <div>
              <p className="text-sm text-muted">You keep, only you see this</p>
              <dl className="mt-1 divide-y divide-line">
                <Row label="Price" value={`Rs ${form.price}`} />
                <Row label="Your cost" value={`− Rs ${form.costPrice}`} />
                <Row label="Nuray fee (15%)" value={`− Rs ${profit.fee.toFixed(0)}`} />
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="text-sm font-semibold text-ink">You keep</dt>
                  <dd className={`text-[15px] font-semibold tabular-nums ${profit.profit > 0 ? 'text-ink' : 'text-red-700'}`}>
                    Rs {profit.profit.toFixed(0)}
                    <span className="ms-2 text-sm font-normal text-muted">{profit.margin.toFixed(1)}%</span>
                  </dd>
                </div>
              </dl>
            </div>
          )}
        </div>
      )}

      {variants}
    </FormSection>
  );
}
