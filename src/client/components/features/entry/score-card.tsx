import { cn } from '@/lib/utils';
import { fmtScore, groupThousands as group } from '@/lib/number-format';
import type { Subject } from '@shared/types';
import { Card } from '@/components/ui/card';

/** 数据来自 subject.scoreBuckets（服务端已摊平）。 */
export function ScoreCard({ subject }: { subject: Subject }) {
  // 兜底：subject 缓存里可能还是加字段之前的旧结构（命中缓存时不会再过 normalizeSubject），不能假设 scoreBuckets 一定存在。
  const buckets = subject.scoreBuckets ?? [];
  // normalizeScoreBuckets 保证 length 只可能是 0 或 10，所以只需判「有没有正数」。
  const hasBuckets = buckets.some((n) => n > 0);
  const hasScore = subject.score > 0;

  // 拿不到分布（count 缺失或全 0）时退化成占位卡，右栏不留空洞；若总分还在就留着分数，只说明「暂无评分分布」，不白丢一个已知的 8.5。
  if (!hasBuckets) {
    return (
      <Card padding="md" className="text-2xs leading-snug text-muted-foreground">
        <p className="font-medium text-foreground">Bangumi 评分</p>
        {hasScore ? (
          <>
            <p className="mt-1.5 text-2xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
              {fmtScore(subject.score)}
            </p>
            {subject.votes > 0 ? (
              <p className="mt-1 tabular-nums">{group(subject.votes)} 人评分 · 暂无分布数据</p>
            ) : (
              <p className="mt-1">暂无评分分布</p>
            )}
          </>
        ) : (
          <p className="mt-1">暂无评分</p>
        )}
      </Card>
    );
  }

  const max = Math.max(...buckets);
  const peak = buckets.indexOf(max) + 1;
  // 高度取一位小数，避免把 8.940192128912303% 这类长小数写进 style。
  const heightOf = (count: number) => (count > 0 ? `${Math.max(4, Math.round((count / max) * 1000) / 10)}%` : '2px');
  const summary = `评分分布：${buckets.map((n, i) => `${i + 1} 分 ${group(n)} 人`).join('，')}；最高为 ${peak} 分`;

  return (
    <Card padding="md">
      <p className="text-2xs font-medium leading-snug text-foreground">Bangumi 评分</p>

      <div className="mt-1.5 flex items-baseline gap-2">
        {hasScore ? (
          <span className="text-2xl font-semibold leading-none tracking-tight tabular-nums">
            {fmtScore(subject.score)}
          </span>
        ) : (
          <span className="text-2xl font-semibold leading-none tracking-tight text-muted-foreground">—</span>
        )}
        {subject.votes > 0 && (
          <span className="text-2xs leading-snug text-muted-foreground tabular-nums">
            {group(subject.votes)} 人评分
          </span>
        )}
      </div>

      {/* 十根 12px 柱 + 九道 8px 间距 = 192px（w-48），整块居中，不撑满卡片宽度 */}
      <div aria-hidden className="mx-auto mt-3 flex h-16 w-48 items-end gap-2">
        {buckets.map((count, i) => (
          <div
            key={i}
            title={`${i + 1} 分 · ${group(count)} 人`}
            className={cn(
              'w-3 shrink-0 rounded-sm transition-colors',
              // primary/70 在浅色主题下与卡片底只有 2.85:1，低于 WCAG 1.4.11 的 3:1，抬到 0.85 后约 3.7:1
              count > 0 ? 'bg-primary/85 hover:bg-primary' : 'bg-border',
            )}
            style={{ height: heightOf(count) }}
          />
        ))}
      </div>
      <div aria-hidden className="mx-auto mt-1 flex w-48 justify-between text-2xs leading-snug text-muted-foreground">
        <span>1</span>
        <span>10</span>
      </div>
      <p className="sr-only">{summary}</p>
    </Card>
  );
}
