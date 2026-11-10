import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 加载指示器：全站唯一的转圈实现。尺寸交给调用方（size-3、size-4…），这里只管「转起来」。aria-hidden 让读屏跳过它：按钮的忙状态另有 disabled 与文案表达，图标本身不是信息。 */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 aria-hidden className={cn('animate-spin', className)} />;
}
