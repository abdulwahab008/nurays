import { imageVariant } from '@/lib/utils';

interface Props {
  /** The real uploaded image, if there is one. */
  src?: string | null;
  alt: string;
  /** Name used for the placeholder initial when there is no image. */
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Eager-load images above the fold. */
  eager?: boolean;
}

/**
 * A real photo, or a neutral placeholder with the name's initial. Never a stock
 * photo: showing someone else's food as a kitchen's dish is misleading.
 */
export function CoverImage({ src, alt, label, size = 'md', className = '', eager = false }: Props) {
  if (src) {
    return (
      <img
        src={imageVariant(src, size)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className={`object-cover ${className}`}
      />
    );
  }
  const initial = (label || alt || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      role="img"
      aria-label={alt}
      className={`flex items-center justify-center bg-gradient-to-br from-orange-100 via-amber-50 to-slate-100 text-orange-300 font-black select-none ${className}`}
    >
      <span className={size === 'sm' ? 'text-base' : size === 'md' ? 'text-3xl' : 'text-5xl'}>{initial}</span>
    </div>
  );
}

export default CoverImage;
