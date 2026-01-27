import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const BASE_CLASSES = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--primary-500)/0.45)]';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-[rgb(var(--primary-500))] text-white hover:bg-[rgb(var(--primary-600))] shadow-sm shadow-cyan-500/20',
  secondary: 'bg-[rgb(var(--bg-element))] text-[rgb(var(--text-primary))] border border-[rgb(var(--border-main))] hover:bg-[rgb(var(--bg-panel))]',
  ghost: 'bg-transparent text-[rgb(var(--text-primary))] hover:bg-[rgba(var(--bg-element)/0.6)]',
  danger: 'bg-red-500 text-white hover:bg-red-600'
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base'
};

const getSpinnerSize = (size: ButtonSize) => {
  switch (size) {
    case 'sm':
      return 14;
    case 'lg':
      return 18;
    default:
      return 16;
  }
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  fullWidth = false,
  className = '',
  disabled,
  type = 'button',
  children,
  ...props
}, ref) => {
  const isDisabled = disabled || isLoading;
  const spinnerSize = getSpinnerSize(size);

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      className={[
        BASE_CLASSES,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth ? 'w-full' : '',
        isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        className
      ].filter(Boolean).join(' ')}
      {...props}
    >
      {isLoading ? <Loader2 size={spinnerSize} className="animate-spin" /> : leftIcon}
      {children}
      {!isLoading && rightIcon}
    </button>
  );
});

Button.displayName = 'Button';
