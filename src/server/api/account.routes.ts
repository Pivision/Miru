/** 账号设置：昵称、密码、踢掉其它会话、导出数据、注销。 */
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { getAuth } from '../auth';
import { deleteOtherSessions, deleteUser, exportUserData, updateUserName } from '../data/account';
import { cnDate, nowSec } from '@shared/time';
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@shared/limits';
import { fail, ok, withUser } from './support';
import { readBody } from './params';

export const accountApi = new Hono<HonoEnv>();

accountApi.post('/settings/profile', (c) =>
  withUser(c, async (user) => {
    const body = await readBody(c);
    const name = String(body.name ?? '').trim();
    if (name.length < 1) return fail(c, '昵称不能为空', 400);
    // 上限与前端 maxLength 共用同一个常量；超长直接拒绝，截断会让用户以为整串存进去了。
    if (name.length > NAME_MAX_LENGTH) return fail(c, `昵称最长 ${NAME_MAX_LENGTH} 个字符`, 400);
    await updateUserName(c.get('db'), user.id, name);
    return ok(c, { name });
  }),
);

accountApi.post('/settings/password', (c) =>
  withUser(c, async () => {
    const body = await readBody(c);
    // 字段名必须与前端 src/client/components/features/settings/password-form.tsx 一致。
    const currentPassword = String(body.currentPassword ?? '');
    const newPassword = String(body.newPassword ?? '');
    // 形状在这里挡：空密码不该发到 Better Auth 去换一句英文报错回来。
    if (!currentPassword) return fail(c, '请输入当前密码', 400);
    if (newPassword.length < PASSWORD_MIN_LENGTH) return fail(c, `新密码至少 ${PASSWORD_MIN_LENGTH} 位`, 400);
    try {
      await getAuth(c.env).api.changePassword({
        body: { currentPassword, newPassword, revokeOtherSessions: true },
        headers: c.req.raw.headers,
      });
      return ok(c, {});
    } catch (error) {
      const message = error instanceof Error ? error.message : '修改失败';
      // 认得出「密码不对」就换成中文，其余原样透出：一律吞成「修改失败」会分不清密码错还是服务端炸了。
      return fail(c, /invalid|incorrect/i.test(message) ? '当前密码不对' : message, 400);
    }
  }),
);

accountApi.post('/settings/signout-others', (c) =>
  withUser(c, async (user) => {
    // 当前会话 id 必须由服务端自己从 Cookie 里读：让前端传就等于允许它传空值，条件退化成「删掉全部会话」，用户被静默登出。
    const current = await getAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    const currentId = current?.session?.id ?? '';
    if (!currentId) return fail(c, '找不到当前会话', 400);
    await deleteOtherSessions(c.get('db'), user.id, currentId);
    return ok(c, {});
  }),
);

accountApi.get('/export', (c) =>
  withUser(c, async (user) => {
    // 全站唯一不走 ok() 的接口：导出的是文件，必须保持纯 JSON，套 { ok: true, data } 会让导出文件不可再导入。不要为「形状统一」改成 ok(c, ...)。
    const payload = await exportUserData(c.get('db'), user.id);
    // Header 值必须是 ASCII：ASCII 兜底名 + RFC 5987 的 filename* 放中文名。日期按东八区算，toISOString()（UTC）会让 0-8 点导出的文件名早一天。
    const day = cnDate(nowSec());
    const readable = `miru-${user.name}-${day}.json`;
    c.header(
      'content-disposition',
      `attachment; filename="miru-${day}.json"; filename*=UTF-8''${encodeURIComponent(readable)}`,
    );
    return c.json(payload);
  }),
);

accountApi.post('/settings/delete', (c) =>
  withUser(c, async (user) => {
    const body = await readBody(c);
    if (String(body.confirm ?? '') !== 'DELETE') return fail(c, '请输入 DELETE 确认删除', 400);
    await deleteUser(c.get('db'), user.id);
    return ok(c, {});
  }),
);
