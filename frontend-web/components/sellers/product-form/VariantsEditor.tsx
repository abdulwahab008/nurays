'use client';

import { Button } from '@/components/ui/button';
import { MAX_VARIANTS, PRODUCT_FIELD, VariantDraft, profitOf } from '@/lib/product-form';
import { FieldError, fieldClass, useFieldError } from './fields';
import { useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';
import { StatusPill } from '@/components/ui/StatusPill';

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
  const t = useT(kitchenProductFormMessages);
  return (
    <input
      type="text"
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={t('sizeNamePlaceholder')}
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
  const t = useT(kitchenProductFormMessages);
  return (
    <div className="mt-8 border-t border-line pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            {t('sizes')}
            {variants.length > 0 && <StatusPill className="ms-2 tabular-nums">{variants.length}</StatusPill>}
          </h3>
          <p className="mt-1 text-sm text-muted">{t('sizesHint')}</p>
        </div>
        <Button type="button" variant="outline" onClick={onToggle} aria-expanded={open}>
          {open ? t('hideSizes') : mode === 'edit' ? t('manageSizes') : t('addSizes')}
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
                    {mode === 'edit' && !variant.id ? t('newSize', { n: index + 1 }) : t('size', { n: index + 1 })}
                    {variant.isDefault && <StatusPill tone="good">{t('shownFirst')}</StatusPill>}
                  </h4>
                  <div className="flex items-center gap-1">
                    {!variant.isDefault && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => onMakeDefault(index)} className="min-h-11">
                        {t('showFirst')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(index)}
                      aria-label={t('removeSizeLabel', { n: index + 1 })}
                      className="min-h-11 text-red-700 hover:bg-red-50"
                    >
                      {t('remove')}
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block">
                      <Label>{t('name')}</Label>
                      <VariantNameInput index={index} value={variant.name} onChange={(name) => onUpdate(index, { name })} />
                    </label>
                    <FieldError id={PRODUCT_FIELD.variantName(index)} />
                  </div>
                  <label className="col-span-2 block">
                    <Label>{t('sizeNameUrdu')}</Label>
                    <input
                      type="text"
                      value={variant.nameUrdu || ''}
                      onChange={(e) => onUpdate(index, { nameUrdu: e.target.value })}
                      placeholder="چھوٹا پیک (6 عدد)"
                      className={`${fieldClass} text-end`}
                      dir="rtl"
                    />
                  </label>
                  <MoneyInput label={t('price')} value={variant.price} onChange={(v) => onUpdate(index, { price: v || 0 })} placeholder="300" />
                  <MoneyInput
                    label={t('beforeDiscount')}
                    value={variant.originalPrice}
                    onChange={(v) => onUpdate(index, { originalPrice: v })}
                    placeholder="350"
                  />
                  <MoneyInput label={t('yourCost')} value={variant.costPrice} onChange={(v) => onUpdate(index, { costPrice: v })} placeholder="180" />
                  <label className="block">
                    <Label>{t('howMany')}</Label>
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
                    <Label>{t('warnBelow')}</Label>
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
                    <Label>{t('sku')}</Label>
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
                      <span className="text-muted">{t('keepEach')}</span>
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
            {t('addSize')} {variants.length > 0 && t('sizeCount', { count: variants.length, max: MAX_VARIANTS })}
          </Button>

          <p className="text-sm text-muted">
            {t('sizesFoot', { max: MAX_VARIANTS })}
            {mode === 'edit' && ` ${t('sizesFootEdit')}`}
          </p>
        </div>
      )}
    </div>
  );
}
