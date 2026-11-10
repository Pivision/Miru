import type { SessionUser } from '@shared/types';
import type { Db } from './db/client';

export interface Env {
  DB: D1Database;
  /** 静态产物绑定：SPA 的 index.html 与 /assets/* 都从这里取。 */
  ASSETS?: Fetcher;
  BGM_UA?: string;
  /** Bangumi 图片镜像域。不配则用上游原始地址。 */
  BGM_IMG_BASE?: string;
  BETTER_AUTH_SECRET?: string;
}

interface AppVars {
  /** 当前请求的 D1 客户端，由 api/index.ts 的中间件放进来。 */
  db: Db;
  /** 按需读会话：公开接口因此不多打一次 D1；同一请求内重复调用共享同一个 Promise，各处拿到的是同一个人。 */
  loadUser: () => Promise<SessionUser | null>;
}

/** Hono 的环境泛型：Bindings 是 Worker 绑定，Variables 是 c.set() 的表。叫 HonoEnv 而非 AppContext：它只是 Hono 的上下文泛型，与请求作用域无关。 */
export type HonoEnv = { Bindings: Env; Variables: AppVars };
