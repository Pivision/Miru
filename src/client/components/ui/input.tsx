import * as React from 'react';
import { cn } from '@/lib/utils';
import { FIELD_BASE } from '@/lib/styles';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        FIELD_BASE,
        'h-10 py-2',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
