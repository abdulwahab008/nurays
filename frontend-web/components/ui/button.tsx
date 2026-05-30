import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'dark' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg';
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  default: {
    background: 'var(--forest-500)',
    color: 'var(--cream-50)',
    border: '0',
  },
  dark: {
    background: 'var(--ink-900)',
    color: 'var(--cream-50)',
    border: '0',
  },
  outline: {
    background: 'transparent',
    color: 'var(--ink-900)',
    border: '1px solid var(--ink-300)',
  },
  ghost: {
    background: 'transparent',
    color: 'var(--forest-700)',
    border: '0',
  },
  destructive: {
    background: 'var(--anar-500)',
    color: 'var(--cream-50)',
    border: '0',
  },
};

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'h-11 px-6 text-sm',
  sm: 'h-9 px-4 text-xs',
  lg: 'h-13 px-7 text-[15px]',
};

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', style, ...props }, ref) => {
    return (
      <button
        ref={ref}
        data-nuray-btn="v3"
        {...props}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-tight transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          sizeClass[size],
          className,
        )}
        style={{ ...variantStyles[variant], ...style }}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
