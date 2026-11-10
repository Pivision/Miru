/** 「起止日期」胶囊。与状态/评分不同，日期改完点保存才一起提交；开关与回滚由 QuickTrack 管。 */
import { useRef } from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSY_LOOK, FOCUS_RESET } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';

const DATE_FIELDS = [
  { key: 'startedAt', label: '开始日期', ariaLabel: '开始观看日期' },
  { key: 'finishedAt', label: '结束日期', ariaLabel: '看完日期' },
] as const;

export function StartEndDatePicker({
  startedAt,
  finishedAt,
  busy,
  saving,
  open,
  onOpenChange,
  onStartedChange,
  onFinishedChange,
  onSave,
}: {
  startedAt: string;
  finishedAt: string;
  busy: boolean;
  saving: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onStartedChange: (value: string) => void;
  onFinishedChange: (value: string) => void;
  onSave: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const values = { startedAt, finishedAt };
  const onChange = { startedAt: onStartedChange, finishedAt: onFinishedChange };

  // 按钮文案只给「月-日」：与状态、评分排一行，完整日期会撑长；后缀区分开始/看完。
  const label = finishedAt ? `${finishedAt.slice(5)} 看完` : startedAt ? `${startedAt.slice(5)} 开始` : '添加日期';

  return (
    <div className="flex items-start">
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next && busy) return;
          onOpenChange(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            // 无障碍名必须包含可见文字 label，否则语音控制念可见文字点不到（WCAG 2.5.3）；完整日期补在后面。
            aria-label={`${label}（起止日期：${startedAt || '未填'} 至 ${finishedAt || '未填'}）`}
            // 原生 disabled 会让弹层关闭时的焦点归还落空，用 aria-disabled 挡视觉。
            aria-disabled={busy}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2 text-xs leading-snug tabular-nums text-foreground/70 transition-colors hover:text-foreground',
              FOCUS_RESET,
              BUSY_LOOK,
            )}
          >
            <CalendarDays className="size-3.5 text-muted-foreground" />
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent anchorRef={triggerRef} width={232}>
          <PopoverTitle className="sr-only">编辑起止日期</PopoverTitle>
          <div className="grid gap-2">
            {DATE_FIELDS.map((field) => (
              <label key={field.key} className="block">
                <span className="mb-1 block text-2xs font-medium leading-snug text-muted-foreground">{field.label}</span>
                <Input
                  type="date"
                  value={values[field.key]}
                  disabled={busy}
                  onChange={(event) => onChange[field.key](event.target.value)}
                  className="h-8 text-sm leading-snug"
                  aria-label={field.ariaLabel}
                />
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              onClick={onSave}
              disabled={busy}
              className="mt-0.5 h-8 w-full text-sm leading-snug"
            >
              {saving ? <Spinner /> : null}
              保存
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
