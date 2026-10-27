import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `default` and `primary` are the turquoise button (dark words on it: white on turquoise cannot be read); `dark` is the
   * ink button; `outline` a quiet one; `ghost` a turquoise word; `destructive` deletes or cancels something.
   */
  variant?: 'default' | 'primary' | 'dark' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg';
}

const variantClass: Record<NonNullable<ButtonProps['variant']>, string> = {
  default: 'bg-brand text-on-brand hover:bg-brand-500',
  primary: 'bg-brand text-on-brand hover:bg-brand-500 font-bold',
  dark: 'bg-ink text-page hover:opacity-90',
  // See-through, as before the redesign: an outline button on a dark bar keeps the bar's colour behind its light words.
  outline: 'bg-transparent text-ink border border-line-strong hover:bg-raised',
  ghost: 'bg-transparent text-brand-ink hover:bg-brand-soft',
  destructive: 'bg-red-700 text-white hover:bg-red-800',
};

const sizeClass: Record<NonNullable<ButtonProps['size']>, string> = {
  default: 'h-11 px-6 text-sm',
  sm: 'h-9 px-4 text-xs',
  lg: 'h-13 px-7 text-[15px]',
};

// Classes only, merged with tailwind-merge: a colour the caller asks for in className (a red "Delete": text-red-700
// border-red-200) replaces the variant's own, and nothing is left behind in an inline style that would beat it.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      data-nuray-btn="v4"
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight transition-colors duration-150 cursor-pointer',
        'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-brand/40',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClass[variant],
        sizeClass[size],
        className,
      )}
    />
  ),
);
Button.displayName = 'Button';

export { Button };
