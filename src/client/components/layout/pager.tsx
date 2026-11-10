import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { PAGE_SIZE } from '@shared/limits';
import { Button } from '@/components/ui/button';

/** 上一页/当前页/下一页。到头时默认变灰留在原位而非不渲染，按钮不会左右跳动。 */
export function Pager({
  page,
  totalPages,
  total,
  unit = '条',
  href,
  className,
  edge = 'disabled',
}: {
  page: number;
  totalPages: number;
  /** 结果总条数；省略则不显示统计行。 */
  total?: number;
  unit?: string;
  href: (patch: Record<string, string | number | null>) => string;
  className?: string;
  /** 到头时：变灰留在原位，或不渲染。 */
  edge?: 'disabled' | 'hidden';
}) {
  const hideEdge = edge === 'hidden';
  const count = total === undefined ? null : (
    <p className="text-center text-2xs text-muted-foreground">
      共 {total} {unit} · 每页 {PAGE_SIZE} 条
    </p>
  );
  // 只有一页时统计行仍要显示；页码越界时列表为空，分页条必须保留，否则用户只能手改地址栏。
  const outOfRange = page > totalPages;
  if (totalPages <= 1 && !outOfRange) return count;
  return (
    <div className={cn('space-y-2 pt-2', className)}>
      <nav className="flex items-center justify-center gap-1.5" aria-label="分页">
        {page > 1 ? (
          <Button variant="outline" size="sm" asChild>
            {/* 越界时回最后一页，而不是只退一步。 */}
            <Link to={href({ page: outOfRange ? totalPages : page - 1 })}>上一页</Link>
          </Button>
        ) : hideEdge ? null : (
          <Button variant="outline" size="sm" disabled>
            上一页
          </Button>
        )}
        <span className={cn('text-2xs text-muted-foreground', !hideEdge && 'px-2')}>
          {/* 越界时按实际落在的页显示，否则会看到「99 / 3」。 */}
          {Math.min(page, totalPages)} / {totalPages}
        </span>
        {page < totalPages ? (
          <Button variant="outline" size="sm" asChild>
            <Link to={href({ page: page + 1 })}>下一页</Link>
          </Button>
        ) : hideEdge ? null : (
          <Button variant="outline" size="sm" disabled>
            下一页
          </Button>
        )}
      </nav>
      {count}
    </div>
  );
}