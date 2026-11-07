'use client';

import { ProductFormData, StockType } from '@/lib/product-form';
import { FormSection, labelClass, optionClass } from './fields';
import { useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';

const FULFILMENT: StockType[] = ['direct', 'hub', 'both'];

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
  const t = useT(kitchenProductFormMessages);
  return (
    <FormSection id="dish-delivery" title={t('deliveryMenu')}>
      <div role="group" aria-labelledby="fulfilment-label">
        <p id="fulfilment-label" className={labelClass}>
          {t('howReaches')}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {FULFILMENT.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={form.stockType === option}
              onClick={() => update({ stockType: option })}
              className={optionClass(form.stockType === option)}
            >
              <span className="block text-[15px] font-semibold text-ink">{t(`fulfil.${option}`)}</span>
              <span className="mt-0.5 block text-sm text-muted">{t(`fulfil.${option}.desc`)}</span>
            </button>
          ))}
        </div>
      </div>

      {menu}
    </FormSection>
  );
}
