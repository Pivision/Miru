import { useMemo } from 'react';
import { useLocation } from 'react-router';

/** 改几个查询参数后的站内链接生成器。`patch` 的键与值语义见 useQueryHref。 */
export type QueryHref = (patch: Record<string, string | number | null>, to?: string) => string;

/**
 * 把当前查询串改几个参数后的站内链接：值传 null 或空串就删掉该参数，page 回到 1 也删掉。
 * 传了 `to` 就按目标路径重新拼（只带 patch 里的参数），用于「跳到另一页且不带旧筛选」。
 */
export function useQueryHref(): QueryHref {
  const { pathname, search } = useLocation();
  return useMemo(() => {
    return (patch: Record<string, string | number | null>, to?: string) => {
      const next = new URLSearchParams(to === undefined ? search : '');
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '' || (key === 'page' && Number(value) <= 1)) next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      const query = qs ? `?${qs}` : '';
      // 传了 `to` 就必须带上它：只回 `?qs` 会被 React Router 当成相对引用，
      // 结果是「在 /library 上搜索」原地过滤书架，而不是跳到 /discover。
      // 空串按「没传」处理，免得拼出一个空路径。
      return to ? `${to}${query}` : query || pathname;
    };
  }, [pathname, search]);
}
