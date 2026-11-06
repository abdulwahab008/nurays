'use client';

import { Button } from '@/components/ui/button';
import { MAX_VARIANTS, PRODUCT_FIELD, VariantDraft, profitOf } from '@/lib/product-form';
import { FieldError, fieldClass, useFieldError } from './fields';

const input = `${fieldClass} tabular-nums`;

const Label = ({ children }: { children: React.ReactNode }) => <span className="mb-1.5 block text-sm text-muted">{children}</span>;

function MoneyInput({
  value,
  onChange,
  placeholder,
  label,
}: {
  value?: number;
  onChange: (v: number | undefined) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <span className="relative block">
        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-muted">Rs</span>
        <input
          type="number"
          value={value || ''}
          onChange={(e) => onChange(parseFloat(e.target.value) || undefined)}
          placeholder={placeholder}
          min="0"
          className={`${input} ps-10`}
        />
      </span>
    </label>
  );
}

function VariantNameInput({ index, value, onChange }: { index: number; value: string; onChange: (name: string) => void }) {
  const id = PRODUCT_FIELD.variantName(index);
  const { inputProps, errorClass } = useFieldError(id);
  return (
    <input
      type="text"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="e.g. Small pack (6 pieces)"
      {...inputProps}
      className={`${fieldClass} ${errorClass}`}
    />
  );
}

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
    <div className="mt-8 border-t border-line pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Sizes and packs
            {variants.length > 0 && (
              <span className="ms-2 rounded-full bg-raised px-2 py-0.5 text-xs font-medium text-muted tabular-nums">{variants.length}</span>
            )}
          </h3>
          <p className="mt-1 text-sm text-muted">Sell the dish in more than one size, each with its own price and stock. For example small (6 pieces) and large (12 pieces).</p>
        </div>
        <Button type="button" variant="outline" onClick={onToggle} aria-expanded={open}>
          {open ? 'Hide sizes' : mode === 'edit' ? 'Manage sizes' : 'Add sizes'}
        </Button>
      </div>

      {open && (
        <div className="mt-5 space-y-4">
          {variants.map((variant, index) => {
            const profit = variant.price && variant.costPrice ? profitOf(variant.price, variant.costPrice) : null;
            return (
              <div key={variant.id || `new-${index}`} className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h4 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                    {mode === 'edit' && !variant.id ? 'New size' : 'Size'} {index + 1}
                    {variant.isDefault && (
                      <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand-soft-ink">Shown first</span>
                    )}
                  </h4>
                  <div className="flex items-center gap-1">
                    {!variant.isDefault && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onMakeDefault(index)} className="min-h-11">
                        Show first
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(index)}
                      aria-label={`Remove variant ${index + 1}`}
                      className="min-h-11 text-red-700 hover:bg-red-50"
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block">
                      <Label>Name</Label>
                      <VariantNameInput index={index} value={variant.name} onChange={(name) => onUpdate(index, { name })} />
                    </label>
                    <FieldError id={PRODUCT_FIELD.variantName(index)} />
                  </div>
                  <label className="col-span-2 block">
                    <Label>Name in Urdu (optional)</Label>
                    <input
                      type="text"
                      value={variant.nameUrdu || ''}
                      onChange={(e) => onUpdate(index, { nameUrdu: e.target.value })}
                      placeholder="چھوٹا پیک (6 عدد)"
                      className={`${fieldClass} text-end`}
                      dir="rtl"
                    />
                  </label>
                  <MoneyInput label="Price" value={variant.price} onChange={(v) => onUpdate(index, { price: v || 0 })} placeholder="300" />
                  <MoneyInput
                    label="Before discount"
                    value={variant.originalPrice}
                    onChange={(v) => onUpdate(index, { originalPrice: v })}
                    placeholder="350"
                  />
                  <MoneyInput label="Your cost" value={variant.costPrice} onChange={(v) => onUpdate(index, { costPrice: v })} placeholder="180" />
                  <label className="block">
                    <Label>How many you have</Label>
                    <input
                      type="number"
                      value={variant.stockQuantity || ''}
                      onChange={(e) => onUpdate(index, { stockQuantity: parseInt(e.target.value, 10) || 0 })}
                      placeholder="50"
                      min="0"
                      className={input}
                    />
                  </label>
                  <label className="block">
                    <Label>Warn me below</Label>
                    <input
                      type="number"
                      value={variant.stockThreshold || ''}
                      onChange={(e) => onUpdate(index, { stockThreshold: parseInt(e.target.value, 10) || undefined })}
                      placeholder="10"
                      min="0"
                      className={input}
                    />
                  </label>
                  <label className="block">
                    <Label>SKU or barcode (optional)</Label>
                    <input
                      type="text"
                      value={variant.sku || ''}
                      onChange={(e) => onUpdate(index, { sku: e.target.value })}
                      placeholder="SM-SAMOSA-6PC"
                      className={fieldClass}
                    />
                  </label>
                  {profit && (
                    <p className="col-span-2 flex justify-between gap-4 text-sm">
                      <span className="text-muted">You keep for each one</span>
                      <span className={`font-semibold tabular-nums ${profit.profit > 0 ? 'text-ink' : 'text-red-700'}`}>
                        Rs {profit.profit.toFixed(0)}
                        <span className="ms-1 font-normal text-muted">({profit.margin.toFixed(1)}%)</span>
                      </span>
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          <Button type="button" variant="outline" onClick={onAdd} disabled={variants.length >= MAX_VARIANTS} className="w-full border-dashed">
            Add a size {variants.length > 0 && `(${variants.length} of ${MAX_VARIANTS})`}
          </Button>

          <p className="text-sm text-muted">
            The size shown first is picked unless the customer changes it. Up to {MAX_VARIANTS} sizes.
            {mode === 'edit' && ' Removed sizes are deleted when you save.'}
          </p>
        </div>
      )}
    </div>
  );
}
