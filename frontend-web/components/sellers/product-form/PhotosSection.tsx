'use client';

import { useRef } from 'react';
import { MAX_IMAGES } from '@/lib/product-form';
import { FormSection } from './fields';
import { useT } from '@/lib/i18n';
import { kitchenProductFormMessages } from '@/lib/i18n/messages/kitchen-product-form';

export interface ProductImage {
  /** Set for a photo already saved on the dish. */
  id?: string;
  /** Its stored URL, for a saved photo. */
  url?: string;
  /** A photo picked now, uploaded on save. */
  file?: File;
  preview: string;
  isPrimary: boolean;
}

/** Up to four photos; the first is the main one. Picking more than fit keeps the first that do. */
export default function PhotosSection({
  images,
  onChange,
  onTooMany,
}: {
  images: ProductImage[];
  onChange: (update: (prev: ProductImage[]) => ProductImage[]) => void;
  onTooMany: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const t = useT(kitchenProductFormMessages);

  const add = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const room = MAX_IMAGES - images.length;
    if (files.length > room) onTooMany();
    files.slice(0, Math.max(room, 0)).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const preview = event.target?.result as string;
        onChange((prev) => (prev.length >= MAX_IMAGES ? prev : [...prev, { file, preview, isPrimary: prev.length === 0 }]));
      };
      reader.readAsDataURL(file);
    });
  };

  const remove = (index: number) =>
    onChange((prev) => {
      const left = prev.filter((_, i) => i !== index);
      if (prev[index]?.isPrimary && left.length > 0) left[0] = { ...left[0], isPrimary: true };
      return left;
    });

  return (
    <FormSection id="dish-photos" title={t('photos')} hint={t('photosHint')}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {images.map((img, index) => (
          <div
            key={img.id || img.preview.slice(-32) + index}
            className="relative aspect-square rounded-xl overflow-hidden border border-line bg-raised group"
          >
            <img src={img.preview} alt={t('photoAlt', { n: index + 1 })} className="w-full h-full object-cover" />
            {img.isPrimary && (
              <span className="absolute top-2 start-2 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-ink">{t('mainPhoto')}</span>
            )}
            {img.id && <span className="absolute bottom-2 start-2 rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-muted">{t('savedPhoto')}</span>}
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={t('removePhoto', { n: index + 1 })}
              className="absolute top-1 end-1 flex h-11 w-11 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface text-ink shadow-sm">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          </div>
        ))}

        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-xl border border-dashed border-line-strong bg-surface hover:bg-raised transition-colors flex flex-col items-center justify-center gap-2 text-brand-ink focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span className="text-sm font-medium">{images.length === 0 ? t('addPhotos') : t('addMorePhotos', { count: MAX_IMAGES - images.length })}</span>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={add} className="hidden" />
      </div>
    </FormSection>
  );
}
