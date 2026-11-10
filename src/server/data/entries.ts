/** 记录（entries）的读写：列表、计数、单条、增改删。作品信息靠 join works 补。 */
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { Entry, EntryStatus, LibrarySort, SourceId, Subject } from '@shared/types';
import { STATUS_ORDER } from '@shared/types';
import { nowSec } from '@shared/time';
import { totalEpisodes } from '@shared/display';
import type { Db } from '../db/client';
import { entries, works } from '../db/schema';
import { newId } from '../db/client';
import { upsertWork } from './works';
import { autoCompletedStatus, autoDates, clampProgress, PROGRESS_CAP } from './progress';

/** 单次查询行数上限：列表默认上限与导出分页共用。 */
export const PAGE_FETCH_CAP = 500;

type EntryFilters = {
  status?: EntryStatus | 'all';
  q?: string;
  sort?: LibrarySort;
  limit?: number;
  offset?: number;
};

/** 列表/单条共用的选择集。必须逐列写：整张表当值会让同名列（id/title/created_at…）互相覆盖。 */
const entryWithWork = {
  id: entries.id,
  sourceId: works.sourceId,
  title: works.title,
  titleCn: works.titleCn,
  poster: works.poster,
  totalEps: works.totalEps,
  platform: works.platform,
  status: entries.status,
  rating: entries.rating,
  progress: entries.progress,
  startedAt: entries.startedAt,
  finishedAt: entries.finishedAt,
  updatedAt: entries.updatedAt,
};

// 下面 5 个查询与 thoughts.ts 的列表共用同一条 innerJoin，故意不抽工厂：drizzle 0.45 下退化成 {[x: string]: unknown}，.as('sw') 抛 "table entries is not part of the query"。改 leftJoin 时改这 6 处。

/** 扁平行 → Entry：只把 status 收窄。签名依赖选择集的键，增删列立刻报错。 */
function rowToEntry(row: Omit<Entry, 'status'> & { status: string }): Entry {
  return { ...row, status: row.status as EntryStatus };
}

function conditions(userId: string, filters: EntryFilters) {
  const list = [eq(entries.userId, userId)];
  if (filters.status && filters.status !== 'all') list.push(eq(entries.status, filters.status));
  const q = filters.q?.trim();
  if (q) {
    const needle = q.toLowerCase();
      list.push(
      sql`(instr(lower(${works.title}), ${needle}) > 0
        OR instr(lower(coalesce(${works.titleCn}, '')), ${needle}) > 0)`,
    );
  }
  return list;
}

// 每档排序都要全序：偏移分页遇并列行会跳行或重复（秒级时间戳、同天播出、同名），统一用 entries.id 兜底。
function orderFor(sort: EntryFilters['sort']) {
  switch (sort) {
    case 'rating':
      return [sql`${entries.rating} IS NULL`, desc(entries.rating), desc(entries.id)];
    case 'title':
      return [asc(sql`coalesce(${works.titleCn}, ${works.title})`), desc(entries.id)];
    case 'air_date':
      return [sql`${works.airDate} IS NULL`, desc(works.airDate), desc(entries.id)];
    case 'created':
      return [desc(entries.createdAt), desc(entries.id)];
    default:
      return [desc(entries.updatedAt), desc(entries.id)];
  }
}

export async function listEntries(db: Db, userId: string, filters: EntryFilters): Promise<Entry[]> {
  const rows = await db
    .select(entryWithWork)
    .from(entries)
    .innerJoin(works, eq(works.id, entries.workId))
    .where(and(...conditions(userId, filters)))
    .orderBy(...orderFor(filters.sort))
    .limit(Math.min(filters.limit ?? PAGE_FETCH_CAP, PAGE_FETCH_CAP))
    .offset(filters.offset ?? 0);
  return rows.map(rowToEntry);
}

export async function countEntries(
  db: Db,
  userId: string,
  filters: EntryFilters,
): Promise<Record<EntryStatus | 'all', number>> {
  const rows = await db
    .select({ status: entries.status, n: sql<number>`count(*)` })
    .from(entries)
    .innerJoin(works, eq(works.id, entries.workId))
    .where(and(...conditions(userId, filters)))
    .groupBy(entries.status);
  // 初值由 STATUS_ORDER 推出：加状态只改 STATUS_META 一处，这里不会漏掉一格。
  const counts = Object.fromEntries([['all', 0], ...STATUS_ORDER.map((status) => [status, 0])]) as Record<
    EntryStatus | 'all',
    number
  >;
  for (const row of rows) {
    counts[row.status as EntryStatus] = Number(row.n);
    counts.all += Number(row.n);
  }
  return counts;
}

/** 按上游条目查自己的记录：详情页要「我有没有追这部」。 */
export async function getEntryBySubject(
  db: Db,
  userId: string,
  subjectId: number,
  source: SourceId,
): Promise<Entry | null> {
  const rows = await db
    .select(entryWithWork)
    .from(entries)
    .innerJoin(works, eq(works.id, entries.workId))
    .where(
      and(eq(entries.userId, userId), eq(works.source, source), eq(works.sourceId, String(subjectId))),
    )
    .limit(1);
  return rows[0] ? rowToEntry(rows[0]) : null;
}

