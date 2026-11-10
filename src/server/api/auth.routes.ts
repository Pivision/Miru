/** auth 透传：注册拦截 + 邀请码结算。拦截必须在 Better Auth 之前 —— 等它把账号建好了再拦就只能删数据。 */
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { getAuth } from '../auth';
import { API_PREFIX } from '@shared/routes';
import { findUserIdByEmail, recordInviteUse, releaseInviteCode, reserveInviteCode } from '../data/invite';
import { readSiteSettings } from '../data/site-settings';
import { readBody } from './params';
import { fail } from './support';

export const authApi = new Hono<HonoEnv>();

/** 归一化 auth 子路径：去前缀、解码百分号转义、合并重复斜杠、去尾斜杠，让 /sign-up/email/、//sign-up/email、%73ign-up 都能匹配。 */
const AUTH_PREFIX = `${API_PREFIX}/auth`;

function normalizeAuthPath(path: string): string {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // 非法转义按原样处理。
  }
  const cleaned = decoded.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
  const withoutPrefix = cleaned.startsWith(AUTH_PREFIX) ? cleaned.slice(AUTH_PREFIX.length) : cleaned;
  return withoutPrefix || '/';
}

authApi.on(['GET', 'POST'], '/auth/*', async (c) => {
  // 拦截放在 Better Auth 之前，之后就只能删数据。只拦注册路径，用归一化后以 /sign-up 开头匹配，而不是 endsWith('/sign-up/email') —— 后者认不出 %2D 这类编码，将来加 social provider 也会漏。
  // 规则：关闭注册一律拒绝；要求邀请码时校验存在/未作废/未过期/有余量，并原子预占一次额度，建号失败再还回。
  const authPath = normalizeAuthPath(c.req.path);
  const isSignUp = c.req.method === 'POST' && authPath.startsWith('/sign-up');
  let pendingCodeId: string | null = null;
  let signUpEmail = '';

  if (isSignUp) {
    const db = c.get('db');
    const site = await readSiteSettings(db);
    if (!site.registrationOpen) {
      return fail(c, '站点已关闭注册', 403, 'REGISTRATION_CLOSED');
    }
    const body = await readBody(c);
    signUpEmail = String(body.email ?? '').trim();
    if (site.requireInvite) {
      const reserved = await reserveInviteCode(db, String(body.inviteCode ?? ''));
      if (!reserved.ok) return fail(c, reserved.message, 403, 'INVITE_REQUIRED');
      pendingCodeId = reserved.id;
    }
  }

  // 预占之后只有两种结局：记使用记录或还回额度。关键是「没拿到 userId」不能直接还 —— 账号可能已建成，所以拿不到时按邮箱回查 user 表，查到就算成功。
  let responseUserId: string | null = null;

  const settle = async (succeeded: boolean) => {
    if (!pendingCodeId) return;
    const codeId = pendingCodeId;
    const db = c.get('db');
    try {
      if (!succeeded) {
        await releaseInviteCode(db, codeId);
        return;
      }
      const userId = responseUserId ?? (await findUserIdByEmail(db, signUpEmail));
      // 额度已扣过，这里只补记录：写不进去就记日志，不再退额度 —— release 带 used_count > 0 守卫，并发下可能是空操作，结果变成「额度扣了、记录没写」。
      await recordInviteUse(db, codeId, userId);
    } catch (error) {
      console.error('[invite] 结算邀请码失败', error);
    }
  };

  let response: Response;
  try {
    response = await getAuth(c.env).handler(c.req.raw);
  } catch (error) {
    // 抛异常分两种：建号成功但后续炸了（要扣额度），或根本没建号（要退）。没有响应可判，所以按邮箱回查 user 表现场判定。
    await settle((await findUserIdByEmail(c.get('db'), signUpEmail)) !== null);
    throw error;
  }

  if (pendingCodeId && response.ok) {
    try {
      const payload = (await response.clone().json()) as { user?: { id?: string } };
      responseUserId = payload.user?.id ?? null;
    } catch {
      responseUserId = null;
    }
    await settle(true);
  } else if (pendingCodeId) {
    // 邮箱撞车之类：账号没建成，还回额度。
    await settle(false);
  }
  return response;
});