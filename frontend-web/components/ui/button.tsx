import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'dark' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg';
}

const variantStyles: Record<NonNullable<ButtonProps['variant']>, React.CSSProperties> = {
  default: {
    background: '#FF5500',
    color: '#FFFFFF',
    border: '0',
  },
  dark: {
    background: '#0C1016',
    color: '#FFFFFF',
    border: '0',
  },
  outline: {
    background: 'transparent',
    color: '#0C1016',
    border: '1px solid #E2E8F0',
  },
  ghost: {
    background: 'transparent',
    color: '#FF5500',
    border: '0',
  },
  destructive: {
    background: '#DC2626',
    color: '#FFFFFF',
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
    const hasCustomBg = className?.includes('bg-') || className?.includes('flame-btn');
    const baseStyle = variantStyles[variant];
    const finalStyle: React.CSSProperties = {
      ...baseStyle,
      ...(hasCustomBg ? { background: undefined, backgroundColor: undefined } : {}),
      ...style,
    };

    return (
      <button
        ref={ref}
        data-nuray-btn="v3"
        {...props}
        className={cn(
          'inline-flex items-center justify-center gap-2 rounded-full font-semibold tracking-tight transition-all duration-200 shadow-xs cursor-pointer',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          sizeClass[size],
          className,
        )}
        style={finalStyle}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button };
