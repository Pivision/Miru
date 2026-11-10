/** 接口总入口：把各子路由挂到同一个 Hono 实例。纯 SPA 下 /api/* 是前端拿数据的唯一通道。 */
import { Hono } from 'hono';
import { API_PREFIX } from '@shared/routes';
import type { SessionUser } from '@shared/types';
import type { HonoEnv } from '../env';
import { getDb } from '../db/client';
import { readUser } from '../auth';
import { recordsApi } from './records.routes';
import { thoughtsApi } from './thoughts.routes';
import { accountApi } from './account.routes';
import { adminApi } from './admin.routes';
import { authApi } from './auth.routes';
import { readsApi } from './reads.routes';

/** 子路由：路径都相对 /api。 */
const subs = [readsApi, recordsApi, thoughtsApi, accountApi, adminApi, authApi];

/** 中间件：把 db 与读会话的能力装进 c.set()。会话懒读，同一请求内复用同一个 Promise；/discover、/subject 也要它来拿到「可能为 null 的用户」，只有 /auth/* 不碰。前缀不能省 —— normalizeAuthPath 按「以 /api/auth 开头」剥离。 */
const app = new Hono<HonoEnv>();

app.use('*', async (c, next) => {
  const env = c.env;
  let pending: Promise<SessionUser | null> | null = null;
  c.set('db', getDb(env));
  c.set('loadUser', () => (pending ??= readUser(env, c.req.raw.headers)));
  await next();
});

// 子路由都挂在 API_PREFIX 下。
for (const sub of subs) app.route(API_PREFIX, sub);

/** 只导出挂好前缀的那一层。 */
export { app as apiApp };
