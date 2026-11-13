import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { CalendarDays, Search } from 'lucide-react';
import { useDiscover } from '@/lib/hooks/query';
import { weekdayId, weekdayLabel, nowSec } from '@shared/time';
import { cn } from '@/lib/utils';
import { PILL_ACTIVE, PILL_IDLE, POSTER_GRID, SEARCH_ICON } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { useQueryHref } from '@/lib/hooks/query-href';
import { Pager } from '@/components/layout/pager';
import { SubjectCard } from '@/components/features/entry/subject-card';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PosterGridSkeleton } from '@/components/layout/page-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { readDiscoverFilters } from '@shared/library-filters';
import type { CalendarDay } from '@shared/types';
import { useUrlTerm } from '@/lib/hooks/url-term';
import { SearchSuggestions } from '@/components/features/entry/search-suggestions';

/** 放送表的七个标签。?? 挡不住空数组：上游挂掉时 calendar 是 []，必须用 length 判断，否则标签栏空掉连「点周几」都做不到。 */
function weekTabs(calendar: CalendarDay[] | undefined): CalendarDay[] {
  if (calendar?.length) return calendar;
  return Array.from({ length: 7 }, (_, i) => ({ weekday: i + 1, items: [] }));
}

export default function DiscoverRoute() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const { data, isError, error, refetch } = useDiscover(search);
  const href = useQueryHref();

  // weekday 用与接口同一份解析，读 URL 而非 data：首帧 data 是 undefined，读 data 会让选中日先跳回今天再跳回去。「今天」取服务端下发的 data.now，客户端算会跨日边界对不上。
  const today = data ? weekdayId(data.now) : weekdayId(nowSec());
  // 判据与接口同源，q 的 80 字截断不会两边不一致。
  const { q, weekday: day } = useMemo(() => readDiscoverFilters(params, today), [params, today]);

  // 清空、点建议词、后退都只改 URL，输入框靠 useUrlTerm 拉回。
  const [term, setTerm] = useUrlTerm(q);

  const activeDay = data?.calendar.find((item) => item.weekday === day);
  const mode = q ? 'search' : 'calendar';

  return (
    <div className="space-y-6">
      <PageHeader
        title="发现"
        description="搜索 Bangumi 上的番剧，或者翻翻今天的放送表。找到喜欢的条目，点右上角 + 加入片单。"
      />

      <Card padding="sm" className="space-y-3">
        <form
          className="relative"
          onSubmit={(event) => {
            event.preventDefault();
            navigate(href({ q: term.trim() || null, weekday: null, page: null }));
          }}
        >
          <Search className={SEARCH_ICON} />
          <Input
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="搜索番剧标题，比如「芙莉莲」"
            aria-label="搜索 Bangumi"
            className="h-11 pl-10 pr-24"
          />
          <Button type="submit" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2">
            搜索
          </Button>
        </form>
        <SearchSuggestions href={href} />
      </Card>

      {mode === 'calendar' && (
        <div className="flex gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card p-1 shadow-xs">
          {weekTabs(data?.calendar).map((item) => (
            <Link
              key={item.weekday}
              to={href({ weekday: item.weekday, q: null, page: null })}
              aria-current={item.weekday === day ? 'page' : undefined}
              className={cn(
                'flex-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-center text-xs font-medium transition-colors',
                item.weekday === day ? PILL_ACTIVE : PILL_IDLE,
              )}
            >
              周{weekdayLabel(item.weekday)}
            </Link>
          ))}
        </div>
      )}

      <QueryBoundary
        data={data}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        errorTitle="这一页暂时打不开"
        errorHint="放送表和搜索结果都取不到，稍后再试。"
        skeleton={<PosterGridSkeleton className="gap-3" />}
      >
        {(result) => {
          // 两个模式只差标题行与列表来源，网格与卡片完全一样，只渲染一次。
          const items = mode === 'search' ? (result.results ?? []) : (activeDay?.items ?? []);
          return (
            <>
              <div className="flex items-baseline justify-between">
                {mode === 'search' ? (
                  <h2 className="text-lg font-medium">
                    「{result.q}」的搜索结果
                  </h2>
                ) : (
                  <h2 className="inline-flex items-center gap-2 text-lg font-medium">
                    <CalendarDays className="size-4 text-primary" />
                    周{weekdayLabel(day)} 放送
                    <span className="text-xs font-normal text-muted-foreground">{items.length} 部</span>
                  </h2>
                )}
                {mode === 'search' && (
                  <Link to={href({ q: null, page: null })} className="text-2xs text-muted-foreground hover:text-foreground">
                    清除搜索
                  </Link>
                )}
              </div>

              {items.length === 0 ? (
                <EmptyState
                  hint={
                    mode === 'search'
                      ? `没有搜到「${result.q}」，换个名字试试？日文原名通常更准。`
                      : activeDay
                        ? '这一天没有番在放送，换一天看看。'
                        : '放送表暂时取不到，先搜索吧。'
                  }
                />
              ) : (
                <div className={POSTER_GRID}>
                  {items.map((subject) => (
                    <SubjectCard key={subject.id} subject={subject} tracked={result.tracked.includes(subject.id)} />
                  ))}
                </div>
              )}

              {mode === 'search' && (
                <Pager
                  page={result.page}
                  totalPages={result.pages}
                  total={result.total}
                  href={href}
                  className="gap-2"
                  edge="hidden"
                />
              )}
            </>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
