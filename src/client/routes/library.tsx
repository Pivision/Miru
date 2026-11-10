import { useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { LayoutGrid, List, Search, SlidersHorizontal } from 'lucide-react';
import { useLibrary } from '@/lib/hooks/query';
import { STATUS_META, STATUS_ORDER } from '@shared/types';
import { cn } from '@/lib/utils';
import { POSTER_GRID_WIDE } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EntryCard, EntryPosterCard } from '@/components/features/entry/entry-cards';
import { PageHeader } from '@/components/layout/page-header';
import { useQueryHref } from '@/lib/hooks/query-href';
import { Pager } from '@/components/layout/pager';
import { Card } from '@/components/ui/card';
import { PosterGridSkeleton, RowListSkeleton } from '@/components/layout/page-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { SORT_OPTIONS, readLibraryFilters, readLibraryView } from '@shared/library-filters';
import { useUrlTerm } from '@/lib/hooks/url-term';
import { StatusPill } from '@/components/features/entry/status-pill';

/** 视图切换的两档：query 是写进 URL 的值（网格是默认档，为 null 表示删掉参数），与 readLibraryView 的判据一致。 */
const VIEW_TOGGLES = [
  { value: 'grid', query: null, label: '网格视图', icon: LayoutGrid },
  { value: 'list', query: 'list', label: '列表视图', icon: List },
] as const;

export default function LibraryRoute() {
  const { search } = useLocation();
  const navigate = useNavigate();
  const href = useQueryHref();

  // 筛选条件与接口共用同一份解析（@shared/library-filters）。读 URL 而非 data：首帧 data 是 undefined，读 data 会让筛选条先高亮「全部」、搜索框回显空串，再跳回真实值。
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const filters = useMemo(() => readLibraryFilters(params), [params]);
  const { status, q, sort, page } = filters;
  // view 只管渲染，不进 filters（服务端不读），取数键与切换视图互不干扰。
  const view = useMemo(() => readLibraryView(params), [params]);
  const { data, isError, error, refetch } = useLibrary(filters);

  // 提交式搜索（回车才改 URL）：打字期间不被打断，后退回来又能回显。
  const [term, setTerm] = useUrlTerm(q);

  const counts = data?.counts;
  const totalPages = data?.pages ?? 1;

  return (
    <div className="space-y-6">
      <PageHeader
        title="书库"
        description="所有记录都在这里：想看、在看、看过、搁置与抛弃。点封面回到详情页继续写。"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/discover">
              <Search /> 找新番
            </Link>
          </Button>
        }
      />

      <Card padding="sm" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill active={status === 'all'} to={href({ status: null, page: null })} label="全部" count={counts?.all ?? 0} />
          {STATUS_ORDER.map((value) => (
            <StatusPill
              key={value}
              active={status === value}
              to={href({ status: value, page: null })}
              label={STATUS_META[value].label}
              count={counts?.[value] ?? 0}
            />
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form
            className="relative min-w-[180px] flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(href({ q: term.trim() || null, page: null }));
            }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="搜索标题…"
              className="h-9 pl-8 text-xs"
              aria-label="搜索书库"
            />
          </form>

          <label className="flex items-center gap-1.5 text-2xs text-muted-foreground">
            <SlidersHorizontal className="size-3.5" />
            <span className="sr-only">排序</span>
            <select
              value={sort}
              onChange={(event) => navigate(href({ sort: event.target.value, page: null }))}
              className="h-9 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SORT_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {/* 两个图标按钮是二选一，容器给了 group 语义读屏才知道它们同组。 */}
          <div role="group" aria-label="视图切换" className="flex rounded-lg border border-input p-0.5">
            {VIEW_TOGGLES.map((item) => (
              <Link
                key={item.value}
                to={href({ view: item.query })}
                aria-label={item.label}
                aria-current={view === item.value ? 'page' : undefined}
                className={cn(
                  'grid size-8 place-items-center rounded-md',
                  view === item.value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <item.icon className="size-4" />
              </Link>
            ))}
          </div>
        </div>
      </Card>

      <QueryBoundary
        data={data}
        isError={isError}
        error={error}
        onRetry={() => void refetch()}
        errorTitle="书库暂时打不开"
        errorHint="可能是网络断了，也可能是登录状态失效了。"
        skeleton={
          view === 'list' ? (
            <RowListSkeleton />
          ) : (
            // 书库网格列数比发现页多一档（lg 4 列、2xl 6 列），覆盖默认轨道。
            <PosterGridSkeleton className={POSTER_GRID_WIDE} />
          )
        }
      >
        {(result) => (
          <>
            {result.entries.length === 0 ? (
              <EmptyState
                className="bg-card/40"
                title={q ? `没有找到「${q}」` : '这里还空着'}
                hint={q ? '换个关键词试试，或者去发现页搜索 Bangumi 条目。' : '去发现页搜一部番，把它加进片单吧。'}
              >
                <Button asChild size="sm" className="mt-5">
                  <Link to="/discover">去发现</Link>
                </Button>
              </EmptyState>
            ) : (
              <div className={view === 'list' ? 'flex flex-col gap-2' : POSTER_GRID_WIDE}>
                {result.entries.map((entry) =>
                  view === 'list' ? (
                    <EntryCard key={entry.id} entry={entry} />
                  ) : (
                    <EntryPosterCard key={entry.id} entry={entry} showStatus />
                  ),
                )}
              </div>
            )}

            <Pager
              page={page}
              totalPages={totalPages}
              total={result.total}
              unit="条记录"
              href={href}
            />
          </>
        )}
      </QueryBoundary>
    </div>
  );
}

