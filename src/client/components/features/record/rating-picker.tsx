/** hero 里的「我的评分」胶囊：触发按钮 + 十星弹层，radiogroup 与命中区自成一体。 */
import { useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSY_LOOK, FOCUS_RESET } from '@/lib/styles';
import { Popover, PopoverChevron, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';

/** 方向键 → 下一个落点（1–10），非方向键返回 null。上下与左右等价：按上下的人想的是加减一分。 */
function arrowToValue(key: string, value: number, previous: number): number | null {
  if (key === 'Home') return 1;
  if (key === 'End') return 10;
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 0;
  if (step === 0) return null;
  // 到头停住，与原生 radio 一致。
  const next = Math.min(10, Math.max(1, value + step));
  return next === previous ? null : next;
}

/** 官方十档评语，索引 0 对应 1 分。 */
const RATING_LABELS = [
  '不忍直视',
  '很差',
  '差',
  '较差',
  '不过不失',
  '还行',
  '推荐',
  '力荐',
  '神作',
  '超神作',
];

export function RatingPicker({
  rating,
  busy,
  open,
  onOpenChange,
  onPick,
}: {
  rating: number | null;
  busy: boolean;
  open: boolean;
  onOpenChange: (next: boolean) => void;
  onPick: (value: number | null) => void;
}) {
  // 浮层定位要量触发按钮的位置。
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);
  // roving tabindex 落点：有分落当前分，否则 1 星。
  const [rovingValue, setRovingValue] = useState(rating ?? 1);

  return (
    <div className="flex items-start">
      <Popover
        open={open}
        onOpenChange={(next) => {
          // 写入期间不开弹层：按钮是 aria-disabled，收得到点击，得自己挡。
          if (next && busy) return;
          // 每次打开同步落点，否则键盘首下方向键会从旧值起算。
          if (next) setRovingValue(rating ?? 1);
          onOpenChange(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            // label 要含可见文字，否则读屏用户听不到当前分数。
            aria-label={rating === null ? '我的评分：未评分' : `我的评分：${rating} 分`}
            // 用 aria-disabled：弹层关闭时 Radix 会把焦点还给触发按钮，原生 disabled 收不到，键盘用户点完星星就丢位置。
            aria-disabled={busy}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-1 pl-1 pr-2 text-sm font-medium leading-snug text-foreground/85 transition-colors hover:border-primary/50 hover:bg-primary/15 hover:text-foreground',
              FOCUS_RESET,
              BUSY_LOOK,
              'data-[state=open]:border-primary/50 data-[state=open]:bg-primary/15',
            )}
          >
            <Star
              className={cn('size-3.5', rating === null ? 'text-muted-foreground' : 'fill-amber-400 text-amber-400')}
            />
            {rating === null ? '未评分' : `${rating} 分`}
            {/* 与观看状态按钮同款箭头，展开翻转。 */}
            <PopoverChevron />
          </button>
        </PopoverTrigger>
        <PopoverContent anchorRef={triggerRef} width={268}>
          <PopoverTitle className="sr-only">选择评分</PopoverTitle>
          {/* 命中区靠 p-1 撑到 24×24（WCAG 2.5.8 下限），不放大图标。十选一所以用 radiogroup + radio；方向键移焦、Home/End 跳两端、Enter/空格提交，移焦不写库。 */}
          <div ref={groupRef} role="radiogroup" aria-label="评分" className="flex items-center justify-between">
            {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
              <button
                key={value}
                type="button"
                // roving tabindex：整组只占一个 Tab 位。
                tabIndex={value === rovingValue ? 0 : -1}
                onFocus={() => setRovingValue(value)}
                onKeyDown={(event) => {
                  const next = arrowToValue(event.key, value, rovingValue);
                  if (next === null) return;
                  event.preventDefault();
                  setRovingValue(next);
                  // 移焦不选：选分要写库，留给 Enter/空格。
                  groupRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
                }}
                data-value={value}
                onClick={() => {
                  // 点当前分数不发请求，commit 只会 toast 同样的结果。
                  if (value === rating) {
                    onOpenChange(false);
                    return;
                  }
                  onPick(value);
                  onOpenChange(false);
                }}
                aria-label={`打 ${value} 分`}
                // 互斥单选：aria-pressed 会让读屏以为可以多选。
                role="radio"
                aria-checked={value === rating}
                disabled={busy}
                className="group grid place-items-center rounded-md p-1 transition-transform hover:scale-110 disabled:cursor-progress"
              >
                <Star
                  className={cn(
                    'size-4 shrink-0',
                    rating !== null && value <= rating
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-muted-foreground/50 group-hover:text-amber-400',
                  )}
                />
              </button>
            ))}
          </div>
          {/* 未评分时放提示语，否则这行空掉会让弹层高度跳一下。 */}
          <p className="mt-2 text-center text-xs leading-snug text-muted-foreground">
            {rating === null ? '点星星打分' : RATING_LABELS[rating - 1]}
          </p>
          <div className="mt-2 border-t border-border/70 pt-2">
            <button
              type="button"
              onClick={() => {
                onPick(null);
                onOpenChange(false);
              }}
              disabled={busy || rating === null}
              className="w-full rounded-md py-0.5 text-center text-2xs leading-snug text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              清除评分
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}