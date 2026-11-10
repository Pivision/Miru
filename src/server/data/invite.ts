/** 邀请码：生成、校验、核销、作废。一个码可用 remaining 次，每成功注册扣一次；归零、过期、作废即失效。 */
import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { inviteCode, inviteUse, user as userTable } from '../db/schema';
import type { InviteCodeView, InviteUseView } from '@shared/types';

/** 去掉易混的 0/O/1/I/l，手抄或口头传码不出错。 */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 生成 MIRU-XXXX-XXXX：可读、足够随机（31^8 ≈ 8.5e11）。 */
function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]);
  return `MIRU-${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

/** 输入码统一成 MIRU-XXXX-XXXX：先剔非字母数字再重插连字符，否则手抄丢了连字符就查不到。 */
function normalizeCode(raw: string): string {
  const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!compact) return '';
  const body = compact.startsWith('MIRU') ? compact.slice('MIRU'.length) : compact;
  if (body.length !== 8) return compact;
  return `MIRU-${body.slice(0, 4)}-${body.slice(4)}`;
}

function toView(row: typeof inviteCode.$inferSelect, now: number): InviteCodeView {
  return {
    id: row.id,
    code: row.code,
    remaining: row.remaining,
    usedCount: row.usedCount,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    dead: rejectReason(row, now) !== null,
    uses: [],
  };
}

async function listInviteCodes(db: Db): Promise<InviteCodeView[]> {
  const rows = await db.select().from(inviteCode).orderBy(desc(inviteCode.createdAt));
  const now = Date.now();
  return rows.map((row) => toView(row, now));
}

/** 带使用记录的邀请码列表。/api/settings 与 /api/settings/invites 共用同一份，否则刷新一次就把展开的记录刷空。 */
export async function listInviteCodesWithUses(db: Db): Promise<InviteCodeView[]> {
  const codes = await listInviteCodes(db);
  if (codes.length === 0) return codes;
  // 一条查询取回全部使用记录再分组，避免 N+1。
  const rows = await db
    .select({
      codeId: inviteUse.codeId,
      id: inviteUse.id,
      usedAt: inviteUse.usedAt,
      userName: userTable.name,
      userEmail: userTable.email,
    })
    .from(inviteUse)
    .leftJoin(userTable, eq(userTable.id, inviteUse.userId))
    .where(
      inArray(
        inviteUse.codeId,
        codes.map((code) => code.id),
      ),
    )
    .orderBy(desc(inviteUse.usedAt));

  const grouped = new Map<string, InviteUseView[]>();
  for (const row of rows) {
    const list = grouped.get(row.codeId) ?? [];
    list.push({ id: row.id, usedAt: row.usedAt, userName: row.userName, userEmail: row.userEmail });
    grouped.set(row.codeId, list);
  }
  return codes.map((code) => ({ ...code, uses: grouped.get(code.id) ?? [] }));
}

export async function createInviteCode(
  db: Db,
  { createdBy, remaining, expiresAt }: { createdBy: string; remaining: number; expiresAt: number | null },
): Promise<InviteCodeView> {
  // 任何插入失败都重试最多三次（不区分原因：撞码、约束、连接错误都走这条），第三次仍失败就把原始错误抛出。
  // 循环不设上界，好让编译器知道这里要么 return 要么 throw。
  for (let attempt = 0; ; attempt += 1) {
    const code = makeCode();
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    try {
      const row = {
        id,
        code,
        remaining,
        usedCount: 0,
        expiresAt,
        revokedAt: null,
        createdBy,
        createdAt,
      };
      await db.insert(inviteCode).values(row);
      return toView(row, createdAt);
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
}

export async function revokeInviteCode(db: Db, id: string): Promise<boolean> {
  const rows = await db
    .update(inviteCode)
    .set({ revokedAt: Date.now() })
    .where(and(eq(inviteCode.id, id), sql`${inviteCode.revokedAt} IS NULL`))
    .returning({ id: inviteCode.id });
  return rows.length > 0;
}

type InviteCheck =
  | { ok: true; id: string }
  | { ok: false; message: string };

/** 此刻为什么不能用，能用返回 null；判序：作废 → 过期 → 用完。 */
function rejectReason(row: typeof inviteCode.$inferSelect, now: number): string | null {
  if (row.revokedAt !== null) return '这个邀请码已被作废';
  if (row.expiresAt !== null && row.expiresAt <= now) return '这个邀请码已过期';
  if (row.remaining <= 0) return '这个邀请码已经用完了';
  return null;
}

/** 预占一次额度：不能「先查后扣」，中间隔着一次建号，并发请求都能通过检查、结果建了号却没扣次数。故改成带条件的原子 UPDATE，把作废/过期/用完整写进 WHERE；建号失败由调用方 releaseInviteCode 还回去。 */
export async function reserveInviteCode(db: Db, rawCode: string): Promise<InviteCheck> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, message: '需要邀请码才能注册' };

  // 先读一次只为错误文案，成败由下面的 UPDATE 决定。
  const rows = await db.select().from(inviteCode).where(eq(inviteCode.code, code)).limit(1);
  const row = rows[0];
  if (!row) return { ok: false, message: '邀请码不存在' };
  const early = rejectReason(row, Date.now());
  if (early) return { ok: false, message: early };

  const now = Date.now();
  const updated = await db
    .update(inviteCode)
    .set({ remaining: sql`${inviteCode.remaining} - 1`, usedCount: sql`${inviteCode.usedCount} + 1` })
    .where(
      and(
        eq(inviteCode.id, row.id),
        gt(inviteCode.remaining, 0),
        sql`${inviteCode.revokedAt} IS NULL`,
        sql`(${inviteCode.expiresAt} IS NULL OR ${inviteCode.expiresAt} > ${now})`,
      ),
    )
    .returning({ id: inviteCode.id });
  if (updated.length === 0) {
    // 抢额度失败可能是并发用完，也可能是刚被作废/过期，不重读就会按「用完了」去查额度，实际是码被撤了。
    const fresh = (await db.select().from(inviteCode).where(eq(inviteCode.id, row.id)).limit(1))[0];
    return { ok: false, message: (fresh && rejectReason(fresh, Date.now())) || '这个邀请码刚刚被用掉了' };
  }
  return { ok: true, id: row.id };
}

/** 建号失败时把预占的额度还回去，免得邮箱撞车白吃一次。必须带 used_count > 0：重试或双写会调两次，无条件自增会把 used_count 打成负数并凭空造出额度。 */
export async function releaseInviteCode(db: Db, codeId: string): Promise<void> {
  await db
    .update(inviteCode)
    .set({ remaining: sql`${inviteCode.remaining} + 1`, usedCount: sql`${inviteCode.usedCount} - 1` })
    .where(and(eq(inviteCode.id, codeId), gt(inviteCode.usedCount, 0)));
}

/** 按邮箱查账号 id：注册响应取不到 userId 时的兜底。 */
export async function findUserIdByEmail(db: Db, email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const rows = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, normalized))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** 记一条使用记录（额度已在 reserveInviteCode 扣过）。userId 可为 null：建号成功但取不到 id、按邮箱也查不到时额度照样该扣，而 invite_use.user_id 本就是可空列。 */
export async function recordInviteUse(db: Db, codeId: string, userId: string | null): Promise<void> {
  await db.insert(inviteUse).values({ id: crypto.randomUUID(), codeId, userId, usedAt: Date.now() });
}
