import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 页面级排版件：标题区与小节标题。单独成文件，只用 h1 的页面不必把整个 shell 连同 sonner 拉进依赖图。 */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/** 小节标题三档：md 卡片内小标题、lg 首页主栏区块标题、quiet（默认）导航式小节名。 */
const SECTION_TITLE_SIZES = {
  md: 'text-base font-semibold',
  lg: 'text-xl font-semibold',
  quiet: 'text-sm font-semibold tracking-wide text-foreground/80',
} as const;

export function SectionTitle({
  children,
  size = 'quiet',
  className,
}: {
  children: ReactNode;
  size?: keyof typeof SECTION_TITLE_SIZES;
  className?: string;
}) {
  return <h2 className={cn('mb-3', SECTION_TITLE_SIZES[size], className)}>{children}</h2>;
}
