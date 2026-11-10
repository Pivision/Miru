/** 发现页/首页的条目卡：海报 + 番名 + 评分，右上角是「加入片单」按钮。 */
import { useState } from 'react';
import { Link } from 'react-router';
import { Check, Plus, Star } from 'lucide-react';
import { subjectPath } from '@shared/routes';
import { cn } from '@/lib/utils';
import { postJson } from '@/lib/api-client';
import { RECORD_SCOPE, useWrite } from '@/lib/hooks/writes';
import type { Subject } from '@shared/types';
import { fmtDate } from '@/lib/time-format';
import { fmtScore } from '@/lib/number-format';
import { subjectTitle, pickCover } from '@shared/display';
import { Cover, COVER_ZOOM } from '@/components/features/entry/cover-image';
import { Spinner } from '@/components/ui/spinner';

function ScoreChip({ score }: { score: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-black/60 px-1.5 py-0.5 text-2xs font-medium text-white backdrop-blur">
      <Star className="size-2.5 shrink-0 fill-amber-400 text-amber-400" />
      {fmtScore(score)}
    </span>
  );
}

/** 「已收藏」的视觉：轨道上那一格只剩这个对勾，样式与 AddButton 成功后一致。两处各画一遍迟早漂成两种绿，所以只留一份。 */
const TRACKED_FILL = 'bg-primary text-primary-foreground';

function TrackedBadge() {
  return (
    <span
      className={cn('grid size-7 place-items-center rounded-full shadow ring-1 ring-border/60', TRACKED_FILL)}
      title="已收藏"
      aria-label="已收藏"
      role="img"
    >
      <Check className="size-3.5" />
    </span>
  );
}

/** 加入片单：海报右上角的圆形图标按钮。 */
function AddButton({ subjectId }: { subjectId: number }) {
  const [done, setDone] = useState(false);

  const add = useWrite({
    scope: RECORD_SCOPE,
    mutationFn: () => postJson('/records', { subject_id: subjectId, status: 'planned' }),
    success: '已加入想看片单',
    onSuccess: () => setDone(true),
  });
  const busy = add.isPending;

  function onClick() {
    add.mutate();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || done}
      title={done ? '已收藏' : '加入想看'}
      /* 读屏不把 title 当按钮名；收藏后只剩一个对勾图标，必须显式给出名称与状态。 */
      aria-label={done ? '已收藏' : '加入想看'}
      aria-pressed={done}
      className={cn(
        'grid size-7 place-items-center rounded-full bg-background/85 text-foreground shadow ring-1 ring-border/60 backdrop-blur transition-colors hover:bg-primary hover:text-primary-foreground',
        done && TRACKED_FILL,
      )}
    >
      {done ? <Check className="size-3.5" /> : busy ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
    </button>
  );
}

export function SubjectCard({ subject, tracked }: { subject: Subject; tracked?: boolean }) {
  const cover = pickCover(subject.images);
  return (
    <div className="group relative">
      <Link to={subjectPath(subject.id)} className="block">
        <div className="relative aspect-[5/7] overflow-hidden rounded-xl bg-muted shadow-xs ring-1 ring-border/50">
          <Cover
            src={cover}
            alt={subjectTitle(subject)}
            className={cn('size-full', COVER_ZOOM)}
            rounded=""
            chips={
              subject.score > 0 ? (
                <span className="absolute bottom-1.5 left-1.5">
                  <ScoreChip score={subject.score} />
                </span>
              ) : null
            }
          />
        </div>
        <p className="mt-2 line-clamp-1 text-sm font-medium leading-snug">{subjectTitle(subject)}</p>
        <p className="line-clamp-1 text-2xs text-muted-foreground">
          {[subject.date ? fmtDate(subject.date) : null, subject.platform].filter(Boolean).join(' · ')}
        </p>
      </Link>
      <div className="absolute right-1.5 top-1.5">
        {tracked ? (
          <TrackedBadge />
        ) : (
          <AddButton subjectId={subject.id} />
        )}
      </div>
    </div>
  );
}
