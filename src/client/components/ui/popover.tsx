import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FOCUS_RESET } from '@/lib/styles';

/* 浮层基元：开合交给 Radix Dialog 的 non-modal 分支，定位自己量 rect。强制 modal={false}：html 上有 scrollbar-gutter: stable，Radix 的滚动锁补偿会让整页左移一个滚动条宽，所以不接受 modal 参数。 */
export function Popover(props: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root modal={false} {...props} />;
}

export const PopoverTrigger = DialogPrimitive.Trigger;
/** 浮层需要可访问名，否则 dialog 角色没有 aria-labelledby；用 sr-only 放一个。 */
export const PopoverTitle = DialogPrimitive.Title;

/** 开合动效，只有本文件用。 */
const POPOVER_MOTION =
  'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95';

type PopoverContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /** 定位锚点：浮层贴在它下方左对齐。 */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** 面板宽度（px），定位按它算右边界。 */
  width?: number;
  sideOffset?: number;
};

export const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, anchorRef, width = 240, sideOffset = 6, children, ...props }, ref) => {
    // 首帧还没有 rect，否则会先画在 (0,0) 再跳一下。
    const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
    // 面板高度渲染后才量得到，首帧按放得下算，量到后校正一次。
    const panelRef = React.useRef<HTMLDivElement | null>(null);
    const settled = React.useRef(false);

    const update = React.useCallback(() => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      // 左右各留 12px，窄屏靠边不顶出视口。
      const maxLeft = window.innerWidth - width - 12;
      const height = panelRef.current?.offsetHeight ?? 0;
      const below = rect.bottom + sideOffset;
      // 下方放不下翻到上方；上方也不够就贴上边距 12px。首帧量不到高度（height 为 0）按放得下算。
      const top =
        below + height > window.innerHeight - 12
          ? Math.max(12, rect.top - height - sideOffset)
          : below;
      setPos({ top, left: Math.max(12, Math.min(rect.left, maxLeft)) });
    }, [anchorRef, width, sideOffset]);

    React.useLayoutEffect(() => {
      settled.current = false;
      update();
      // capture 才收得到内层滚动容器的 scroll。
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
      return () => {
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      };
    }, [update]);

    // 拿到 pos 后面板才渲染、才有高度。校正只做一次，每次重算会让面板上下来回翻。
    React.useLayoutEffect(() => {
      if (!pos || settled.current) return;
      settled.current = true;
      update();
    }, [pos, update]);

    const setRefs = (node: HTMLDivElement | null) => {
      panelRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    };

    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          ref={setRefs}
          className={cn(
            'z-50 rounded-2xl border border-border/70 bg-popover p-3 text-popover-foreground shadow-lg',
            // 浮层打开时自己也会被聚焦，显式清零全局 ring。
            FOCUS_RESET,
            POPOVER_MOTION,
            !pos && 'invisible',
            className,
          )}
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, width }}
          {...props}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  },
);
PopoverContent.displayName = 'PopoverContent';

/** 下拉箭头：尺寸与颜色由调用方给。 */
export function PopoverChevron({ className }: { className?: string }) {
  return (
    <ChevronDown className={cn('size-3.5 transition-transform group-data-[state=open]:rotate-180', className)} />
  );
}
