import { cn } from '@/lib/utils';

interface MarkProps {
  size?: number;
  className?: string;
}

export function Mark({ size = 32, className }: MarkProps) {
  return (
    <span
      className={cn('brand-mark', className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span style={{ fontSize: size * 0.62, marginTop: size * 0.04 }}>N</span>
    </span>
  );
}

export function Wordmark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('font-display italic', className)}
      style={{
        fontSize: size,
        fontWeight: 400,
        letterSpacing: '-0.02em',
        color: 'var(--ink-900)',
        fontVariationSettings: '"opsz" 144',
      }}
    >
      nuray
    </span>
  );
}

export function BrandLockup({ markSize = 32, wordSize = 28 }: { markSize?: number; wordSize?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Mark size={markSize} />
      <Wordmark size={wordSize} />
    </span>
  );
}
