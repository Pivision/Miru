import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import { EYEBROW } from '@/lib/styles';

/** 登录/注册页的外框：小标 + 标题 + 说明 + 卡片表单 + 脚注。两页各写一遍时漂成了 400px 与 360px。 */
export function AuthLayout({
  kicker,
  title,
  description,
  onSubmit,
  error,
  children,
  footer,
}: {
  /** 大写小标，如 “Welcome back”。 */
  kicker: string;
  title: string;
  description: string;
  onSubmit: (event: React.FormEvent) => void;
  /** 表单级错误，展示在字段上方。 */
  error: string | null;
  /** 字段与提交按钮。 */
  children: ReactNode;
  /** 卡片外的补充说明，可省略。 */
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[400px]">
      <p className={EYEBROW}>{kicker}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-xs text-muted-foreground">{description}</p>

      <Card as="form" onSubmit={onSubmit} className="mt-6 space-y-4">
        <FormError message={error} />
        {children}
      </Card>

      {footer ? (
        <p className="mt-4 text-center text-2xs leading-relaxed text-muted-foreground">{footer}</p>
      ) : null}
    </div>
  );
}
