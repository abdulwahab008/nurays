'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface NurayButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'dark' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg';
}

const variantClass: Record<NonNullable<NurayButtonProps['variant']>, string> = {
  primary: 'nuray-btn-primary',
  dark: 'nuray-btn-dark',
  outline: 'nuray-btn-outline',
  ghost: 'nuray-btn-ghost',
  destructive: 'nuray-btn-destructive',
};

const sizeClass: Record<NonNullable<NurayButtonProps['size']>, string> = {
  default: '',
  sm: 'nuray-btn-sm',
  lg: 'nuray-btn-lg',
};

export const NurayButton = React.forwardRef<HTMLButtonElement, NurayButtonProps>(
  ({ className, variant = 'primary', size = 'default', ...props }, ref) => (
    <button
      ref={ref}
      {...props}
      className={cn('nuray-btn', variantClass[variant], sizeClass[size], className)}
    />
  ),
);
NurayButton.displayName = 'NurayButton';
