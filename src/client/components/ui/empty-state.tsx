import * as React from 'react';
import { cn } from '@/lib/utils';

type Props = {
  /** 主句：留空只渲染 hint 或 children。 */
  title?: React.ReactNode;
  /** 副句，小一号的灰字。 */
  hint?: React.ReactNode;
  /** md：整页留白占位；sm：夹在内容流里的一句提示。 */
  size?: 'md' | 'sm';
  className?: string;
  /** 内联内容，如按钮或跟在句子后面的链接。 */
  children?: React.ReactNode;
};

/** 空状态 / 错误态提示框：虚线描边 + 居中文字。只抽「虚线框 + 居中」与字号留白档位。注意 p-8 与 px-3/py-6 在 tailwind-merge 里不算同一冲突组，两者都会留在 class 上（以后者生效）。 */
const SIZES = {
  md: {
    box: 'rounded-3xl px-6 py-16',
    title: 'text-lg font-medium',
    hint: 'mt-1.5 text-xs text-muted-foreground',
  },
  sm: {
    box: 'rounded-2xl p-8 text-xs text-muted-foreground',
    // 不能留 undefined：sm 档传了 title 会渲染成「有这句但不显眼」，调用方只好各自补字号。
    title: 'text-sm font-medium',
    hint: 'mt-1 text-muted-foreground',
  },
} as const;

export function EmptyState({ title, hint, size = 'md', className, children }: Props) {
  const style = SIZES[size];
  return (
    <div className={cn('border border-dashed border-border text-center', style.box, className)}>
      {title ? <p className={style.title}>{title}</p> : null}
      {hint ? <p className={style.hint}>{hint}</p> : null}
      {children}
    </div>
  );
}
