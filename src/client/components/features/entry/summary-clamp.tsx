import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

/** 可折叠长简介：默认露 4 行，超长才出「展开全部」，收起态底部压一层渐隐避免硬切口。量测只能在这里做：-webkit-line-clamp 下超出部分不参与布局、scrollHeight 不可靠，只能临时撤掉收起的类量真实高度，同一同步块内加回不闪。 */
/** 没有中文简介时的兜底文案（只有详情页用）。 */
const EMPTY_SUMMARY = '这个条目还没有中文简介。';

export function SummaryClamp({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const ref = useRef<HTMLParagraphElement | null>(null);

  // 切番时组件实例被复用：折叠状态要跟着文本重置，否则带着上一部的「已展开」进新条目。
  useEffect(() => {
    setOpen(false);
  }, [text]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // 展开态不再测量：测出「不需要折叠」按钮会消失，用户就没法收起。
    if (open) return;
    const measure = () => {
      node.classList.remove('line-clamp-4');
      const full = node.getBoundingClientRect().height;
      node.classList.add('line-clamp-4');
      const shown = node.getBoundingClientRect().height;
      setOverflow(full - shown > 1);
    };
    measure();
    // 窗口变窄会把 4 行挤成 5 行，需要重判要不要按钮。
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text, open]);

  return (
    <>
      <div className="relative">
        <p
          ref={ref}
          className={
            'whitespace-pre-line text-sm leading-relaxed text-foreground/85' + (open ? '' : ' line-clamp-4')
          }
        >
          {text || EMPTY_SUMMARY}
        </p>
        {!open && overflow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-b from-transparent to-card"
          />
        )}
      </div>
      {overflow && (
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="mt-2 inline-flex items-center gap-1 text-2xs font-medium text-primary transition-colors hover:text-primary/80"
        >
          {open ? '收起' : '展开全部'}
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}
    </>
  );
}
