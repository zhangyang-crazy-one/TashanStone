import React from 'react';

type SkeletonRounded = 'sm' | 'md' | 'lg' | 'full';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  rounded?: SkeletonRounded;
}

const ROUNDED_CLASSES: Record<SkeletonRounded, string> = {
  sm: 'rounded',
  md: 'rounded-md',
  lg: 'rounded-lg',
  full: 'rounded-full'
};

export const Skeleton: React.FC<SkeletonProps> = ({
  rounded = 'md',
  className = '',
  ...props
}) => {
  return (
    <div
      className={[
        'animate-pulse bg-slate-200/70 dark:bg-slate-700/40',
        ROUNDED_CLASSES[rounded],
        className
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
};
