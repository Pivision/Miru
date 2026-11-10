import { drizzle } from 'drizzle-orm/d1';
import type { Env } from '../env';
import * as schema from './schema';

export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;

/** 生成站内业务主键：w_xxx / e_xxx / t_xxx，前缀区分作品、记录、想法。认证表与邀请码不走这里，由 better-auth 与 crypto.randomUUID() 各自生成。 */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 22)}`;
}
