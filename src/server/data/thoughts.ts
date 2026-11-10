/** 想法（短评）的读写。想法只对整部作品，不绑某一集。 */
import { and, desc, eq } from 'drizzle-orm';
import type { Thought } from '@shared/types';
import { nowSec } from '@shared/time';
import { displayTitle } from '@shared/display';
import type { Db } from '../db/client';
import { entries, thoughts, works, type ThoughtRow } from '../db/schema';
import { getEntryById } from './entries';
import { newId } from '../db/client';

/** 想法行 → 前端 Thought。只取对外暴露的字段，userId 不下发。 */
function rowToThought(row: Pick<ThoughtRow, 'id' | 'entryId' | 'content' | 'createdAt'>): Thought {
  return {
    id: row.id,
    entryId: row.entryId,
    content: row.content,
    createdAt: row.createdAt,
  };
}

/** 首页「最近想法」：连表带上作品名，方便在列表里标出属于哪部番。条数由调用方定。 */
export async function recentThoughts(db: Db, userId: string, limit: number): Promise<Thought[]> {
  const rows = await db
    .select({
      id: thoughts.id,
      entryId: thoughts.entryId,
      content: thoughts.content,
      createdAt: thoughts.createdAt,
      // 作品名走 @shared/display，与列表、卡片同一套「中文名优先」规则。
      title: works.title,
      titleCn: works.titleCn,
    })
    .from(thoughts)
    .innerJoin(entries, eq(entries.id, thoughts.entryId))
    .innerJoin(works, eq(works.id, entries.workId))
    .where(eq(thoughts.userId, userId))
    .orderBy(desc(thoughts.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...rowToThought(row),
    entryTitle: displayTitle(row),
  }));
}

export async function listThoughts(db: Db, userId: string, entryId: string): Promise<Thought[]> {
  const rows = await db
    .select()
    .from(thoughts)
    .where(and(eq(thoughts.entryId, entryId), eq(thoughts.userId, userId)))
    .orderBy(desc(thoughts.createdAt));
  return rows.map(rowToThought);
}

export async function addThought(
  db: Db,
  userId: string,
  entryId: string,
  /** 调用方已 trim 且已校验长度（见 api/thoughts.routes.ts），这里不再重复裁决。 */
  content: string,
): Promise<Thought | null> {
  const entry = await getEntryById(db, userId, entryId);
  if (!entry) return null;
  const row: ThoughtRow = {
    id: newId('t'),
    entryId,
    userId,
    content,
    createdAt: nowSec(),
  };
  await db.insert(thoughts).values(row);
  return rowToThought(row);
}

/** 返回受影响行数：0 表示不存在或不属于当前用户，调用方据此回 404。 */
export async function deleteThought(db: Db, userId: string, id: string): Promise<number> {
  const result = await db.delete(thoughts).where(and(eq(thoughts.id, id), eq(thoughts.userId, userId)));
  return result.meta.changes;
}

/** 导出用：按创建时间正序取全部想法，与记录一起打包给用户。 */
export async function allThoughtsForExport(db: Db, userId: string): Promise<Thought[]> {
  const rows = await db
    .select()
    .from(thoughts)
    .where(eq(thoughts.userId, userId))
    .orderBy(thoughts.createdAt);
  return rows.map(rowToThought);
}
