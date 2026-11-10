/* 站点管理：注册开关与邀请码。全部接口要求管理员身份，判定见 data/account.ts 的 isAdmin。 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import type { HonoEnv } from '../env';
import { isAdmin } from '../data/account';
import { createInviteCode, revokeInviteCode } from '../data/invite';
import { writeSiteSettings } from '../data/site-settings';
import { fail, ok, withUser } from './support';
import { parseFlag, readBody } from './params';
import type { SessionUser } from '@shared/types';

export const adminApi = new Hono<HonoEnv>();

/** 管理员守卫：先要登录，再要管理员。两关都过才进 handler。 */
async function withAdmin(
  c: Context<HonoEnv>,
  handler: (user: SessionUser) => Promise<Response> | Response,
) {
  return withUser(c, async (user) => {
    if (!(await isAdmin(c.get('db'), user.id))) return fail(c, '只有管理员能做这个操作', 403);
    return handler(user);
  });
}

// 前端统一走 postJson：读开关的职责在 GET /api/settings（data.admin），这里只留写。
adminApi.post('/settings/site', (c) =>
  withAdmin(c, async () => {
    const body = await readBody(c);
    const patch: { registrationOpen?: boolean; requireInvite?: boolean } = {};
    // 认不出的值（"maybe"、空串、数组……）直接 400，不静默折成 false 把注册关掉。
    if ('registrationOpen' in body) {
      const flag = parseFlag(body.registrationOpen);
      if (flag === null) return fail(c, 'registrationOpen 只接受布尔值', 400);
      patch.registrationOpen = flag;
    }
    if ('requireInvite' in body) {
      const flag = parseFlag(body.requireInvite);
      if (flag === null) return fail(c, 'requireInvite 只接受布尔值', 400);
      patch.requireInvite = flag;
    }
    if (Object.keys(patch).length === 0) return fail(c, '没有要保存的开关', 400);
    return ok(c, { site: await writeSiteSettings(c.get('db'), patch) });
  }),
);

adminApi.post('/settings/invites', (c) =>
  withAdmin(c, async (user) => {
    const body = await readBody(c);

    // Number('abc') 是 NaN，而 NaN 既不 <1 也不 >100，所以整数性必须一起判，只判范围会被它溜过去。
    // 不取整：以前 Math.round 把 2.9 静默变成 3、0.5 变成 1，与 records 的进度接口口径相反。
    // 客户端 input 是 step=1，正常走不到这里；这里挡的是直接调 API 的误传。
    const remaining = Number(body.remaining ?? 1);
    if (!Number.isInteger(remaining) || remaining < 1 || remaining > 100) {
      return fail(c, '可用次数要在 1 到 100 之间', 400);
    }
    // 有效期按「多少天后过期」传；空值 = 永不过期。
    const daysRaw = String(body.expiresInDays ?? '').trim();
    let expiresAt: number | null = null;
    if (daysRaw) {
      const days = Number(daysRaw);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) return fail(c, '有效天数要在 1 到 3650 之间', 400);
      expiresAt = Date.now() + Math.round(days * 24 * 60 * 60 * 1000);
    }

    const invite = await createInviteCode(c.get('db'), { createdBy: user.id, remaining, expiresAt });
    return ok(c, { invite });
  }),
);

adminApi.post('/settings/invites/:id/revoke', (c) =>
  withAdmin(c, async () => {
    const done = await revokeInviteCode(c.get('db'), c.req.param('id'));
    if (!done) return fail(c, '这个邀请码不存在或已经作废', 404);
    return ok(c, { revoked: true });
  }),
);
