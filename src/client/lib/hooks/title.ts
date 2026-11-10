import { useEffect } from 'react';

/** 标签页标题：纯 SPA 没有服务端 meta，只能由页面自己写。放在 effect 里而非渲染期直接赋值：渲染期改 document 在并发渲染下会写错。传 null 表示「这一轮没有要覆盖的标题」：详情页数据回来前就是这样，由 app.tsx 按路径设的标题继续生效，不会先闪一下再改。 */
export function usePageTitle(title: string | null) {
  useEffect(() => {
    if (title !== null) document.title = title;
  }, [title]);
}
