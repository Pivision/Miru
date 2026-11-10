import { subjectPath } from '@shared/routes';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { POSTER_GRID_COMPACT } from '@/lib/styles';
import { fmtScore } from '@/lib/number-format';
import type { Entry, Stats } from '@shared/types';
import { displayTitle, episodeProgressText } from '@shared/display';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Cover, COVER_ZOOM } from '@/components/features/entry/cover-image';
import { ProgressMeter } from '@/components/features/entry/progress-meter';
import { EntryPosterCard } from '@/components/features/entry/entry-cards';

/** Hero 内嵌的统计小格：无边框，竖线分隔，更窄更矮。 */
function HeroStat({ label, value, to }: { label: string; value: string | number; to: string }) {
  return (
    <Link to={to} className="group min-w-[4.5rem] px-2.5 first:pl-0 last:pr-0">
      <span className="block truncate text-2xs leading-none text-muted-foreground">{label}</span>
      <span className="mt-1.5 block text-xl font-semibold leading-none tabular-nums transition-colors group-hover:text-primary sm:text-2xl">
        {value}
      </span>
    </Link>
  );
}

export function HeroStats({ stats }: { stats: Stats }) {
  return (
    <div className="flex w-fit max-w-full flex-wrap gap-y-2 divide-x divide-border/70 sm:flex-nowrap">
      {/* 格子 min-w 按「文字宽度 + 2×10px + 富余」给。 */}
      <HeroStat label="总记录" value={stats.total} to="/library" />
      <HeroStat label="正在追" value={stats.watching} to="/library?status=watching" />
      <HeroStat label="看完" value={stats.completed} to="/library?status=completed" />
      <HeroStat label="累计集数" value={stats.episodes} to="/library" />
      <HeroStat
        label={stats.ratingCount ? `均分·${stats.ratingCount}部` : '平均评分'}
        value={stats.ratingCount ? fmtScore(stats.avgRating) : '—'}
        to="/library?sort=rating"
      />
    </div>
  );
}

/** Hero「上次看到哪」：与右侧海报同一部，直接点进详情页。 */
export function HeroLastWatch({ spotlight }: { spotlight: Entry | null }) {
  if (!spotlight) return null;
  const entry = spotlight;
  const title = displayTitle(entry);
  return (
    <Link
      to={subjectPath(entry.sourceId)}
      className="group mt-2 flex min-w-0 items-baseline gap-x-1.5 text-base text-muted-foreground"
    >
      <span className="shrink-0">上次看到</span>
      <span className="max-w-[16rem] truncate font-semibold text-foreground transition-colors group-hover:text-primary sm:max-w-[20rem]">
        《{title}》
      </span>
      <span className="shrink-0 tabular-nums">第 {entry.progress} 集</span>
    </Link>
  );
}

/** Hero 空态提示：书库还没有在看记录时指去发现页。 */
export function HeroEmptyHint() {
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      书库还空着，
      <Link to="/discover" className="font-medium text-primary hover:underline">
        去发现第一部
      </Link>
    </p>
  );
}

/** Hero 右侧海报：一部在看番 + 一行进度；无在看记录时给空态引导。 */
export function HeroSpotlight({ spotlight, className = '' }: { spotlight: Entry | null; className?: string }) {
  if (!spotlight) {
    return (
      <div className={cn('aspect-[5/7] w-full rounded-2xl border border-dashed border-border p-4 text-center', className)}>
        <div className="flex h-full w-full flex-col items-center justify-center gap-2">
          <p className="text-xs text-muted-foreground">还没有在看的番</p>
          <Button asChild size="sm" variant="outline">
            <Link to="/discover">去发现挑一部</Link>
          </Button>
        </div>
      </div>
    );
  }

  const entry = spotlight;
  return (
    <Link
      to={subjectPath(entry.sourceId)}
      className={cn('group relative block overflow-hidden rounded-2xl ring-1 ring-border/60', className)}
    >
      <Cover
        src={entry.poster}
        alt={displayTitle(entry)}
        className={cn('aspect-[5/7] w-full', COVER_ZOOM)}
        chips={
          <span className="absolute left-2 top-2">
            <span className="rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-white backdrop-blur">继续在看</span>
          </span>
        }
      />
      <span className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-black/80 via-black/40 to-transparent p-2.5">
        <span className="block truncate text-2xs font-medium text-white">{displayTitle(entry)}</span>
        <span className="mt-1 flex items-center gap-1 text-2xs text-white/75">
          第 {episodeProgressText(entry.progress, entry.totalEps)}
        </span>
        <ProgressMeter
          value={entry.progress}
          total={entry.totalEps}
          label={`《${displayTitle(entry)}》观看进度`}
          className="mt-1 h-1 bg-white/25 [&>div]:bg-white"
        />
      </span>
    </Link>
  );
}

/** 首页下方的一组番剧卡：封面大图网格，与发现页同一套排法。 */
export function HomeEntryGrid({
  entries,
  empty,
}: {
  entries: Entry[];
  empty: { text: string; to: string; link: string };
}) {
  if (entries.length === 0) {
    return (
      <EmptyState size="sm">
        {empty.text}{' '}
        <Link to={empty.to} className="font-medium text-primary hover:underline">
          {empty.link}
        </Link>
      </EmptyState>
    );
  }
  return (
    // 固定列数轨道，卡片宽度只跟屏宽走、不跟数量走：手机 2 → 640px 3 → 1024px 4 列。不用 auto-fit：空轨道会被折叠，只有 2 部时两条轨道平分整行，卡片被拉成两倍胖。
    <div className={POSTER_GRID_COMPACT}>
      {entries.map((entry) => (
        <EntryPosterCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
