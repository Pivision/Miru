import { cn } from '@/lib/utils';

/** 一条水平分隔线。全站只有这一种用法，所以不再留 orientation 参数。 */
export function Separator({ className }: { className?: string }) {
  return <div role="separator" aria-orientation="horizontal" className={cn('shrink-0 h-px w-full bg-border/70', className)} />;
}
