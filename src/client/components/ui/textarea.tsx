import * as React from 'react';
import { cn } from '@/lib/utils';
import { FIELD_BASE } from '@/lib/styles';

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        FIELD_BASE,
        'min-h-24 py-2.5',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