export async function getEntryById(db: Db, userId: string, id: string): Promise<Entry | null> {
  const rows = await db
    .select(entryWithWork)
    .from(entries)
    .innerJoin(works, eq(works.id, entries.workId))
    .where(and(eq(entries.id, id), eq(entries.userId, userId)))
    .limit(1);
  return rows[0] ? rowToEntry(rows[0]) : null;
}

/** 发现页要标出「已加入片单」的上游条目 id。 */
export async function listTrackedSubjectIds(db: Db, userId: string): Promise<number[]> {
  const rows = await db
    .select({ sourceId: works.sourceId })
    .from(entries)
    .innerJoin(works, eq(works.id, entries.workId))
    .where(eq(entries.userId, userId));
  return rows.map((row) => Number(row.sourceId));
}

/** 评分只收 1–10 的整数或 null：调用方须已收好范围，这里越界是代码错，抛错。 */
function normalizeRating(rating: number | null): number | null {
  if (rating === null) return null;
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) {
    throw new Error(`评分必须是 1–10 的整数或 null，收到 ${rating}`);
  }
  return rating;
}

type UpsertInput = {
  subject: Subject;
  status?: EntryStatus;
  rating?: number | null;
  progress?: number;
  /** 手动开始时间（秒字符串）：null 清空，undefined 走自动规则 */
  startedAt?: string | null;
  /** 手动结束时间（秒字符串）：null 清空，undefined 走自动规则 */
  finishedAt?: string | null;
};

/** 冲突分支的 SET：多端并发会撞 entries_user_work_idx，本地 existing 已过期，整行覆盖会改回去，所以只写显式传的字段、进度取较大值。日期只补空不覆盖；退出 completed 必须清结束日期，否则状态与日期对不上。 */
function conflictSet(input: UpsertInput, status: EntryStatus, now: number) {
  const startedAt =
    input.startedAt !== undefined
      ? { startedAt: input.startedAt }
      : status === 'planned'
        ? {}
        : { startedAt: sql`coalesce(${entries.startedAt}, ${String(now)})` };
  const finishedAt =
    input.finishedAt !== undefined
      ? { finishedAt: input.finishedAt }
      : status === 'completed'
        ? { finishedAt: sql`coalesce(${entries.finishedAt}, ${String(now)})` }
        : // 没传 status（如只改评分）时不能顺手清别人的结束日期；按 status 参数（已兜成 planned）判断会把并发的 completed 行清成「completed 但 finished_at 为 NULL」。
          input.status === undefined
          ? {}
          : { finishedAt: sql`case when ${entries.status} = 'completed' then null else ${entries.finishedAt} end` };
  return {
    updatedAt: now,
    ...(input.status === undefined ? {} : { status }),
    ...(input.rating === undefined ? {} : { rating: normalizeRating(input.rating) }),
    ...(input.progress === undefined ? {} : { progress: sql`max(${entries.progress}, excluded.progress)` }),
    ...startedAt,
    ...finishedAt,
  };
}

/** 建或更新一条记录：先把作品快照刷进 works，再写 entries。写成功却读不到时返回 null（行刚被别处删掉）。 */
export async function upsertEntry(db: Db, userId: string, input: UpsertInput): Promise<Entry | null> {
  const { subject } = input;
  const now = nowSec();
  const work = await upsertWork(db, subject);
  const existing = await getEntryBySubject(db, userId, subject.id, work.source);

  if (existing) {
    // 手动传了 startedAt/finishedAt（含 null 清空）一律以手动值为准，自动规则只在没传时兜底，否则用户清空过的日期会被下次状态变更填回来。
    const updated = await updateEntryFields(
      db,
      userId,
      existing.id,
      {
        status: input.status,
        rating: input.rating === undefined ? undefined : normalizeRating(input.rating),
        progress: input.progress,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
      },
      existing,
    );
    // 再按 subject 读一次；仍读不到只可能是行刚被别处删掉，返回 null 由路由走「已在别处被删除」的 404 出口。
    if (updated) return updated;
    return getEntryBySubject(db, userId, subject.id, work.source);
  }

  // 记录还不存在：只按显式传的值建行，缺的用默认值。
  const status = input.status ?? 'planned';
  const patch = {
    status,
    rating: normalizeRating(input.rating ?? null),
    progress: clampProgress(input.progress ?? 0, work.totalEps || null),
    updatedAt: now,
  };

  const id = newId('e');
  const auto = autoDates(true, status, null, null, now);
  const startedAt = input.startedAt === undefined ? auto.startedAt : input.startedAt;
  const finishedAt = input.finishedAt === undefined ? auto.finishedAt : input.finishedAt;
  const [row] = await db
    .insert(entries)
    .values({ id, userId, workId: work.id, ...patch, startedAt, finishedAt, createdAt: now })
    .onConflictDoUpdate({ target: [entries.userId, entries.workId], set: conflictSet(input, status, now) })
    .returning({ id: entries.id });

  // 冲突分支可能落在别人刚建的行上，按返回主键回读；两条路都读不到就是行刚被删，返回 null 交给路由。
  const saved = row ? await getEntryById(db, userId, row.id) : null;
  if (saved) return saved;
  return getEntryBySubject(db, userId, subject.id, work.source);
}

