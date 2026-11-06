'use client';

import { PRODUCT_FIELD, ProductFormData } from '@/lib/product-form';
import { FieldError, FormSection, SwitchRow, chipClass, fieldClass, hintClass, labelClass, textareaClass, useFieldError } from './fields';
import { useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';

const PREP_PRESETS = [
  { label: 'preset.burger', mins: 15 },
  { label: 'preset.shawarma', mins: 20 },
  { label: 'preset.pasta', mins: 25 },
  { label: 'preset.biryani', mins: 30 },
  { label: 'preset.karahi', mins: 45 },
] as const;

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
  const nameError = useFieldError(PRODUCT_FIELD.name);
  const t = useT(kitchenProductFormMessages);
  const optional = <span className="font-normal text-muted">{t('optional')}</span>;
  return (
    <FormSection id="dish-details" title={t('dish')}>
      <div className="space-y-6">
        <div>
          <label htmlFor="product-name-input" className={labelClass}>
            {t('name')}
          </label>
          <input
            type="text"
            id="product-name-input"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder={t('namePlaceholder')}
            maxLength={100}
            {...nameError.inputProps}
            className={`${fieldClass} ${nameError.errorClass}`}
          />
          <FieldError id={PRODUCT_FIELD.name} />
          <div className="mt-1.5 flex justify-between gap-3 text-sm text-muted">
            <span>{t('nameHint')}</span>
            <span className="tabular-nums">{form.name.length}/100</span>
          </div>
        </div>

        <div>
          <label htmlFor="product-name-urdu-input" className={labelClass}>
            {t('nameUrdu')} {optional}
          </label>
          <input
            type="text"
            id="product-name-urdu-input"
            value={form.nameUrdu}
            onChange={(e) => update({ nameUrdu: e.target.value })}
            placeholder="مثال: چکن سموسہ (12 کا پیک)"
            maxLength={100}
            className={`${fieldClass} text-end`}
            dir="rtl"
          />
          <p className={hintClass}>{t('nameUrduHint')}</p>
        </div>

        <div id={PRODUCT_FIELD.category} tabIndex={-1} className="space-y-6 rounded-xl focus:outline-none">
          {categoryPicker}
          <FieldError id={PRODUCT_FIELD.category} />
        </div>

        <div>
          <p className={labelClass}>{t('prepTitle')}</p>
          <div className="flex flex-wrap gap-2">
            {PREP_PRESETS.map((preset) => (
              <button
                key={preset.label}
                id={`prep-preset-${preset.mins}`}
                type="button"
                aria-pressed={form.preparationTime === String(preset.mins)}
                onClick={() => update({ preparationTime: String(preset.mins) })}
                className={chipClass(form.preparationTime === String(preset.mins))}
              >
                {t('presetMinutes', { label: t(preset.label), min: preset.mins })}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="product-prep-time-input" className={labelClass}>
                {t('prepMinutes')}
              </label>
              <input
                type="number"
                id="product-prep-time-input"
                value={form.preparationTime}
                onChange={(e) => update({ preparationTime: e.target.value })}
                placeholder={t('prepPlaceholder')}
                min="1"
                className={`${fieldClass} tabular-nums`}
              />
              <p className={hintClass}>{t('prepHint')}</p>
            </div>
            <div>
              <label htmlFor="product-shelf-life-input" className={labelClass}>
                {t('shelfLife')} {optional}
              </label>
              <input
                type="number"
                id="product-shelf-life-input"
                value={form.shelfLifeHours}
                onChange={(e) => update({ shelfLifeHours: e.target.value })}
                placeholder={t('shelfPlaceholder')}
                min="1"
                className={`${fieldClass} tabular-nums`}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="product-description-input" className={labelClass}>
            {t('description')} {optional}
          </label>
          <textarea
            id="product-description-input"
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder={t('descriptionPlaceholder')}
            rows={4}
            maxLength={500}
            className={textareaClass}
          />
          <div className="mt-1.5 flex justify-end text-sm text-muted">
            <span className="tabular-nums">{form.description.length}/500</span>
          </div>
        </div>

        <div>
          <label htmlFor="product-ingredients-input" className={labelClass}>
            {t('ingredients')} {optional}
          </label>
          <textarea
            id="product-ingredients-input"
            value={form.ingredients}
            onChange={(e) => update({ ingredients: e.target.value })}
            placeholder={t('ingredientsPlaceholder')}
            rows={2}
            maxLength={300}
            className={textareaClass}
          />
          <div className="mt-1.5 flex justify-end text-sm text-muted">
            <span className="tabular-nums">{form.ingredients.length}/300</span>
          </div>
        </div>

        <SwitchRow checked={form.isHalal} onChange={() => update({ isHalal: !form.isHalal })} label={t('halal')} />
      </div>
    </FormSection>
  );
}
