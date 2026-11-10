/** 发现页的搜索建议词。全部都会被渲染，不要放「永远显示不到」的项。 */
import { Link } from 'react-router';
import type { QueryHref } from '@/lib/hooks/query-href';

const SUGGESTIONS = ['芙莉莲', '进击的巨人', '孤独摇滚', '命运石之门', '86', '轻音少女'];

/** 只改 URL 的 q：其余筛选（weekday、page）随之清空。 */
export function SearchSuggestions({ href }: { href: QueryHref }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-2xs text-muted-foreground">试试</span>
      {SUGGESTIONS.map((word) => (
        <Link
          key={word}
          to={href({ q: word, weekday: null, page: null })}
          className="rounded-full bg-accent px-2.5 py-1 text-2xs text-accent-foreground transition-colors hover:bg-primary/10 hover:text-primary"
        >
          {word}
        </Link>
      ))}
    </div>
  );
}
