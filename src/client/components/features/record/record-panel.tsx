import { useEffect, useRef, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BUSY_LOOK, FOCUS_RESET } from '@/lib/styles';
import { postJson } from '@/lib/api-client';
import { RECORD_SCOPE, useWrite } from '@/lib/hooks/writes';
import { stampToDay } from '@/lib/time-format';
import type { Entry, Subject } from '@shared/types';
import { STATUS_META, STATUS_ORDER, isStatus } from '@shared/types';
import { Popover, PopoverChevron, PopoverContent, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { RatingPicker } from '@/components/features/record/rating-picker';
import { StartEndDatePicker } from '@/components/features/record/date-picker';

/** 四处写操作共用一个 mutation，kind 区分是哪一个在跑。 */
type WriteKind = 'status' | 'rating' | 'dates' | 'delete';
type WriteInput = { kind: WriteKind; payload?: Record<string, unknown> };

/** hero 栏的快捷记录条：状态与评分点一下立刻落库，起止日期改完点保存一次提交。三者都写同一个 /api/records，未提交的字段服务端按「保持原值」处理，先后点哪个都不互相覆盖。进度在「集数」卡片里改。 */
export function QuickTrack({ subject, entry }: { subject: Subject; entry: Entry }) {
  const [status, setStatus] = useState<Entry['status']>(entry.status);
  const [rating, setRating] = useState<number | null>(entry.rating);
  const [startedAt, setStartedAt] = useState(stampToDay(entry.startedAt));
  const [finishedAt, setFinishedAt] = useState(stampToDay(entry.finishedAt));
  /** 当前开着的浮层。互斥是硬约束，用一个值比三个布尔省得三处同步。 */
  const [openLayer, setOpenLayer] = useState<'status' | 'rating' | 'date' | null>(null);
  /** 状态弹层的定位锚点：Popover 要拿触发按钮的 rect 才能贴着展开。 */
  const statusTriggerRef = useRef<HTMLButtonElement>(null);

  // status/rating 单独一个 effect：写成功后 invalidate 会换新 entry，界面不能停在旧值；也不能与弹层挤在一起，否则选状态时弹层会被关掉。
  // 日期 effect 必须依赖 entry.id：两番日期相同时，A 番没保存的日期会残留并写进 B 番。
  useEffect(() => {
    setStatus(entry.status);
    setRating(entry.rating);
  }, [entry.status, entry.rating]);

  useEffect(() => {
    setOpenLayer(null);
    setStartedAt(stampToDay(entry.startedAt));
    setFinishedAt(stampToDay(entry.finishedAt));
  }, [entry.id, entry.startedAt, entry.finishedAt]);

  // 重入靠 isPending 挡住（pending 期间 commit/saveDates/remove 都提前返回），写成功后 scope 里的 useWrite 统一刷新。
  const write = useWrite<unknown, WriteInput>({
    // 与 +1 集、点集数共用同一个 scope：服务端整行读改写，并发会互相覆盖。
    scope: RECORD_SCOPE,
    mutationFn: ({ kind, payload = {} }) => {
      if (kind === 'delete') return postJson(`/records/${entry.id}/delete`, {});
      return postJson('/records', { subject_id: subject.id, ...payload });
    },
    success: (_result, { kind, payload = {} }) => {
      if (kind === 'delete') return '记录已删除';
      if (kind === 'dates') return '日期已保存';
      if (kind === 'status') {
        // payload 是宽松记录，状态不认识就退成通用文案，不该在渲染期炸掉。
        return isStatus(payload.status) ? `已标记为「${STATUS_META[payload.status].label}」` : '状态已保存';
      }
      return payload.rating === null ? '评分已清除' : '评分已保存';
    },
    /* 失败退回已知值，不让界面显示没存进去的状态 */
    onError: () => {
      setStatus(entry.status);
      setRating(entry.rating);
      setStartedAt(stampToDay(entry.startedAt));
      setFinishedAt(stampToDay(entry.finishedAt));
    },
  });

  const busy = write.isPending;
  const savingDates = write.isPending && write.variables?.kind === 'dates';

  function commit(kind: 'status' | 'rating', patch: { status?: Entry['status']; rating?: number | null }) {
    // 先判忙再改本地值，否则会改掉界面却什么都没存。
    if (busy) return;
    if (patch.status !== undefined) setStatus(patch.status);
    if (patch.rating !== undefined) setRating(patch.rating);
    write.mutate({ kind, payload: patch });
  }

  // 日期是「改完点保存」：逐个即时提交会产生两次中间态，中途关层也回不去，所以一次提交。两个都传（空串表示清空）。
  function saveDates() {
    if (busy) return;
    write.mutate(
      { kind: 'dates', payload: { started_at: startedAt, finished_at: finishedAt } },
      { onSuccess: () => setOpenLayer(null) },
    );
  }

  // 删除走同一个 scope：若别处的 +1 还在飞，服务端 upsertEntry 发现行不存在会重新插入，刚删的记录被写回来。

  function remove() {
    if (busy) return;
    if (!window.confirm('删除这条记录？想法也会一起删掉。')) return;
    write.mutate({ kind: 'delete' });
  }

  return (
    <div className="mt-4 space-y-2">
      {/* 三者并成一行靠左排；窄屏 flex-wrap 让后面的整块落到下一行，而不是把星星挤扁。 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* 五个胶囊太碎，收成一个下拉。弹层走 Portal 不受 hero 的 overflow-hidden 裁剪。外面必须加 items-start：stretch 会把按钮拉成整行高。 */}
        <div className="flex items-start">
          <Popover
            open={openLayer === 'status'}
            onOpenChange={(next) => {
              // 写入期间不开弹层（aria-disabled 不会自己挡点击）。
              if (next && busy) return;
              setOpenLayer(next ? 'status' : null);
            }}
          >
            <PopoverTrigger asChild>
              <button
                ref={statusTriggerRef}
                type="button"
                // label 要含可见文字，否则读屏听不到状态、语音控制念可见文字也点不到（WCAG 2.5.3）。
                aria-label={`观看状态：${STATUS_META[status].label}`}
                // 用 aria-disabled：原生 disabled 收不到焦点，弹层关闭时 Radix 还焦点会掉到 body 上。
                aria-disabled={busy}
                className={cn(
                  'group inline-flex items-center gap-1.5 rounded-full bg-primary py-1 pl-3 pr-2.5 text-sm font-medium leading-snug text-primary-foreground backdrop-blur transition-colors hover:bg-primary/90',
                  FOCUS_RESET,
                  BUSY_LOOK,
                )}
              >
                {STATUS_META[status].label}
                <PopoverChevron />
              </button>
            </PopoverTrigger>
            <PopoverContent anchorRef={statusTriggerRef} width={176}>
              <PopoverTitle className="sr-only">选择观看状态</PopoverTitle>
              {/* 用普通按钮而非 menu，Tab 顺序与视觉一致；勾位始终占宽，切换时文字不横跳。 */}
              <div className="space-y-0.5">
                {STATUS_ORDER.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setOpenLayer(null);
                      // 点当前项不发请求：会 toast 一遍同样的状态，看着像出错。
                      if (value === status) return;
                      void commit('status', { status: value });
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground',
                      FOCUS_RESET,
                      value === status && 'font-medium text-primary',
                    )}
                  >
                    <Check className={cn('size-3.5 shrink-0', value === status ? 'opacity-100' : 'opacity-0')} />
                    {STATUS_META[value].label}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        {/* 评分用浅底描边的次级胶囊，与实心主操作的状态区分主次。 */}
        <RatingPicker
          rating={rating}
          busy={busy}
          open={openLayer === 'rating'}
          onOpenChange={(next) => setOpenLayer(next ? 'rating' : null)}
          onPick={(value) => void commit('rating', { rating: value })}
        />

        <StartEndDatePicker
          startedAt={startedAt}
          finishedAt={finishedAt}
          busy={busy}
          saving={savingDates}
          open={openLayer === 'date'}
          onOpenChange={(next) => {
            // 关闭即放弃未保存改动。但提交中不能回滚：saveDates 先发请求再关层，回滚会把刚提交的日期弹掉，界面显示没存而库里已存。
            if (!next && !savingDates) {
              setStartedAt(stampToDay(entry.startedAt));
              setFinishedAt(stampToDay(entry.finishedAt));
            }
            setOpenLayer(next ? 'date' : null);
          }}
          onStartedChange={setStartedAt}
          onFinishedChange={setFinishedAt}
          onSave={() => void saveDates()}
        />
      </div>

      {/* 不可逆操作：浅色小字 + 小垃圾桶，悬停才转红，不抢戏也不藏起来。 */}
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => void remove()}
          // 用 aria-disabled：原生 disabled 会让按钮掉出 Tab 序。
          aria-disabled={busy}
          className={cn(
            'inline-flex items-center gap-1 rounded-md py-0.5 pl-1 pr-1.5 text-2xs leading-snug text-muted-foreground/70 transition-colors hover:text-destructive',
            BUSY_LOOK,
          )}
        >
          <Trash2 className="size-3" />
          删除记录
        </button>
      </div>
    </div>
  );
}
