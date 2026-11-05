'use client';

import { ProductFormData } from '@/lib/product-form';
import { FormSection, SwitchRow, chipClass, fieldClass, hintClass, labelClass, textareaClass } from './fields';

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
    <FormSection id="dish-details" title="Dish">
      <div className="space-y-6">
        <div>
          <label htmlFor="product-name-input" className={labelClass}>
            Name
          </label>
          <input
            type="text"
            id="product-name-input"
            value={form.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Chicken samosa (pack of 12)"
            maxLength={100}
            className={fieldClass}
          />
          <div className="mt-1.5 flex justify-between gap-3 text-sm text-muted">
            <span>Say the size or how many are in it.</span>
            <span className="tabular-nums">{form.name.length}/100</span>
          </div>
        </div>

        <div>
          <label htmlFor="product-name-urdu-input" className={labelClass}>
            Name in Urdu <span className="font-normal text-muted">(optional)</span>
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
          <p className={hintClass}>Helps customers who search in Urdu find it.</p>
        </div>

        {categoryPicker}

        <div>
          <p className={labelClass}>Time to cook and pack</p>
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
                {preset.label} ({preset.mins} min)
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label htmlFor="product-prep-time-input" className={labelClass}>
                Minutes to get it ready
              </label>
              <input
                type="number"
                id="product-prep-time-input"
                value={form.preparationTime}
                onChange={(e) => update({ preparationTime: e.target.value })}
                placeholder="e.g. 30"
                min="1"
                className={`${fieldClass} tabular-nums`}
              />
              <p className={hintClass}>From accepting the order to handing it over. Riders are sent to arrive about then.</p>
            </div>
            <div>
              <label htmlFor="product-shelf-life-input" className={labelClass}>
                Stays fresh for (hours) <span className="font-normal text-muted">(optional)</span>
              </label>
              <input
                type="number"
                id="product-shelf-life-input"
                value={form.shelfLifeHours}
                onChange={(e) => update({ shelfLifeHours: e.target.value })}
                placeholder="e.g. 24"
                min="1"
                className={`${fieldClass} tabular-nums`}
              />
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="product-description-input" className={labelClass}>
            Description <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="product-description-input"
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What it tastes like, what is in it, and when it is good to eat."
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
            Ingredients <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id="product-ingredients-input"
            value={form.ingredients}
            onChange={(e) => update({ ingredients: e.target.value })}
            placeholder="e.g. Chicken mince, wheat flour, onions, cumin, coriander, red chilli, salt, oil"
            rows={2}
            maxLength={300}
            className={textareaClass}
          />
          <div className="mt-1.5 flex justify-end text-sm text-muted">
            <span className="tabular-nums">{form.ingredients.length}/300</span>
          </div>
        </div>

        <SwitchRow checked={form.isHalal} onChange={() => update({ isHalal: !form.isHalal })} label="Halal" />
      </div>
    </FormSection>
  );
}
