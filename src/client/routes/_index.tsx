import { subjectPath } from '@shared/routes';
import { Link } from 'react-router';
import { CalendarDays, Clock3, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/hooks/auth-context';
import { useHome } from '@/lib/hooks/query';
import { subjectTitle, pickCover } from '@shared/display';
import { weekdayLabel, weekdayId, cnDateParts } from '@shared/time';
import { cnMonthDay } from '@/lib/time-format';
import { SectionTitle } from '@/components/layout/page-header';
import { Cover } from '@/components/features/entry/cover-image';
import {
  HeroEmptyHint,
  HeroLastWatch,
  HeroSpotlight,
  HeroStats,
  HomeEntryGrid,
} from '@/components/features/home';
import { ThoughtList } from '@/components/features/thought/thought-list';
import { HomeSkeleton } from '@/components/layout/page-skeleton';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { Card } from '@/components/ui/card';
import { EYEBROW } from '@/lib/styles';

/** 放送表今天没有条目时的占位文案：上游取不到与真的没番会落到同一份文案，单独提出来便于以后分流。 */
const EMPTY_AIRING_TEXT = '今天没有找到放送信息';

/** 按当前小时给出简短问候；首页只此一处用，所以不单独成模块。 */
function greeting(now: number): string {
  const hour = cnDateParts(now).hour;
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

export default function IndexRoute() {
  const { user } = useAuth();
  const { data, isError, error, refetch } = useHome();

  // 失败 / 骨架 / 内容的三段式统一交给 QueryBoundary，页面里不再手写一遍。
  return (
    <QueryBoundary
      data={data}
      isError={isError}
      error={error}
      onRetry={() => void refetch()}
      errorTitle="首页没加载出来"
      errorHint="可能是网络断了，也可能是上游 Bangumi 暂时不可用；稍后重试通常就好。"
      skeleton={<HomeSkeleton />}
    >
      {(home) => {
        // 日期标题与问候语都用服务端下发的这个「现在」，不在渲染期重算：
        // 客户端算会拿到另一个值，跨小时 / 跨日时首屏与刷新后的文本对不上。
        const now = home.now;
        const dateLabel = `${cnMonthDay(now)} · 周${weekdayLabel(weekdayId(now))}`;

        return (
          <div className="space-y-8">
            <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card p-4 shadow-xs sm:p-5">
              <div className="relative grid gap-4 sm:grid-cols-[minmax(0,1fr)_132px] sm:items-stretch">
                <div className="flex min-w-0 flex-col justify-between gap-3">
                  <div>
                    <p className={EYEBROW}>{dateLabel}</p>
                    <h1 className="mt-2 flex min-w-0 items-baseline gap-x-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
                      <span className="shrink-0 text-muted-foreground">{greeting(now)}，</span>
                      <span className="truncate">{user?.name}</span>
                    </h1>
                    <HeroLastWatch spotlight={home.spotlight} />
                    {home.stats && !home.spotlight && <HeroEmptyHint />}
                  </div>
                  {home.stats && <HeroStats stats={home.stats} />}
                </div>

                <HeroSpotlight spotlight={home.spotlight} className="hidden sm:block" />
              </div>
            </section>

            <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-6">
                <SectionTitle size="lg" className="mb-6">
                  在看
                </SectionTitle>
                <HomeEntryGrid
                  entries={home.watching}
                  empty={{ text: '还没有在看的番。', to: '/discover', link: '去发现挑一部' }}
                />
                <div className="pt-2">
                  <SectionTitle size="lg">想看</SectionTitle>
                </div>
                <HomeEntryGrid
                  entries={home.planned}
                  empty={{ text: '片单还是空的。', to: '/discover', link: '去发现加入想看的' }}
                />
              </section>

              <aside className="space-y-6">
                <section>
                  <SectionTitle className="text-base">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" /> 最近想法
                    </span>
                  </SectionTitle>
                  <Card className="px-4 py-1">
                    <ThoughtList
                      thoughts={home.recentThoughts}
                      empty="还没有想法，打开一部在看中的番写一句吧。"
                    />
                  </Card>
                </section>

                <section>
                  <SectionTitle className="text-base">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-3.5 text-primary" /> 今日放送
                    </span>
                  </SectionTitle>
                  <Card padding="sm" className="space-y-1.5">
                    {home.airingToday.slice(0, 5).map((subject) => (
                      <Link
                        key={subject.id}
                        to={subjectPath(subject.id)}
                        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent"
                      >
                        <Cover
                          src={pickCover(subject.images)}
                          alt={subjectTitle(subject)}
                          className="h-10 w-8"
                          rounded="rounded-md"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{subjectTitle(subject)}</span>
                          {/* 平台为空就整行不渲染：这栏本来就是「放送中」列表，再拿「放送中」顶一遍是同义反复。 */}
                          {subject.platform && (
                            <span className="flex items-center gap-1 text-2xs text-muted-foreground">
                              <Clock3 className="size-2.5" /> {subject.platform}
                            </span>
                          )}
                        </span>
                      </Link>
                    ))}
                    {home.airingToday.length === 0 && (
                      <p className="py-4 text-center text-2xs text-muted-foreground">{EMPTY_AIRING_TEXT}</p>
                    )}
                  </Card>
                </section>
              </aside>
            </div>
          </div>
        );
      }}
    </QueryBoundary>
  );
}
