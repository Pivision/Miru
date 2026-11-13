/** 上游 JSON → 站内类型：只做字段映射与清洗，不发请求、不碰缓存。 */
import type { CalendarDay, Episode, Subject } from '@shared/types';
import type { Env } from '../../env';
import { BangumiError, readBase } from './http';

/** 上游 id 统一走这里。直接 Number(raw.id) 会得到 NaN 并被塞进链接与缓存 key（/subject/NaN），非法时抛 BangumiError（按上游数据损坏走 502），不能悄悄塞 0。 */
function toInt(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new BangumiError('Bangumi 返回的条目数据不完整', 502);
  return n;
}

/** meta_tags 必须去重：上游同一份数据里有重复项（《Re:从零开始 第三季》给 16 条，去重后 8 条），否则渲染出一排重复胶囊。 */
function normalizeMetaTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tag of tags) {
    const name = typeof tag === 'string' ? tag.trim() : '';
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

function normalizeInfobox(box: unknown): Subject['infobox'] {
  if (!Array.isArray(box)) return [];
  return box
    .map((item) => {
      const rec = item as { key?: unknown; value?: unknown };
      const raw = rec.value;
      const value = Array.isArray(raw)
        ? raw
            .map((v) => (typeof v === 'string' ? v : String((v as { v?: string })?.v ?? '')))
            .filter(Boolean)
            .join('、')
        : String(raw ?? '');
      return { key: String(rec.key ?? ''), value };
    })
    .filter((item) => item.key && item.value && item.value.length < 400)
    .slice(0, 12);
}

/** rating.count（{"1":130,…,"10":7541}）摊平成定长 10 的数组，索引 0 是 1 分。缺失、非法或全 0 返回空数组，退化显示交给 ScoreCard。 */
function normalizeScoreBuckets(count: unknown): number[] {
  // 只收普通对象：数组会被数字下标误读成各档人数
  if (!count || typeof count !== 'object' || Array.isArray(count)) return [];
  const rec = count as Record<string, unknown>;
  const buckets = Array.from({ length: 10 }, (_, i) => {
    const n = Number(rec[String(i + 1)] ?? 0);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  });
  return buckets.some((n) => n > 0) ? buckets : [];
}

export function normalizeSubject(raw: Record<string, unknown>): Subject {
  const images = (raw.images ?? {}) as Record<string, string>;
  const rating = (raw.rating ?? {}) as {
    score?: number;
    total?: number;
    count?: Record<string, number>;
  };
  return {
    id: toInt(raw.id),
    name: String(raw.name ?? ''),
    nameCn: String(raw.name_cn ?? ''),
    summary: String(raw.summary ?? ''),
    images: {
      large: images.large ?? '',
      common: images.common ?? '',
      medium: images.medium ?? '',
      small: images.small ?? '',
      grid: images.grid ?? '',
    },
    // 两个字段都是集数：eps 为 0 或缺失时退到 total_episodes（?? 只认 null，eps: 0 会卡住不回退）
    eps: Number(raw.eps) || Number(raw.total_episodes) || 0,
    date: raw.date ? String(raw.date) : null,
    platform: String(raw.platform ?? ''),
    score: Number(rating.score ?? 0) || 0,
    votes: Number(rating.total ?? 0) || 0,
    scoreBuckets: normalizeScoreBuckets(rating.count),
    metaTags: normalizeMetaTags(raw.meta_tags),
    infobox: normalizeInfobox(raw.infobox),
  };
}

/** 图片地址换到镜像域。图片由浏览器直取、服务端没有回落机会，镜像挂了就是裂图，所以镜像域没配时原样返回，绝不猜。 */
function rewriteImageHost(env: Env, url: string): string {
  const mirror = readBase(env.BGM_IMG_BASE, '');
  if (!mirror || !url) return url;
  try {
    const parsed = new URL(url);
    const target = new URL(mirror);
    // 镜像配置可能带路径前缀（如 /bgm），只换 host 会丢前缀，图全 404。
    const prefix = target.pathname.replace(/\/+$/, '');
    parsed.protocol = target.protocol;
    parsed.host = target.host;
    parsed.pathname = prefix ? `${prefix}${parsed.pathname}` : parsed.pathname;
    return parsed.toString();
  } catch {
    // 相对地址或脏数据：原样返回
    return url;
  }
}

/** 图片域改写放在读完缓存之后，不进 normalizeSubject：缓存存官方原始地址，换镜像才能立刻生效，不必等 3 天 TTL，也不用升缓存 key 版本。 */
export function mirrorImages(env: Env, subject: Subject): Subject {
  const images = subject.images;
  return {
    ...subject,
    images: {
      large: rewriteImageHost(env, images.large ?? ''),
      common: rewriteImageHost(env, images.common ?? ''),
      medium: rewriteImageHost(env, images.medium ?? ''),
      small: rewriteImageHost(env, images.small ?? ''),
      grid: rewriteImageHost(env, images.grid ?? ''),
    },
  };
}

/** /calendar 的返回：每项是「周几 + 当天放送的条目」。 */
export function normalizeCalendar(raw: unknown): CalendarDay[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((day) => {
    const rec = day as { weekday?: { id?: number }; items?: Record<string, unknown>[] };
    return {
      weekday: Number(rec.weekday?.id ?? 0) || 0,
      items: (rec.items ?? []).map((item) => normalizeSubject(item)),
    };
  });
}

/** /v0/episodes 的返回：只取本篇六个字段。id 缺失按 0（一部脏分集不该让整部作品打不开），ep 缺失降级成 null，其余脏值落成空串或 0。 */
export function normalizeEpisodes(raw: unknown): Episode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const ep = item as Record<string, unknown>;
    return {
      id: toInt(ep.id ?? 0),
      sort: Number(ep.sort ?? 0) || 0,
      ep: ep.ep == null ? null : Number(ep.ep),
      name: String(ep.name ?? ''),
      nameCn: String(ep.name_cn ?? ''),
      airDate: String(ep.airdate ?? ''),
    };
  });
}
