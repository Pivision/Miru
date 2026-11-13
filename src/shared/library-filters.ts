/** 列表页查询串解析：/api/library 与前端共用。只放服务端会让首帧筛选条先高亮「全部」再跳回；各写一份则判据必然漂移。 */
import { MAX_PAGE, QUERY_MAX_LENGTH } from './limits';
import { isStatus, type LibraryFilters, type LibrarySort, type LibraryView } from './types';

/** 排序方式唯一一份：键必须覆盖 LibrarySort，少一个编译期就报错。 */
const SORT_LABELS: Record<LibrarySort, string> = {
  updated: '最近更新',
  rating: '评分最高',
  title: '标题顺序',
  air_date: '放送时间',
  created: '加入时间',
};

export const SORT_OPTIONS = (Object.keys(SORT_LABELS) as LibrarySort[]).map((value) => ({
  value,
  label: SORT_LABELS[value],
}));

/** 页号：只认正整数且不超 MAX_PAGE，Infinity / 2.5 / -1 一律回第 1 页（直接算 offset 会得到 NaN）。 */
function readPage(params: URLSearchParams): number {
  const raw = Number(params.get('page'));
  return Number.isSafeInteger(raw) && raw > 0 ? Math.min(raw, MAX_PAGE) : 1;
}

export function readLibraryFilters(params: URLSearchParams): LibraryFilters {
  const status = params.get('status') ?? 'all';
  const sort = params.get('sort') ?? 'updated';
  return {
    status: isStatus(status) ? status : 'all',
    q: (params.get('q') ?? '').slice(0, QUERY_MAX_LENGTH),
    sort: Object.hasOwn(SORT_LABELS, sort) ? (sort as LibrarySort) : 'updated',
    page: readPage(params),
  };
}

/** 呈现方式：服务端不读，单独解析；留在 shared 是因为书架页与「切换视图」链接要按同一份规则读 ?view=。 */
export function readLibraryView(params: URLSearchParams): LibraryView {
  return params.get('view') === 'list' ? 'list' : 'grid';
}

/** 放送表选中周几（1–7）。越界/非整数回落到调用方给的 today。 */
function readWeekday(params: URLSearchParams, today: number): number {
  const raw = Number(params.get('weekday'));
  return Number.isInteger(raw) && raw >= 1 && raw <= 7 ? raw : today;
}

/** 发现页：搜索词与页号沿用书架的口径，多一个选中日。 */
export function readDiscoverFilters(params: URLSearchParams, today: number) {
  const { q, page } = readLibraryFilters(params);
  // 只在这里 trim：空白查询会被当成有搜索词，白跑一次上游还可能 502 打挂放送表。
  return { q: q.trim(), page, weekday: readWeekday(params, today) };
}
