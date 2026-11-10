import { Link } from 'react-router';
import { RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/api-client';
import { EmptyState } from '@/components/ui/empty-state';

type Props = {
  /** 查询抛出的错误：优先取可展示文案，取不到退回 hint。 */
  error: unknown;
  /** 重试回调，通常是 refetch。 */
  onRetry: () => void;
  title?: string;
  /** 错误本身没有文案时的兜底说明。 */
  hint?: string;
  /** 次要出口的去处与文案，默认回首页。 */
  backTo?: string;
  backLabel?: string;
  className?: string;
};

/** 取数失败时的页面出口：getJson 遇非 2xx 抛错，此时 data 是 undefined，页面只判 !data 会一直停在骨架屏上。 */
export function QueryError({
  error,
  onRetry,
  title = '这一页暂时取不到',
  hint = '',
  backTo = '/',
  backLabel = '回首页',
  className,
}: Props) {
  // 文案与写操作同口径走 errorMessage：只认 userMessage，不读 ApiError.message——后者可能写着「响应缺少 data 层」这类实现细节，还会把调用方的 hint 挤掉。
  return (
    <EmptyState className={className} title={title} hint={errorMessage(error, hint)}>
      <div className="mt-5 flex justify-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw /> 重新加载
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link to={backTo}>{backLabel}</Link>
        </Button>
      </div>
    </EmptyState>
  );
}
