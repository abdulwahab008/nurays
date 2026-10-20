'use client';

import { useRef } from 'react';
import { MAX_IMAGES } from '@/lib/product-form';

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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-6 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
          <span className="text-2xl">📸</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Product Photos</h2>
          <p className="text-sm text-gray-500">Upload 1-4 images • First image will be the main photo</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        {images.map((img, index) => (
          <div
            key={img.id || img.preview.slice(-32) + index}
            className="relative aspect-square rounded-xl overflow-hidden border-2 border-gray-200 group hover:border-purple-400 transition-all"
          >
            <img src={img.preview} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
            {img.isPrimary && (
              <div className="absolute top-2 start-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-md">
                Main Photo
              </div>
            )}
            {img.id && (
              <div className="absolute bottom-2 start-2 bg-gray-800 text-white text-xs px-2 py-1 rounded-full opacity-75">Saved</div>
            )}
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove photo ${index + 1}`}
              className="absolute top-2 end-2 bg-red-500 hover:bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}

        {images.length < MAX_IMAGES && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 transition-all flex flex-col items-center justify-center gap-2 text-purple-600 hover:text-purple-700 group"
          >
            <div className="w-12 h-12 rounded-full bg-purple-100 group-hover:bg-purple-200 flex items-center justify-center transition-colors">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <span className="text-xs font-semibold">
              {images.length === 0 ? 'Add Photos' : `Add More (${MAX_IMAGES - images.length} left)`}
            </span>
          </button>
        )}
        <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={add} className="hidden" />
      </div>

      <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">💡</span>
          <div>
            <p className="text-sm font-bold text-purple-900 mb-2">Photo Tips for Better Sales:</p>
            <ul className="text-xs text-purple-800 space-y-1">
              <li>• Use good lighting - natural light works best</li>
              <li>• Show product from multiple angles</li>
              <li>• Include size reference (hand, coin, etc.)</li>
              <li>• Clean background makes product stand out</li>
              <li>• First photo is most important - make it count!</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
