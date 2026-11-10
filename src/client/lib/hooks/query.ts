/** 查询键与取数钩子：每个页面一个 GET，键里带上影响结果的查询串。getJson 已剥掉 { ok, data } 外层，这里拿到的是页面数据本体。 */
import { useQuery } from '@tanstack/react-query';
import type {
  DiscoverData,
  HomeData,
  LibraryData,
  LibraryFilters,
  SessionUser,
  SettingsData,
  SubjectData,
} from '@shared/types';
import { getJson } from '@/lib/api-client';

export const queryKeys = {
  session: ['session'] as const,
  home: ['home'] as const,
  library: (search: string) => ['library', search] as const,
  discover: (search: string) => ['discover', search] as const,
  subject: (id: string) => ['subject', id] as const,
  settings: ['settings'] as const,
};

/** 除会话外的 query 一律算「上一个用户的数据」：写完刷新与退出清理都要跳过会话那条，判据只留这一份。 */
export function isNotSessionQuery(query: { queryKey: readonly unknown[] }): boolean {
  return query.queryKey[0] !== queryKeys.session[0];
}

/** 当前登录用户：只在启动时取一次，之后由登录 / 改名 / 退出直接改写缓存。 */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => getJson<{ user: SessionUser | null }>('/session'),
    staleTime: Infinity,
  });
}

export function useHome() {
  return useQuery({ queryKey: queryKeys.home, queryFn: () => getJson<HomeData>('/home') });
}

/** 键里只放服务端会读的条件（status/q/sort/page）：view 是纯呈现开关，留在键里会让列表/网格切换变成换键 → data 变 undefined → 闪骨架屏重取。调用方须传 readLibraryFilters 的结果。 */
export function useLibrary(filters: LibraryFilters) {
  const query = new URLSearchParams({
    status: filters.status,
    sort: filters.sort,
    page: String(filters.page),
    ...(filters.q ? { q: filters.q } : {}),
  }).toString();
  return useQuery({
    queryKey: queryKeys.library(query),
    queryFn: () => getJson<LibraryData>(`/library?${query}`),
  });
}

export function useDiscover(search: string) {
  return useQuery({
    queryKey: queryKeys.discover(search),
    queryFn: () => getJson<DiscoverData>(`/discover${search}`),
  });
}

export function useSubject(id: string) {
  return useQuery({
    queryKey: queryKeys.subject(id),
    queryFn: () => getJson<SubjectData>(`/subject/${id}`),
  });
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => getJson<SettingsData>('/settings') });
}
