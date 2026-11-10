import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/layout/page-header';
import { ProgressMeter } from '@/components/features/entry/progress-meter';
import { Spinner } from '@/components/ui/spinner';
import type { Episode } from '@shared/types';
import { episodeProgressText } from '@shared/display';

/** jumping 是正在提交的集号：期间整块禁用，避免连点发起互相覆盖的写请求。 */
export function EpisodeGrid({
  episodes,
  watched,
  totalEps,
  enabled,
  jumping,
  onPick,
}: {
  episodes: Episode[];
  watched: number;
  totalEps: number;
  enabled: boolean;
  jumping: number | null;
  onPick: (number: number) => void;
}) {
  return (
    <Card as="section">
      <div className="flex items-baseline justify-between">
        <SectionTitle size="md" className="mb-0">集数</SectionTitle>
        <span className="text-2xs text-muted-foreground">已看 {episodeProgressText(watched, totalEps)}</span>
      </div>
      {/* 固定 36px 列而非铺满列宽：1–3 位集数会撑成一百来像素的大方块。auto-fill 让列数随宽度自适应。 */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fill,36px)] gap-1.5">
        {episodes.map((ep) => {
          const number = ep.ep ?? ep.sort;
          const seen = number <= watched;
          return (
            <button
              key={ep.id}
              type="button"
              disabled={!enabled || jumping !== null}
              onClick={() => onPick(number)}
              title={ep.nameCn || ep.name || `第 ${number} 集`}
              /* 按钮里只有数字，读屏拿不到上下文：补可读名与选中态。 */
              aria-label={`第 ${number} 集${seen ? '，已看' : ''}`}
              aria-pressed={seen}
              className={
                'grid h-8 place-items-center rounded-md border text-2xs tabular-nums transition-colors ' +
                (seen
                  ? 'border-primary/20 bg-primary/10 text-primary'
                  : 'border-border/70 text-muted-foreground hover:border-primary/40 hover:text-primary') +
                (enabled ? ' cursor-pointer' : ' cursor-default')
              }
            >
              {jumping === number ? <Spinner className="size-3" /> : number}
            </button>
          );
        })}
      </div>
      {/* 只读进度条：改进度仍走上面的方块。 */}
      <ProgressMeter
        value={watched}
        total={totalEps}
        label="本作观看进度"
        className="mt-3 h-1 bg-border/70 [&>div]:bg-primary"
      />
      <p className="mt-2.5 text-2xs text-muted-foreground">
        {episodes.some((ep) => ep.placeholder)
          ? '分集标题暂时取不到，格子按集数编号生成，仍然可以点。'
          : '点任意一集可以直接把进度标到那一集。'}
      </p>
    </Card>
  );
}
