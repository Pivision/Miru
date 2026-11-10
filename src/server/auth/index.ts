import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { API_PREFIX } from '@shared/routes';
import { PASSWORD_MIN_LENGTH } from '@shared/limits';
import type { SessionUser } from '@shared/types';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import type { Env } from '../env';
import { hashPassword, verifyPassword } from './password';

/** 仅 dev 用的兜底密钥。生产漏配 BETTER_AUTH_SECRET 时直接抛，否则签名用仓库写死的串，谁都能伪造 Cookie 且无报错。 */
const DEV_SECRET = 'miru-dev-secret-please-set-BETTER_AUTH_SECRET-0001';

/** 生产漏配密钥时给用户看的中文提示；配好或 dev 下返回 null。Worker 入口拿它提前拦成提示页，resolveSecret 也复用同一处判断，避免两份文案漂移。 */
export function secretProblem(env: Env): string | null {
  if (env.BETTER_AUTH_SECRET) return null;
  if (import.meta.env.DEV) return null;
  return '缺少 BETTER_AUTH_SECRET：生产环境必须先用 `wrangler secret put BETTER_AUTH_SECRET` 配置会话签名密钥';
}

function resolveSecret(env: Env): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (import.meta.env.DEV) {
    console.warn('[auth] 未配置 BETTER_AUTH_SECRET，本次使用开发期兜底密钥');
    return DEV_SECRET;
  }
  throw new Error(secretProblem(env) ?? '缺少 BETTER_AUTH_SECRET：生产环境必须配置会话签名密钥');
}

/** 按 isolate 构建一次并复用：会话存 D1，口令走 PBKDF2（Workers 不必跑 scrypt）。 */
function build(env: Env) {
  const db = getDb(env);
  return betterAuth({
    appName: 'Miru',
    // 配了就用配置值固定；没配传 undefined，退回由请求 host 推导（不含任何写死的域名，仓库可直接开源）。
    baseURL: env.BETTER_AUTH_URL || undefined,
    basePath: `${API_PREFIX}/auth`,
    secret: resolveSecret(env),
    database: drizzleAdapter(db, {
      provider: 'sqlite',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: 128,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24 * 3,
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rateLimit',
      window: 60,
      max: 12,
      customRules: {
        '/sign-in/email': { window: 60, max: 8 },
        '/sign-up/email': { window: 60, max: 5 },
      },
    },
    advanced: {
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip', 'x-forwarded-for'] },
      // 不配 baseURL 时 better-auth 无法判断当前是 https（Workers 上也没有 NODE_ENV=production），
      // Cookie 会退化成不带 __Secure- 前缀、secure:false。这里按构建期 DEV 显式钉死：
      // 线上（构建产物）一律 Secure，本地 vite dev 才放行 http。
      useSecureCookies: !import.meta.env.DEV,
    },
  });
}

type Auth = ReturnType<typeof build>;

let cache: { db: D1Database; auth: Auth } | null = null;

export function getAuth(env: Env): Auth {
  if (cache && cache.db === env.DB) return cache.auth;
  const auth = build(env);
  cache = { db: env.DB, auth };
  return auth;
}

/** 读会话的唯一入口。查询失败不让整站挂掉：记日志、按未登录处理，由守卫送去登录页。 */
export async function readUser(env: Env, headers: Headers): Promise<SessionUser | null> {
  try {
    const result = await getAuth(env).api.getSession({ headers });
    if (!result) return null;
    const u = result.user;
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image ?? null,
    };
  } catch (error) {
    console.error('[auth] 读取会话失败', error);
    return null;
  }
}
