'use client';

import { cn } from '@/lib/utils';

interface MarkProps {
  size?: number;
  className?: string;
}

export function Mark({ size = 36, className }: MarkProps) {
  return (
    <span
      className={cn('relative inline-flex items-center justify-center rounded-2xl p-[2px] transition-all duration-300 hover:scale-105', className)}
      style={{
        width: size,
        height: size,
        background: 'linear-gradient(135deg, #FF5500 0%, #FF2A00 50%, #00E5FF 100%)',
        boxShadow: '0 4px 16px -2px rgba(255, 85, 0, 0.4)',
      }}
      aria-hidden
    >
      <span className="flex h-full w-full items-center justify-center rounded-[14px] bg-[#0C0F14] text-white">
        {/* Flame & Ice dynamic SVG icon */}
        <svg
          width={size * 0.58}
          height={size * 0.58}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M12 2C12 2 16.5 6.5 16.5 11C16.5 12.38 15.94 13.63 15.04 14.54C14.13 13.63 13.57 12.38 13.57 11C13.57 9.8 14.1 8.72 14.93 8C13.5 8.5 11.5 10 11.5 13C11.5 14.66 12.84 16 14.5 16C15.08 16 15.62 15.83 16.08 15.54C15.25 18.23 12.75 20.2 9.77 20.2C6.03 20.2 3 17.17 3 13.43C3 8.5 7.5 5 12 2Z"
            fill="url(#mark-flame-grad)"
          />
          <path
            d="M19 14.5C19 18.09 16.09 21 12.5 21C11.55 21 10.65 20.8 9.84 20.44C11.23 19.34 12.13 17.65 12.13 15.75C12.13 14.15 11.5 12.7 10.5 11.63C11.5 12.5 12.8 13 14.25 13C16.87 13 19 10.87 19 8.25C19 7.78 18.93 7.33 18.8 6.9C20.17 8.35 21 10.33 21 12.5C21 13.2 20.88 13.88 20.66 14.5H19Z"
            fill="url(#mark-frost-grad)"
            opacity="0.9"
          />
          <defs>
            <linearGradient id="mark-flame-grad" x1="3" y1="2" x2="16.5" y2="20.2" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF7A00" />
              <stop offset="1" stopColor="#FF2A00" />
            </linearGradient>
            <linearGradient id="mark-frost-grad" x1="12" y1="7" x2="21" y2="21" gradientUnits="userSpaceOnUse">
              <stop stopColor="#00E5FF" />
              <stop offset="1" stopColor="#0088FF" />
            </linearGradient>
          </defs>
        </svg>
      </span>
    </span>
  );
}

export function Wordmark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 tracking-tight font-extrabold', className)}
      style={{
        fontSize: size,
        lineHeight: 1,
        letterSpacing: '-0.04em',
      }}
    >
      <span className="text-[#0F172A] dark:text-white font-black">
        NURAY
      </span>
      <span
        className="rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-white"
        style={{
          background: 'linear-gradient(135deg, #FF5500 0%, #FF2A00 100%)',
          boxShadow: '0 2px 8px -1px rgba(255, 85, 0, 0.4)',
        }}
      >
        ⚡ FOOD
      </span>
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
