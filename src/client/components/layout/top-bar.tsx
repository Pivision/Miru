import { useLocation, useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_ICON, THEME_LABELS, useTheme, type ThemeChoice } from '@/lib/hooks/theme';
import { useUrlTerm } from '@/lib/hooks/url-term';
import { readDiscoverFilters } from '@shared/library-filters';
import { useQueryHref } from '@/lib/hooks/query-href';
import { Input } from '@/components/ui/input';
import { SEARCH_ICON } from '@/lib/styles';

/** 循环切换 light → dark → system。侧栏、顶栏、登录页共用。 */
export function ThemeButton({ compact = false }: { compact?: boolean }) {
  const { choice, setTheme } = useTheme();
  const Icon = THEME_ICON[choice];
  const next: ThemeChoice = choice === 'light' ? 'dark' : choice === 'dark' ? 'system' : 'light';
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`当前：${THEME_LABELS[choice]}（点击切换）`}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground',
        compact && 'size-9 justify-center border-0 bg-transparent px-0',
      )}
    >
      <Icon className="size-4" />
      {!compact && <span>{THEME_LABELS[choice]}</span>}
    </button>
  );
}

export function SearchBox() {
  const navigate = useNavigate();
  const location = useLocation();
  const href = useQueryHref();
  // URL 里的 q 是唯一真相：站内跳转改了 q 输入框跟着走。走 shared 解析而非 get('q')，trim 与超长截断才和发现页一致。
  const q = readDiscoverFilters(new URLSearchParams(location.search), 1).q;
  const [term, setTerm] = useUrlTerm(q);

  return (
    <form
      action="/discover"
      method="get"
      className="relative flex-1"
      onSubmit={(event) => {
        event.preventDefault();
        const q = term.trim();
        // 永远落到 /discover 且只带 q：传 to 让 useQueryHref 从空查询串起拼，其余筛选随之清空。
        navigate(href({ q: q || null }, '/discover'));
      }}
    >
      <Search className={SEARCH_ICON} />
      {/* 保留 Input 自带的 focus-visible:ring-2，不再另写一套 focus 样式。 */}
      <Input
        name="q"
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        /* placeholder 不算可访问名，必须补 aria-label。 */
        aria-label="搜索番剧"
        placeholder="搜索番剧，比如 芙莉莲"
        className="rounded-full border-border/70 bg-card/70 pl-10 pr-4 shadow-xs focus-visible:border-primary/50"
      />
    </form>
  );
}
