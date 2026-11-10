import type { ReactNode } from 'react';
import { QueryError } from '@/components/ui/query-error';

type Props<T> = {
  /** undefined 表示首帧还没回来。 */
  data: T | undefined;
  isError: boolean;
  error: unknown;
  /** 重试回调，通常是 refetch。 */
  onRetry: () => void;
  /** 首帧占位，每个页面形状不同。 */
  skeleton: ReactNode;
  /** 错误态的标题与兜底说明。 */
  errorTitle?: string;
  errorHint?: string;
  children: (data: T) => ReactNode;
};

/** 页面取数的三段式出口：首帧失败 → 骨架屏 → 内容（有内容时错误只作提示条）。顺序有讲究：失败时 data 同样是 undefined，不先判错误页面会永久停在转圈上；data 有值时重取失败也要继续渲染，否则一次后台重取失败就把整页换成错误页。 */
export function QueryBoundary<T>({
  data,
  isError,
  error,
  onRetry,
  skeleton,
  errorTitle,
  errorHint,
  children,
}: Props<T>) {
  if (data === undefined) {
    if (isError) {
      return <QueryError error={error} onRetry={onRetry} title={errorTitle} hint={errorHint} />;
    }
    return <>{skeleton}</>;
  }
  return (
    <>
      {isError && <QueryError error={error} onRetry={onRetry} title={errorTitle} hint={errorHint} />}
      {children(data)}
    </>
  );
}
