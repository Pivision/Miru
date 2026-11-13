/** 读接口取数的唯一出处：/api/home、/api/library 等都调这里，前端只渲染。 */
import { PAGE_SIZE } from '@shared/limits';
import type {
  AdminPanelData,
  CalendarDay,
  DiscoverData,
  Episode,
  HomeData,
  LibraryData,
  LibraryFilters,
  SessionUser,
  SettingsData,
  Subject,
  SubjectData,
} from '@shared/types';
import { nowSec, weekdayId } from '@shared/time';
import { readDiscoverFilters } from '@shared/library-filters';
import { BangumiError, getCalendar, getEpisodes, getSubject, searchSubjects } from '../sources/bangumi';
import type { Db } from '../db/client';
import type { Env } from '../env';
import { eq, sql } from 'drizzle-orm';
import type { Stats } from '@shared/types';

import { entries } from '../db/schema';
import { countEntries, getEntryBySubject, listEntries, listTrackedSubjectIds } from './entries';
import { DEFAULT_SOURCE } from './works';
import { listThoughts, recentThoughts } from './thoughts';
import { listInviteCodesWithUses } from './invite';
import { readSiteSettings } from './site-settings';
import { isAdmin } from './account';

/** 首页主栏每格条数：在看/想看各一行，再多该去书架。 */
const HOME_ROW_LIMIT = 8;
/** 最近想法条数：再多会挤掉放送表。 */
const HOME_THOUGHT_LIMIT = 3;

function airingItems(calendar: CalendarDay[], now: number): Subject[] {
  return calendar.find((day) => day.weekday === weekdayId(now))?.items ?? [];
}

function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

export async function getStats(db: Db, userId: string): Promise<Stats> {
  const rows = await db
    .select({
      total: sql<number>`count(*)`,
      watching: sql<number>`sum(case when ${entries.status} = 'watching' then 1 else 0 end)`,
      completed: sql<number>`sum(case when ${entries.status} = 'completed' then 1 else 0 end)`,
      episodes: sql<number>`sum(${entries.progress})`,
      ratingCount: sql<number>`count(${entries.rating})`,
      avgRating: sql<number | null>`avg(${entries.rating})`,
    })
    .from(entries)
    .where(eq(entries.userId, userId));
  // count(*) 不带 GROUP BY 必回一行，只有 sum 对空集是 NULL。
  // avgRating 只有一行也可能为 NULL（没人评分）。
  const row = rows[0];
  const avg = row.avgRating == null ? 0 : Math.round(Number(row.avgRating) * 10) / 10;
  return {
    total: Number(row.total),
    watching: Number(row.watching ?? 0),
    completed: Number(row.completed ?? 0),
    episodes: Number(row.episodes ?? 0),
    ratingCount: Number(row.ratingCount ?? 0),
    avgRating: avg,
  };
}


/** 放送表取不到退化成空数组：首页与发现页都不该因它整页失败。 */
async function safeCalendar(env: Env, db: Db): Promise<CalendarDay[]> {
  try {
    return await getCalendar(env, db);
  } catch (error) {
    // 静默降级最难查：没日志就分不清上游挂了还是代码写错。
    console.error('放送表降级为空', error);
    return [];
  }
}

export async function loadHome(env: Env, db: Db, user: SessionUser | null): Promise<HomeData> {
  const now = nowSec();

  if (!user) {
    // 匿名首页没有「我的在看」，但侧栏与放送仍要渲染，照取放送表。
    const calendar = await safeCalendar(env, db);
    return {
      now,
      stats: null,
      spotlight: null,
      recentThoughts: [],
      airingToday: airingItems(calendar, now),
      watching: [],
      planned: [],
    };
  }

  const [calendar, stats, recent, watchingList, plannedList] = await Promise.all([
    safeCalendar(env, db),
    getStats(db, user.id),
    recentThoughts(db, user.id, HOME_THOUGHT_LIMIT),
    listEntries(db, user.id, { status: 'watching', sort: 'updated', limit: HOME_ROW_LIMIT }),
    listEntries(db, user.id, { status: 'planned', sort: 'created', limit: HOME_ROW_LIMIT }),
  ]);
  const airingToday = airingItems(calendar, now);

  // Hero 海报与「上次看到」同源：取在看列表首项（按 updated 排序），与放送日历无关。
  const spotlight = watchingList[0] ?? null;

  return {
    now,
    stats,
    spotlight,
    recentThoughts: recent,
    airingToday,
    watching: watchingList,
    planned: plannedList,
  };
}

export async function loadLibrary(db: Db, user: SessionUser, filters: LibraryFilters): Promise<LibraryData> {
  const fetchPage = (page: number) =>
    listEntries(db, user.id, {
      status: filters.status,
      q: filters.q,
      sort: filters.sort,
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    });
  const [entries, counts] = await Promise.all([
    fetchPage(filters.page),
    // 计数不能跟着 status 走：countEntries 与 listEntries 共用 conditions()，传 status 后其余分组恒 0，而标签栏要每种状态各有多少。固定按 all 统计，只传 q。
    countEntries(db, user.id, { status: 'all', q: filters.q }),
  ]);
  const total = counts[filters.status];
  const pages = pageCount(total);
  // ?page=99 这类越界页的 offset 早已越过末尾，查出来是空数组。书架有分页器，夹回最后一页再取一次；发现页不夹。
  const page = Math.min(filters.page, pages);
  const rows = page === filters.page ? entries : await fetchPage(page);
  return {
    entries: rows,
    counts,
    total,
    page,
    pages,
  };
}

