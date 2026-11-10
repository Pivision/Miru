import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/** 与 completed 同色的「一切正常」绿：两档语义不同但外观必须一致，所以共用这一串。 */
const EMERALD = 'border-emerald-600/20 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300';

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
  {
    variants: {
      // 五种观看状态各一档，另加两档非状态语义的：neutral 给中性说明，success 给「一切正常」。
      // 没有「default」兜底变体：调用方必须明确给变体，写错值在类型检查期就报出来，
      // 而不是静默渲染成一个通用徽标。
      variant: {
        watching: 'border-primary/25 bg-primary/10 text-primary',
        planned: 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
        completed: EMERALD,
        on_hold: 'border-amber-500/25 bg-amber-500/10 text-amber-800 dark:text-amber-300',
        dropped: 'border-zinc-500/25 bg-zinc-500/10 text-zinc-600 dark:text-zinc-300',
        neutral: 'border-border bg-muted text-muted-foreground',
        success: EMERALD,
      },
    },
  },
);

// variant 用 Required 收紧：cva 在没有 defaultVariants 时仍把它当可选属性，
// 只删变体不会拦住 `<Badge>文字</Badge>`，那样会渲染成没有底色的裸徽标。
interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    Required<Pick<VariantProps<typeof badgeVariants>, 'variant'>> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

