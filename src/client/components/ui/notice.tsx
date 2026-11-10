import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

type Props = {
  /** 大号数字（404 / 500），这一屏的视觉主体。 */
  code: number;
  title: string;
  /** 一句说明。 */
  detail: ReactNode;
  /** 操作按钮组。 */
  children?: ReactNode;
};

/** 整页提示：大号数字 + 标题 + 说明 + 按钮组。只抽骨架，文案与按钮留给调用方。 */
export function Notice({ code, title, detail, children }: Props) {
  return (
    <div className="mx-auto max-w-md px-6 py-20 text-center">
      <p className="text-5xl font-semibold tracking-tight text-primary/70">{code}</p>
      <h1 className="mt-3 text-xl font-semibold">{title}</h1>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{detail}</p>
      {children ? <div className="mt-6 flex justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** 「回首页 / 打开书库」这对出口，路由兜底与错误边界共用。 */
export function NoticeLinks() {
  return (
    <>
      <Button asChild size="sm" variant="outline">
        <Link to="/">回首页</Link>
      </Button>
      <Button asChild size="sm" variant="outline">
        <Link to="/library">打开书库</Link>
      </Button>
    </>
  );
}

/** 404 的标题与说明，两处共用；出口按钮各自给，所以不含 children。 */
export const NOT_FOUND = {
  code: 404,
  title: '这一页不在手帐里',
  detail: '链接可能过期了，或者条目已经被删除。',
} as const;
