import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { PILL_ACTIVE, PILL_IDLE } from '@/lib/styles';

export function StatusPill({
  active,
  to,
  label,
  count,
}: {
  active: boolean;
  to: string;
  label: string;
  count: number;
}) {
  return (
    <Link
      to={to}
      // 选中态原先只体现为配色，读屏分辨不出哪一个是当前筛选，补 aria-current。
      aria-current={active ? 'page' : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
        active ? PILL_ACTIVE : PILL_IDLE,
      )}
    >
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-foreground/70' : 'text-muted-foreground/70')}>
        {count}
      </span>
    </Link>
  );
}
