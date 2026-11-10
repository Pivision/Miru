import { subjectPath } from '@shared/routes';
import { Link } from 'react-router';
import { Plus, Star } from 'lucide-react';
import { postJson } from '@/lib/api-client';
import { RECORD_SCOPE, useWrite } from '@/lib/hooks/writes';
import type { Entry } from '@shared/types';
import { STATUS_META } from '@shared/types';
import { displayTitle, episodeProgressText, isFinished } from '@shared/display';
import { fmtDay } from '@/lib/time-format';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Cover, COVER_ZOOM } from '@/components/features/entry/cover-image';
import { ProgressMeter } from '@/components/features/entry/progress-meter';
import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

function StatusBadge({ status, className }: { status: Entry['status']; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant={status} className={className}>
      {meta.label}
    </Badge>
  );
}

/** 「+1 集」按钮：两种卡片只差外观，写入、忙态、封顶、可读名都在这里。appearance 决定圆钮还是胶囊。 */
function PlusOneButton({
  entry,
  appearance,
}: {
  entry: Entry;
  appearance: 'round' | 'pill';
}) {
  const doneAll = isFinished(entry);
  const mutation = useWrite<{ entry: Entry }>({
    scope: RECORD_SCOPE,
    mutationFn: () => postJson<{ entry: Entry }>(`/records/${entry.id}/progress`, { delta: 1 }),
    // 文案用响应里的 entry.progress：服务端会封顶，闭包那份是点击前快照，连点会报出比实际更靠后的集数。
    success: (data) => `《${displayTitle(entry)}》推进到第 ${data.entry.progress} 集`,
  });
  const busy = mutation.isPending;

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={busy || doneAll}
      title={doneAll ? '已经看完了' : '记一集'}
      /* 离开卡片标题就没有主语，可读名必须带番名。 */
      aria-label={`《${displayTitle(entry)}》记一集`}
      className={cn(
        'shrink-0 text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40',
        appearance === 'round'
          ? 'grid size-6 place-items-center rounded-full border border-border/80'
          : 'inline-flex items-center gap-1 rounded-full border border-border/80 px-2.5 py-1 text-2xs font-medium',
      )}
    >
      {busy ? <Spinner className="size-2.5" /> : null}
      {/* 忙时圆钮用转圈替掉加号，胶囊保留文字不跳宽。 */}
      {!busy && appearance === 'round' ? <Plus className="size-2.5" /> : null}
      {appearance === 'pill' ? '+1 集' : null}
    </button>
  );
}

/** 竖版记录卡：宽度由父级网格轨道决定。窄栏要稳：文字 min-w-0 + truncate，按钮 shrink-0，h-full 对齐同行卡片。 */
export function EntryPosterCard({
  entry,
  showStatus = false,
}: {
  entry: Entry;
  /** 封面上叠状态角标：书库按状态筛选时需要，首页不需要。 */
  showStatus?: boolean;
}) {
  const typeLabel = entry.platform;

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border/70 bg-card shadow-xs transition-shadow hover:shadow-md">
      <Link to={subjectPath(entry.sourceId)} className="block">
        {/* aspect 与 overflow-hidden 必须放在海报框：hover 的 scale 要被这层裁掉，否则海报下溢 4px 盖住番名。 */}
        <div className="relative aspect-[5/7] overflow-hidden bg-muted">
          <Cover
            src={entry.poster}
            alt={displayTitle(entry)}
            className={cn('size-full', COVER_ZOOM)}
            rounded=""
          />
          {showStatus && (
            <StatusBadge
              status={entry.status}
              className="absolute left-1.5 top-1.5 bg-background/95 text-2xs shadow-xs backdrop-blur"
            />
          )}
        </div>
      </Link>
      <div className="min-w-0 flex-1 px-2 pb-2 pt-1.5">
        <Link
          to={subjectPath(entry.sourceId)}
          title={displayTitle(entry)}
          className="block truncate text-sm font-medium leading-6 hover:text-primary"
        >
          {displayTitle(entry)}
        </Link>
        <p className="flex min-w-0 items-center gap-1 text-xs leading-6 text-muted-foreground">
          {/* 平台缺失就不摆标签：拿「动画」顶上去等于替上游编一个事实。分隔点也跟着它一起出没，否则会剩下一个孤零零的「·」。 */}
          {typeLabel && <span className="shrink-0">{typeLabel}</span>}
          {entry.rating ? (
            <>
              {typeLabel && <span className="shrink-0 text-muted-foreground/40">·</span>}
              <span className="inline-flex shrink-0 items-center gap-0.5 text-foreground">
                <Star className="size-2.5 shrink-0 fill-amber-400 text-amber-400" />
                <span className="font-medium tabular-nums">{entry.rating}</span>
              </span>
            </>
          ) : (
            <span className="shrink-0 text-muted-foreground/60">未评分</span>
          )}
        </p>
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-xs leading-6 text-muted-foreground">
            {episodeProgressText(entry.progress, entry.totalEps)}
          </p>
          <PlusOneButton entry={entry} appearance="round" />
        </div>
        {/* 进度条放在内边距内的整宽容器里，与上方文字左右对齐。 */}
        <ProgressMeter
          value={entry.progress}
          total={entry.totalEps}
          label={`《${displayTitle(entry)}》观看进度`}
          className="mt-1 h-1"
        />
      </div>
    </article>
  );
}

export function EntryCard({ entry }: { entry: Entry }) {
  return (
    <Card as="article" padding="sm" className="group flex items-center gap-3 transition-shadow hover:shadow-md">
      <Link to={subjectPath(entry.sourceId)} className="shrink-0">
        <Cover src={entry.poster} alt={displayTitle(entry)} className="h-[52px] w-[38px]" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <Link to={subjectPath(entry.sourceId)} className="line-clamp-1 text-sm font-medium leading-snug hover:text-primary">
              {displayTitle(entry)}
            </Link>
            <StatusBadge status={entry.status} className="shrink-0" />
          </div>
          <p className="mt-0.5 text-2xs text-muted-foreground">
            {episodeProgressText(entry.progress, entry.totalEps)}
            {entry.rating ? ` · 我的评分 ${entry.rating}` : ''} · {fmtDay(entry.updatedAt)}
          </p>
        </div>
        <ProgressMeter value={entry.progress} total={entry.totalEps} label={`《${displayTitle(entry)}》观看进度`} />
        <div className="flex items-center justify-end gap-2">
          <PlusOneButton entry={entry} appearance="pill" />
        </div>
      </div>
    </Card>
  );
}
