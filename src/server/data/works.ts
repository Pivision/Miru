/** 作品（works）的读写：上游条目的本地快照，与「谁在追它」无关。 */
import { pickCover, totalEpisodes } from '@shared/display';
import { and, eq } from 'drizzle-orm';
import type { SourceId, Subject, Work } from '@shared/types';
import { nowSec } from '@shared/time';
import type { Db } from '../db/client';
import { works, type WorkRow } from '../db/schema';
import { newId } from '../db/client';

/** 目前只接了 Bangumi；接第二个源时在这里加取值并同步 SourceId。 */
export const DEFAULT_SOURCE: SourceId = 'bangumi';

/** 把库里的 source 文本收窄成 SourceId。表里是自由 TEXT，as SourceId 只是断言，库被直接改过就会把非法值带进业务代码，所以显式校验、遇未知源就地抛出。 */
function toSourceId(value: string): SourceId {
  if (value === DEFAULT_SOURCE) return value;
  throw new Error(`works.source 出现未知数据源：${value}`);
}

function rowToWork(row: WorkRow): Work {
  return {
    id: row.id,
    source: toSourceId(row.source),
    sourceId: row.sourceId,
    title: row.title,
    titleCn: row.titleCn,
    poster: row.poster,
    airDate: row.airDate,
    totalEps: row.totalEps,
    platform: row.platform,
    updatedAt: row.updatedAt,
  };
}

/** 建或刷新作品快照。每次打开详情页或写记录都刷新一次，上游会改名、补封面、修集数。用 INSERT … ON CONFLICT DO UPDATE 而非先查再插：后者两人同时首次添加会双双插入、撞唯一索引 500。冲突分支不整列覆写：上游偶尔返回空海报/空日期/0 集，整列覆盖会把有效值擦成空。 */
export async function upsertWork(db: Db, subject: Subject): Promise<Work> {
  const key = { source: DEFAULT_SOURCE, sourceId: String(subject.id) };
  const snapshot = {
    // title 存原名、titleCn 存中文名。不能把中文名塞进 title：那样两列是同一份数据，将来按原名搜索或排序就没原文了。
    title: subject.name || subject.nameCn || String(subject.id),
    titleCn: subject.nameCn || null,
    poster: pickCover(subject.images),
    airDate: subject.date || null,
    totalEps: totalEpisodes(subject.eps),
    platform: subject.platform || null,
    updatedAt: nowSec(),
  };
  // 空值不参与覆盖：只写这次真取到的列。
  const patch = Object.fromEntries(
    Object.entries(snapshot).filter(([, value]) => value !== null && value !== '' && value !== 0),
  );

  await db
    .insert(works)
    .values({ id: newId('w'), source: key.source, sourceId: key.sourceId, ...snapshot })
    .onConflictDoUpdate({ target: [works.source, works.sourceId], set: patch });

  // 冲突时用的是库里那行的 id，回读一次拿最终形态。
  const rows = await db
    .select()
    .from(works)
    .where(and(eq(works.source, key.source), eq(works.sourceId, key.sourceId)))
    .limit(1);
  if (!rows[0]) throw new Error(`works 写入后读不到：${key.source}/${key.sourceId}`);
  return rowToWork(rows[0]);
}
