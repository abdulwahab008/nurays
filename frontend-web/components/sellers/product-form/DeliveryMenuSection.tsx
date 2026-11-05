'use client';

import { ProductFormData, StockType } from '@/lib/product-form';
import { FormSection, labelClass, optionClass } from './fields';

const FULFILMENT: Array<{ value: StockType; label: string; desc: string }> = [
  { value: 'direct', label: 'Direct delivery', desc: 'From your kitchen to the customer' },
  { value: 'hub', label: 'Through a hub', desc: 'A hub handles delivery' },
  { value: 'both', label: 'Both', desc: 'Either way' },
];

/** How the dish reaches customers, and which menu it is on. */
export default function DeliveryMenuSection({
  form,
  update,
  menu,
}: {
  form: ProductFormData;
  update: (patch: Partial<ProductFormData>) => void;
  /** The menu (always / weekly / today) field. */
  menu: React.ReactNode;
}) {
  return (
    <FormSection id="dish-delivery" title="Delivery and menu">
      <div role="group" aria-labelledby="fulfilment-label">
        <p id="fulfilment-label" className={labelClass}>
          How it reaches customers
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FULFILMENT.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={form.stockType === option.value}
              onClick={() => update({ stockType: option.value })}
              className={optionClass(form.stockType === option.value)}
            >
              <span className="block text-[15px] font-semibold text-ink">{option.label}</span>
              <span className="mt-0.5 block text-sm text-muted">{option.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {menu}
    </FormSection>
  );
}
