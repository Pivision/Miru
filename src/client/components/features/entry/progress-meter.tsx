import { cn } from '@/lib/utils';
import { progressPercent } from '@/lib/number-format';

/**
 * 观看进度条：读屏要读到数值，role/aria-value* 语义在这里一次性给出。
 * `label` 必填：同一页常有多条进度，只说「观看进度」念不出是哪一部。
 */
export function ProgressMeter({
  value,
  total,
  label,
  className,
}: {
  value: number;
  total: number;
  label: string;
  className?: string;
}) {
  const percent = progressPercent(value, total);
  return (
    <div
      role="progressbar"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-muted', className)}
    >
      <div className="h-full rounded-full bg-primary/80 transition-[width] duration-300" style={{ width: `${percent}%` }} />
    </div>
  );
}
