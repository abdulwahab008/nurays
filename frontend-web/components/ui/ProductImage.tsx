import { UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Applied to the <img> for hover effects etc. */
  imgClassName?: string;
}

/**
 * Product thumbnail with a branded fallback. Replaces the bare
 * "No images attached" grey void with an on-brand cream tile + utensil mark
 * so image-less listings still look intentional.
 */
export function ProductImage({ src, alt, className, imgClassName }: ProductImageProps) {
  return (
    <div className={cn('relative overflow-hidden bg-cream-100', className)}>
      {src ? (
        <img src={src} alt={alt} className={cn('w-full h-full object-cover', imgClassName)} />
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-forest-300"
          style={{ background: 'linear-gradient(135deg, var(--cream-100), var(--cream-200))' }}
          aria-label={`${alt} — no photo yet`}
        >
          <UtensilsCrossed className="w-7 h-7" strokeWidth={1.5} />
          <span className="text-[11px] font-medium tracking-wide text-ink-400">No photo yet</span>
        </div>
      )}
    </div>
  );
}