export async function loadDiscover(
  env: Env,
  db: Db,
  user: SessionUser | null,
  params: URLSearchParams,
): Promise<DiscoverData> {
  // 与前端共用同一份解析。必须用 readDiscoverFilters：readLibraryFilters 不 trim，?q=%20%20 会被当成有搜索词白打上游。
  const { q, page } = readDiscoverFilters(params, weekdayId(nowSec()));

  // 放送表只有没搜索词时用得上：放在 if (q) 之前会让纯搜索陪等 87KB 上游响应（未命中还计熔断），首屏被拖住。
  if (q) {
    let results: Subject[] = [];
    let total = 0;
    try {
      const found = await searchSubjects(env, db, q, 2, PAGE_SIZE, (page - 1) * PAGE_SIZE);
      results = found.items;
      total = found.total;
    } catch (error) {
      // 404 是「没有结果」而非故障，照常渲染空列表。
      if (!(error instanceof BangumiError && error.status === 404)) throw error;
    }
    return {
      now: nowSec(),
      q,
      results,
      total,
      page,
      pages: pageCount(total),
      calendar: [],
      tracked: user ? await listTrackedSubjectIds(db, user.id) : [],
    };
  }

  const [calendar, tracked] = await Promise.all([
    safeCalendar(env, db),
    user ? listTrackedSubjectIds(db, user.id) : Promise.resolve([]),
  ]);
  return {
    now: nowSec(),
    q,
    results: null,
    total: 0,
    page,
    pages: 1,
    calendar,
    tracked,
  };
}

export async function loadSubject(
  env: Env,
  db: Db,
  user: SessionUser | null,
  id: number,
): Promise<SubjectData | null> {
  // subject 与 episodes 是两次独立上游请求：用路由 id 并发发起 episodes（limit 24），少一次串行往返。匿名不发，结果反正要丢。
  const episodesAhead = user
    ? getEpisodes(env, db, id, 0).catch((error) => {
        // 预取只是加速，任何失败都不该让详情页 500：吞掉返回 null，交给 resolveEpisodes 补取。留一行印证，否则预取永远在失败也看不出来。
        console.warn(`[subject] 分集预取失败，改由后续补取：${id}`, error);
        return null;
      })
    : Promise.resolve(null);

  let subject;
  try {
    subject = await getSubject(env, db, id);
  } catch (error) {
    if (error instanceof BangumiError && error.status === 404) return null;
    // 404 是「这条不存在」，属正常回答不记日志；其余一律留痕，否则 D1 故障只剩一句通用文案。
    console.error('[read-models] 取条目失败', id, error);
    const message = error instanceof BangumiError ? error.message : '番剧数据暂时取不到，请稍后再试';
    return { subject: null, entry: null, episodes: [], thoughts: [], error: message };
  }
  if (!user) return { subject, entry: null, episodes: [], thoughts: [] };
  // subject.id !== id 的分支不会 await episodesAhead，它自带 .catch，不会变成未处理拒绝。

  const entry = await getEntryBySubject(db, user.id, subject.id, DEFAULT_SOURCE);
  // 上游把 id 规范化成别的作品时，预取的分集不属于当前 subject，宁可多取一次。
  const ahead = subject.id === id ? await episodesAhead : null;
  const [episodes, thoughtList] = await Promise.all([
    resolveEpisodes(env, db, subject, ahead),
    entry ? listThoughts(db, user.id, entry.id) : Promise.resolve([]),
  ]);
  return { subject, entry, episodes, thoughts: thoughtList };
}

/** 预取够用就用，不够按 subject.eps 补取：预取（total=0）只取 24 集上限，长番必补；预取失败得空数组时同理（占位集只是显示兜底，不是数据）。eps 未知（0）时直接用预取的。 */
async function resolveEpisodes(
  env: Env,
  db: Db,
  subject: NonNullable<SubjectData['subject']>,
  ahead: Episode[] | null,
): Promise<Episode[]> {
  if (ahead && ahead.length >= subject.eps) return ahead;
  return getEpisodes(env, db, subject.id, subject.eps);
}

export async function loadSettings(db: Db, user: SessionUser): Promise<SettingsData> {
  const [stats, admin] = await Promise.all([getStats(db, user.id), loadAdminPanel(db, user)]);
  return { user, stats, admin };
}

/** 管理面板：只有管理员有内容，普通用户拿 null，前端据此连分区都不渲染。 */
async function loadAdminPanel(db: Db, user: SessionUser): Promise<AdminPanelData | null> {
  if (!(await isAdmin(db, user.id))) return null;
  const [site, invites] = await Promise.all([readSiteSettings(db), listInviteCodesWithUses(db)]);
  return { site, invites };
}
