import { cn } from '@/lib/utils';
import { POSTER_GRID } from '@/lib/styles';

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-xl bg-muted/60', className)} />;
}

/** 与真实网格共用同一套列轨道，避免首帧跳动。 */
export function PosterGridSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn(POSTER_GRID, className)}>
      {Array.from({ length: 12 }).map((_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="aspect-[5/7]" />
          <Skeleton className="h-3 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}

export function RowListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-[78px] rounded-2xl" />
      ))}
    </div>
  );
}

/** 只示意体量，不求与真实布局逐格对齐。 */
export function HomeSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-40 rounded-3xl" />
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export function SubjectSkeleton() {
  return (
    <div className="mx-auto w-full max-w-content space-y-4 px-4 pt-6 lg:px-8 lg:pt-8">
      <Skeleton className="h-56 rounded-3xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}
