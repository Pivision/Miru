/** 接口层的响应出口：统一的成功/失败形状、登录校验、上游错误折算。接口只服务 fetch，没有表单 303 分支；参数解析见 ./params。 */
import type { Context } from 'hono';
import type { HonoEnv } from '../env';
import type { SessionUser } from '@shared/types';
import { BangumiError } from '../sources/bangumi';

type Ctx = Context<HonoEnv>;

/** 全仓唯一的成功出口：一律包成 { ok: true, data }。前端 getJson 只认 payload.data，形状由这一处决定。 */
export function ok(c: Ctx, data: unknown): Response {
  return c.json({ ok: true, data });
}

/** 全仓唯一的失败出口：形状固定是 { error }，带 code 的分支多一个机器可读判别码（INVITE_REQUIRED 等），文案仍在 error 里。 */
export function fail(
  c: Ctx,
  message: string,
  status: 400 | 401 | 403 | 404 = 400,
  code?: string,
): Response {
  return c.json(code ? { error: message, code } : { error: message }, status);
}

/** 需要登录的接口统一走这里：未登录直接 401。页面级的「未登录就 303」在 worker 的登录守卫里，职责不重叠。 */
export async function withUser(
  c: Ctx,
  handler: (user: SessionUser) => Promise<Response> | Response,
): Promise<Response> {
  const user = await c.get('loadUser')();
  if (!user) return fail(c, '请先登录', 401);
  return handler(user);
}

/** Bangumi 侧失败折成 502，别让上游异常冒成 500。例外是上游的正当回答：非法 id 的 400、条目不存在的 404 原样透传，否则页面会把「无效的条目 ID」显示成「Bangumi 正忙」。超时 408 / 连接失败 504 仍折 502。 */
export function bangumiFail(c: Ctx, error: unknown): Response {
  if (error instanceof BangumiError) {
    // 折 502 并带 upstream 标记：e2e 要能认出「上游不可达」（认不出只能整段 skip，而 skip 和全绿太像），客户端也据此换文案。
    const status = error.status === 400 || error.status === 404 ? error.status : 502;
    return c.json({ error: error.message, upstream: true }, status);
  }
  throw error;
}