type EntryPatch = Partial<{
  status: EntryStatus;
  rating: number | null;
  progress: number;
  /** null 清空，undefined 走自动规则 */
  startedAt: string | null;
  finishedAt: string | null;
}>;

export async function updateEntryFields(
  db: Db,
  userId: string,
  entryId: string,
  patch: EntryPatch,
  current: Entry | null,
): Promise<Entry | null> {
  const cur = current ?? (await getEntryById(db, userId, entryId));
  if (!cur) return null;
  const now = nowSec();
  // 「看满即完成」只在这里判：改进度且未显式给状态时补 completed，路由层不自己算。钳制必须在读库之后，上界 totalEps 来自 cur。
  const progress = patch.progress === undefined ? cur.progress : clampProgress(patch.progress, cur.totalEps);
  const autoStatus =
    patch.progress !== undefined && patch.status === undefined
      ? autoCompletedStatus(progress, cur.totalEps, cur.status)
      : undefined;
  // 没传就不写这一列：调用方传的常是刚读到的 cur，整列写回会盖掉并发结果。
  const nextStatus = autoStatus ?? patch.status;
  // 与 upsertEntry 共用自动日期规则：只改进度时不该把用户清空过的日期填回。
  const statusChanged = nextStatus !== undefined && nextStatus !== cur.status;
  const auto = autoDates(statusChanged, nextStatus ?? cur.status, cur.startedAt, cur.finishedAt, now);
  await db
    .update(entries)
    .set({
      ...(nextStatus === undefined ? {} : { status: nextStatus }),
      // 同上：不传就不写，否则「只改进度」会盖掉并发写入的评分。
      ...(patch.rating === undefined ? {} : { rating: normalizeRating(patch.rating) }),
      // 没传进度就不写：读-改-写会盖回旧值，与 advanceEntryProgress 的 SQL 增量撞上就是丢更新。
      ...(patch.progress === undefined ? {} : { progress }),
      // 手动值（含 null）优先，自动规则只补没传的。
      startedAt: patch.startedAt === undefined ? auto.startedAt : patch.startedAt,
      finishedAt: patch.finishedAt === undefined ? auto.finishedAt : patch.finishedAt,
      updatedAt: now,
    })
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
  return getEntryById(db, userId, entryId);
}

/** 增减进度在 SQL 里算（progress + delta，min 钳制，未知总集数用 PROGRESS_CAP 哨兵）：应用层算绝对值时并发 +1 都基于旧快照，最终只前进 1 集。自动完成要钳制后的结果，写完回读一次；状态没变就不再 UPDATE。 */
export async function advanceEntryProgress(db: Db, userId: string, entryId: string, delta: number): Promise<Entry | null> {
  const cur = await getEntryById(db, userId, entryId);
  if (!cur) return null;
  const bound = totalEpisodes(cur.totalEps, PROGRESS_CAP);
  await db
    .update(entries)
    .set({
      progress: sql`max(0, min(${entries.progress} + ${delta}, ${bound}))`,
      updatedAt: nowSec(),
    })
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
  const next = await getEntryById(db, userId, entryId);
  // 刚写完就读不到只可能被并发删了，不能当 404，否则「写成功但读不出」会报成「没有这条记录」。
  if (!next) throw new Error('进度已更新但读不到，请刷新重试');
  const finished = autoCompletedStatus(next.progress, cur.totalEps, next.status) ?? next.status;
  if (finished === next.status) return next;
  const wrote = await db
    .update(entries)
    .set({ status: finished, updatedAt: nowSec(), ...autoDates(true, finished, next.startedAt, next.finishedAt, nowSec()) })
    // 带上进度做乐观守卫：回读与写入之间若有人用绝对值改了进度，这个状态已不成立，宁可这次不写。
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId), eq(entries.progress, next.progress)));
  // 守卫没命中说明进度已过期，不能返回旧状态（会出现「已看满但在看」），重读再判，最多一次。
  if (wrote.meta.changes > 0) return getEntryById(db, userId, entryId);
  const retry = await getEntryById(db, userId, entryId);
  if (!retry || retry.status !== next.status) return retry;
  // 用重读到的 totalEps：两次读之间上游可能刚补了集数。
  const lateStatus = autoCompletedStatus(retry.progress, retry.totalEps, retry.status);
  if (!lateStatus) return retry;
  await db
    .update(entries)
    .set({ status: lateStatus, updatedAt: nowSec(), ...autoDates(true, lateStatus, retry.startedAt, retry.finishedAt, nowSec()) })
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId), eq(entries.progress, retry.progress)));
  return getEntryById(db, userId, entryId);
}

/** 返回受影响行数：0 表示不存在或不属于当前用户，调用方据此回 404。 */
export async function deleteEntry(db: Db, userId: string, entryId: string): Promise<number> {
  const result = await db.delete(entries).where(and(eq(entries.id, entryId), eq(entries.userId, userId)));
  return result.meta.changes;
}
