import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/lib/hooks/auth-context';
import { useSubject } from '@/lib/hooks/query';
import { useRefresh, RECORD_SCOPE } from '@/lib/hooks/writes';
import { usePageTitle } from '@/lib/hooks/title';
import { subjectTitle, pickCover, totalEpisodes } from '@shared/display';
import { pageTitle, subjectPath } from '@shared/routes';
import { postJson, ApiError, errorMessage } from '@/lib/api-client';
import type { Entry } from '@shared/types';
import { Button } from '@/components/ui/button';
import { EpisodeGrid } from '@/components/features/entry/episode-grid';
import { ScoreCard } from '@/components/features/entry/score-card';
import { SubjectHero } from '@/components/features/entry/subject-hero';
import { SummaryClamp } from '@/components/features/entry/summary-clamp';
import { ThoughtForm } from '@/components/features/thought/thought-form';
import { ThoughtList } from '@/components/features/thought/thought-list';
import { Card } from '@/components/ui/card';
import { SectionTitle } from '@/components/layout/page-header';
import { SubjectSkeleton } from '@/components/layout/page-skeleton';
import { NOT_FOUND, Notice } from '@/components/ui/notice';
import { QueryError } from '@/components/ui/query-error';

function SubjectNotFound() {
  // 与路由兜底共用 NOT_FOUND 文案，只换出口按钮。
  return (
    <Notice {...NOT_FOUND}>
      <Button asChild variant="outline" size="sm">
        <Link to="/discover">回发现页搜索</Link>
      </Button>
    </Notice>
  );
}

/** 详情取不到的兜底：首屏请求失败与上游没有这个条目两条路都落到这里。 */
function SubjectLoadError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="px-4 pt-6 lg:px-8 lg:pt-8">
      <QueryError
        className="mx-auto max-w-md"
        title="番剧数据暂时取不到"
        error={error}
        hint="Bangumi 可能正忙，稍后再试。"
        onRetry={onRetry}
        backTo="/discover"
        backLabel="回发现页搜索"
      />
    </div>
  );
}

/** 详情页三种结局：id 非法与上游无此条目都 404，取数失败给重试。 */
export default function SubjectRoute() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const path = subjectPath(id);
  const { data, isError, error, refetch: reload } = useSubject(id);
  const refresh = useRefresh();
  const numericId = Number(id);
  const validId = Number.isInteger(numericId) && numericId > 0;

  // 必须在提前 return 之前：hook 数量变化会抛 "Rendered more hooks than during the previous render"，整棵树卸载成白屏。
  const [jumping, setJumping] = useState<number | null>(null);

  // 有作品名就覆盖，没有就不动（PAGE_TITLES 里没有 /subject，再算只会多一次 effect）。
  usePageTitle(data?.subject ? pageTitle(path, subjectTitle(data.subject)) : null);

  // 与 hero 里的状态/评分同属一个 scope：服务端整行读改写，并发会互相覆盖。不用 useWrite：要 await 落库后的集数再提示。
  const progressWrite = useMutation({
    scope: { id: RECORD_SCOPE },
    mutationFn: ({ id: entryId, value }: { id: string; value: number }) =>
      postJson<{ entry: Entry }>(`/records/${entryId}/progress`, { value }),
  });

  // 非法 id 一定是 404，不必等接口。
  if (!validId) return <SubjectNotFound />;

  // 首屏数据还没回来，先给骨架屏。
  if (!data) {
    // 失败时 data 也是 undefined：必须先判错误，否则永远停在骨架屏。
    if (isError) {
      // 接口 404 表示上游也没有这个条目，与 id 非法同一个出口。
      if (error instanceof ApiError && error.status === 404) return <SubjectNotFound />;
      return <SubjectLoadError error={error} onRetry={() => void reload()} />;
    }
    return <SubjectSkeleton />;
  }

  if (!data.subject) {
    return <SubjectLoadError error={data.error} onRetry={() => void reload()} />;
  }

  const { subject, entry, episodes, thoughts } = data;
  const watched = entry?.progress ?? 0;
  // 总集数走 shared 统一口径，占比换算交给 ProgressMeter。
  const totalEps = totalEpisodes(subject.eps, episodes.length);

  async function setProgressTo(number: number) {
    if (!entry || jumping !== null) return;
    setJumping(number);
    try {
      // 与 hero 共用同一个 mutation scope：服务端整行读改写，并发时后写的会拿旧快照覆盖。
      const saved = await progressWrite.mutateAsync({ id: entry.id, value: number });
      // 报落库后的集数：重复点已看过的集会原样回，照抄点击值会说过头。
      toast.success(`已标记到第 ${saved.entry.progress} 集`);
      refresh();
    } catch (error) {
      toast.error(errorMessage(error, '更新失败'));
    } finally {
      setJumping(null);
    }
  }
  const cover = pickCover(subject.images);

  return (
    <div className="space-y-7">
      {/* hero 通栏：海报铺满主内容区，只留 isolate + overflow-hidden 防背景层外溢。 */}
      <SubjectHero subject={subject} entry={entry} user={user} path={path} cover={cover} />

      {/* main 不提供容器与内边距，这里自补同宽包裹；垂直间距交给外层 space-y-7，别再加 pt。 */}
      <div className="mx-auto grid w-full max-w-content gap-6 px-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-8">
        <div className="space-y-6">
          {episodes.length > 0 && (
            <EpisodeGrid
              episodes={episodes}
              watched={watched}
              totalEps={totalEps}
              enabled={!!entry}
              jumping={jumping}
              onPick={setProgressTo}
            />
          )}

          <Card as="section">
            <SectionTitle size="md" className="mb-0">简介</SectionTitle>
            <div className="mt-2">
              <SummaryClamp text={subject.summary} />
            </div>
          </Card>

          <Card as="section">
            <div className="flex items-baseline justify-between">
              <SectionTitle size="md" className="mb-0">我的想法</SectionTitle>
              <span className="text-2xs text-muted-foreground">{thoughts.length} 条</span>
            </div>
            {user && entry ? (
              <div className="mt-3 space-y-2">
                <ThoughtForm entryId={entry.id} />
                <ThoughtList thoughts={thoughts} />
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                {user ? '先把它加入片单，就能边看边记想法了。' : '登录后可以记录想法、评分与进度。'}
              </p>
            )}
          </Card>

          {subject.infobox.length > 0 && (
            <Card as="section">
              <SectionTitle size="md" className="mb-0">详细信息</SectionTitle>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
                {subject.infobox.map((item) => (
                  <div key={item.key} className="flex gap-2">
                    <dt className="shrink-0 text-muted-foreground">{item.key}</dt>
                    <dd className="min-w-0 text-foreground/85">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>

        {/* 记录操作与「加入」都在 hero 里，这里只放评分与条目数据卡，避免同屏两个入口。 */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <ScoreCard subject={subject} />
          <Card padding="md" className="text-2xs text-muted-foreground">
            <p className="font-medium text-foreground">条目数据</p>
            <p className="mt-1 leading-relaxed">
              资料与封面来自 Bangumi
            </p>
          </Card>
        </aside>
      </div>
    </div>
  );
}
