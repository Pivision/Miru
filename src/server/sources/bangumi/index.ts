/** Bangumi 数据源门面：取数层只认这里的四个函数。http.ts 管访问（缓存/超时/重试），normalize.ts 管字段映射，本文件管取什么、缓存多久、失败怎么降级。 */
import type { CalendarDay, Episode, Subject } from '@shared/types';
import { cnDate, nowSec } from '@shared/time';
import { PAGE_SIZE } from '@shared/limits';
import type { Db } from '../../db/client';
import type { Env } from '../../env';
import {
  BangumiError,
  EPISODES_TIMEOUT,
  NEGATIVE_TTL,
  TTL,
  cacheKey,
  cached,
  sweepExpiredCache,
  call,
  readCache,
  writeCache,
} from './http';
import { mirrorImages, normalizeCalendar, normalizeEpisodes, normalizeSubject } from './normalize';

export { BangumiError } from './http';

/** 分集预取的保底条数：与 PAGE_SIZE 数值相同但含义不同。 */
const EPISODE_FETCH_FLOOR = 24;

export async function getSubject(env: Env, db: Db, id: number): Promise<Subject> {
  // 入口正数校验在路由层（positiveInt），这里不再重复。
  // key 带版本号：缓存的是已归一化的 Subject，改归一化逻辑就升版让旧 payload 失效。
  const subject = await cached(db, cacheKey('subject', 'v2', id), TTL.subject, async () => {
    const res = await call(env, `/v0/subjects/${id}`);
    return normalizeSubject((await res.json()) as Record<string, unknown>);
  });
  return mirrorImages(env, subject);
}

export async function searchSubjects(
  env: Env,
  db: Db,
  keyword: string,
  type = 2,
  limit = PAGE_SIZE,
  offset = 0,
): Promise<{ items: Subject[]; total: number }> {
  const q = keyword.trim();
  if (!q) return { items: [], total: 0 };
  const key = cacheKey('search', type, limit, offset, q.toLowerCase());
  const result = await cached(db, key, TTL.search, async () => {
    const res = await call(env, '/v0/search/subjects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ keyword: q, sort: 'match', filter: { type: [type], nsfw: false } }),
    });
    const body = (await res.json()) as { data?: Record<string, unknown>[]; total?: number };
    const items = (body.data ?? []).map((item) => normalizeSubject(item));
    // 顺手回收过期搜索结果：这族键带关键词+页码，每搜一次多一行，不像 subject 会被覆写。放在 load 里：命中缓存是纯读，不该为清理付一次 DELETE。
    await sweepExpiredCache(db, cacheKey('search'), TTL.search);
    // 接口不会自带 total（官方返回里有，但形状不保证）：退回 items.length 等于宣称「只有这一页」，分页器会藏掉下一页。取不到时按「至少还有这一页」算，宁可多给一次空页。
    return { items, total: Number(body.total ?? items.length + offset) };
  }).then((result) => ({ ...result, items: result.items.map((item) => mirrorImages(env, item)) }));
  return result;
}

export async function getCalendar(env: Env, db: Db): Promise<CalendarDay[]> {
  // 缓存键带日期：放送表按天变，用东八区日期，跨零点自然换键。
  const days = await cached(db, cacheKey('calendar', cnDate(nowSec())), TTL.calendar, async () => {
    const res = await call(env, '/calendar');
    const fresh = normalizeCalendar(await res.json());
    // 刚写入新值顺手扫过期；放在 load 里有意的：命中缓存时是纯读，不该为清理去删表。
    await sweepExpiredCache(db, cacheKey('calendar'), TTL.calendar);
    return fresh;
  });
  return days.map((day) => ({ ...day, items: day.items.map((item) => mirrorImages(env, item)) }));
}

/** 占位集上限：一次渲染几千个按钮会卡住主线程。 */
const PLACEHOLDER_CAP = 500;

function placeholderOf(total: number): Episode[] {
  return Array.from({ length: Math.min(total, PLACEHOLDER_CAP) }, (_, index) => ({
    id: index + 1,
    sort: index + 1,
    ep: index + 1,
    name: '',
    nameCn: '',
    airDate: '',
    // 带标记：真实分集也可能没标题，只看 name 分不出降级与「真没标题」。
    placeholder: true,
  }));
}

/** 分集列表。真实端点是 /v0/episodes?subject_id=（/v0/subjects/{id}/episodes 一律 404）。取不到退回占位集并缓存，避免反复等；type=0 只取本篇，跳过 SP/OP/ED。 */
export async function getEpisodes(env: Env, db: Db, id: number, total = 0): Promise<Episode[]> {
  const limit = Math.max(total, EPISODE_FETCH_FLOOR);
  const key = cacheKey('episodes', id, limit);
  const missKey = cacheKey('episodes', id, limit, 'miss');
  const hit = await readCache<Episode[]>(db, key, TTL.episodes);
  if (hit !== null) return hit;
  // 刚失败过的端点：短窗口内直接复用上次结果，空数组是「端点已死」的标记，所以用 !== null 判有没有缓存行。
  // miss key 里按定义只有占位集：统一补标记，兼容旧缓存行。
  const miss = await readCache<Episode[]>(db, missKey, NEGATIVE_TTL.episodes);
  if (miss !== null) return miss.length > 0 ? miss.map((ep) => ({ ...ep, placeholder: true })) : placeholderOf(total);

  let episodes: Episode[] = [];
  try {
    const res = await call(
      env,
      `/v0/episodes?subject_id=${id}&type=0&limit=${limit}&offset=0`,
      undefined,
      EPISODES_TIMEOUT,
    );
    const body = (await res.json()) as { data?: unknown };
    episodes = normalizeEpisodes(body.data);
  } catch (error) {
    // 404 多半是上游已下架，按「没有分集」落占位集，不该打挂详情页；408 是本端点的短超时。两者都落短 TTL 的 miss key。502/504 仍抛出：那是上游整体不可用，不能被缓存成「本作没有分集」。
    const soft = error instanceof BangumiError && (error.status === 404 || error.status === 408);
    if (!soft) throw error;
    // 降级没错，但不打日志就分不清上游没响应还是分集接口写坏了。
    console.warn(`分集降级：subject ${id}（${error.status}）`, error);
  }

  if (episodes.length > 0) {
    await writeCache(db, key, episodes);
    return episodes;
  }

  // 上游返回空：写进 miss key 用独立的短 TTL，避免每次进详情都把死端点等到超时。集数未知时 placeholderOf 给空数组，正好当「端点已死」的信号。
  const placeholder = placeholderOf(total);
  await writeCache(db, missKey, placeholder);
  return placeholder;
}
