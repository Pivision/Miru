import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * 卡片外壳：只负责描边、底色、圆角与阴影，不管内部结构。
 * 不套 shadcn 那套 CardHeader/CardContent——站点内边距有 sm/md/lg 三档，标准件每次都要覆盖，反而更长。
 * 需要 section / form 语义时传 as，不要在外面再套一层。
 */
const cardVariants = cva('rounded-2xl border border-border/70 bg-card text-card-foreground shadow-xs', {
  variants: {
    padding: {
      sm: 'p-3',
      md: 'p-4',
      lg: 'p-5',
    },
  },
  defaultVariants: { padding: 'lg' },
});

type CardProps = React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof cardVariants> & {
    /** 渲染成什么标签。默认 div；有标题层级或含表单时换成 section / form。 */
    as?: 'div' | 'section' | 'form' | 'article';
  };

export function Card({ as: Tag = 'div', padding, className, ...props }: CardProps) {
  const Comp = Tag as React.ElementType;
  return <Comp className={cn(cardVariants({ padding }), className)} {...props} />;
}
