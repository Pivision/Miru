/** 账号域：管理员判定、账号写操作（改名 / 踢会话 / 注销）、数据导出。SQL 一律留在这里；统计类聚合在 read-models.ts。 */
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Entry } from '@shared/types';
import type { Db } from '../db/client';
import { session as sessionTable, user as userTable } from '../db/schema';
import { listEntries, PAGE_FETCH_CAP } from './entries';
import { allThoughtsForExport } from './thoughts';

/** 管理员判定：createdAt 最早的账号自动是管理员——首个注册者天然拿到权限，不需要初始化脚本，也不会有「表里没有管理员」的死锁。取全表最早 id 与 userId 比对。 */
export async function isAdmin(db: Db, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .orderBy(asc(userTable.createdAt), asc(userTable.id))
    .limit(1);
  return rows[0]?.id === userId;
}

export async function updateUserName(db: Db, userId: string, name: string): Promise<void> {
  await db
    .update(userTable)
    .set({ name, updatedAt: new Date() })
    .where(eq(userTable.id, userId));
}

/** 删掉除 keepSessionId 之外的会话。条件退化成「删全部」会静默登出，所以调用方要先确认 id 非空。 */
export async function deleteOtherSessions(db: Db, userId: string, keepSessionId: string): Promise<void> {
  await db
    .delete(sessionTable)
    .where(and(eq(sessionTable.userId, userId), ne(sessionTable.id, keepSessionId)));
}

/** 注销：user 行删掉后 session/account 靠外键级联清理。 */
export async function deleteUser(db: Db, userId: string): Promise<void> {
  await db.delete(userTable).where(eq(userTable.id, userId));
}

/** 单页条数：复用 listEntries 的封顶。 */
const EXPORT_PAGE = PAGE_FETCH_CAP;

export async function exportUserData(db: Db, userId: string) {
  // 必须分页取到不足一页为止：写死 limit 会撞封顶而静默截断，而同一份文件里的想法是全量的，两半完整度对不上。
  const entriesList: Entry[] = [];
  for (let offset = 0; ; offset += EXPORT_PAGE) {
    // 用 created 而非 updated：导出期间若有写入，updated 会让行在页间挪动，偏移分页就会漏行或重复。
    const page = await listEntries(db, userId, { limit: EXPORT_PAGE, offset, sort: 'created' });
    entriesList.push(...page);
    if (page.length < EXPORT_PAGE) break;
  }
  // 想法在分页循环之后再取：提前放出而循环中途抛错，这个 Promise 就没人 await 了。
  const thoughts = await allThoughtsForExport(db, userId);
  return {
    exported_at: new Date().toISOString(),
    entries: entriesList,
    thoughts,
  };
}
