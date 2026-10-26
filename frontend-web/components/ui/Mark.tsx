import { cn } from '@/lib/utils';

interface MarkProps {
  size?: number;
  className?: string;
}

/** The logo tile: a turquoise square with a dark "n" and a yellow dot (public/brand/nuray-mark.svg is the same drawing). */
export function Mark({ size = 36, className }: MarkProps) {
  return (
    <svg className={cn('shrink-0', className)} width={size} height={size} viewBox="0 0 96 96" aria-hidden>
      <rect width="96" height="96" rx="28" fill="#41DAC7" />
      <path d="M33 70V45a15 15 0 0 1 30 0v25" fill="none" stroke="#06302B" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="74" cy="22" r="8" fill="#FFC83D" />
    </svg>
  );
}

export function Wordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('font-extrabold text-ink', className)} style={{ fontSize: size, lineHeight: 1, letterSpacing: '-0.03em' }}>
      nuray
    </span>
  );
}

export function BrandLockup({ markSize = 36, wordSize = 24 }: { markSize?: number; wordSize?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <Mark size={markSize} />
      <Wordmark size={wordSize} />
    </span>
  );
}
