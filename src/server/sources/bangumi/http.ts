/** Bangumi 上游访问层：缓存、超时、重试。只认 URL 进 Response 出，不认业务字段，归一化在 normalize.ts。 */
import { and, eq, like, lt } from 'drizzle-orm';
import { nowSec } from '@shared/time';
import type { Db } from '../../db/client';
import { subjectCache } from '../../db/schema';
import type { Env } from '../../env';

/** 缓存 key 带 bgm: 前缀：接第二个源时不会撞 key，撞了会静默显示错作品。 */
export function cacheKey(...segments: (string | number)[]): string {
  return ['bgm', ...segments].join(':');
}

const DEFAULT_BASE = 'https://api.bgm.tv';
const DEFAULT_UA = 'Miru/1.0 (personal anime diary)';

/** base 规范化：只收 http(s)、去末尾斜杠，配错当没配而非抛错（一个坏配置不该让整站打不开）。fallback 传空串但靠它把返回类型收成 string。 */
export function readBase(value: string | undefined, fallback: string): string {
  const raw = (value ?? '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return fallback;
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
  } catch {
    return fallback;
  }
}

export const TTL = {
  subject: 3 * 24 * 60 * 60,
  search: 60 * 60,
  calendar: 6 * 60 * 60,
  episodes: 2 * 24 * 60 * 60,
};

/** 负结果短 TTL：避免每次进详情都重等缺失端点超时。 */
export const NEGATIVE_TTL = {
  episodes: 10 * 60,
};

/** 分集单独超时：实测 0.6–15s 抖动，等满 8s 只会陪首屏卡；超时即降级成占位集，上游恢复后下次访问再换真数据。 */
export const EPISODES_TIMEOUT = 2_500;

export class BangumiError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function readCache<T>(db: Db, key: string, ttl: number): Promise<T | null> {
  try {
    const rows = await db.select().from(subjectCache).where(eq(subjectCache.key, key)).limit(1);
    const row = rows[0];
    if (!row) return null;
    if (nowSec() - Number(row.fetchedAt) > ttl) return null;
    return JSON.parse(row.payload) as T;
  } catch (error) {
    // 读失败不影响响应，但留日志：坏 payload 会让每次请求都重打上游。
    console.warn(`缓存读取失败：${key}`, error);
    return null;
  }
}

export async function writeCache(db: Db, key: string, value: unknown): Promise<void> {
  const payload = JSON.stringify(value);
  const fetchedAt = nowSec();
  try {
    await db
      .insert(subjectCache)
      .values({ key, payload, fetchedAt })
      .onConflictDoUpdate({ target: subjectCache.key, set: { payload, fetchedAt } });
  } catch (error) {
    /* 写不进不能让页面挂掉，但留日志，免得缓存不生效也看不出来 */
    console.warn(`缓存写入失败：${key}`, error);
  }
}

/** 清掉某类缓存的过期行：calendar 带日期、search 带关键词+页码，不清理会无限增殖；定键的族本就覆写同一行。只在写完新值后做一次，不进读路径。 */
export async function sweepExpiredCache(db: Db, prefix: string, ttl: number): Promise<void> {
  try {
    await db
      .delete(subjectCache)
      .where(and(like(subjectCache.key, `${prefix}%`), lt(subjectCache.fetchedAt, nowSec() - ttl)));
  } catch (error) {
    // 删除失败不影响响应，但留日志，否则「一直没清掉」看不出来。
    console.warn(`缓存清理失败：${prefix}`, error);
  }
}

export async function cached<T>(db: Db, key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = await readCache<T>(db, key, ttl);
  if (hit !== null) return hit;
  const fresh = await load();
  await writeCache(db, key, fresh);
  return fresh;
}

/** 对官方发一次请求，网络层错误与 5xx 各重试一次。status 表达失败种类：408 超时、504 连接失败、502 上游 5xx；404/4xx 是上游的正当回答，原样透出。 */
async function request(
  env: Env,
  path: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  // 上游偶尔丢请求：重试一次，别让抖动变成详情页的 500。
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetch(`${DEFAULT_BASE}${path}`, {
        ...init,
        headers: {
          'user-agent': env.BGM_UA || DEFAULT_UA,
          accept: 'application/json',
          ...(init?.headers as Record<string, string> | undefined),
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      // 超时重试仍会超时，只有网络层错误值得再试。
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      if (attempt === 0 && !timedOut) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      // 超时单列 408：分集端点本来抖，index.ts 据此把它降级成占位集而不是打挂详情页。
      if (timedOut) throw new BangumiError('Bangumi 接口响应超时', 408);
      throw new BangumiError('连接 Bangumi 失败，请稍后重试', 504);
    }
    if (res.status === 404) throw new BangumiError('Bangumi 上找不到这条内容', 404);
    // 其余 4xx 是上游的正当回答：折成 502 会让调用方多等一次重试，又让 e2e 分不清「上游说不行」和「上游不可达」。原样抛出。
    if (res.status >= 400 && res.status < 500) {
      throw new BangumiError(`Bangumi 接口返回 ${res.status}`, res.status);
    }
    if (!res.ok) {
      if (attempt === 0 && res.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw new BangumiError(`Bangumi 接口返回 ${res.status}`, 502);
    }
    return res;
  }
}

/** 取数入口：直连官方 api.bgm.tv，不再有镜像与回落。上游抖动时最坏等满一次超时加一次重试，不额外引入全局状态。 */
export async function call(env: Env, path: string, init?: RequestInit, timeoutMs = 8_000): Promise<Response> {
  return request(env, path, init, timeoutMs);
}
