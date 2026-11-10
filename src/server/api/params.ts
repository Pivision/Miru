/** 参数解析零件：把宽松值整理成接口要的窄类型。与 support.ts（响应出口）分开：改信封形状与改参数宽容度是两件不相干的事。 */
import type { Context } from 'hono';
import type { HonoEnv } from '../env';
import { cnDateToSec, isSecStamp } from '@shared/time';

type Ctx = Context<HonoEnv>;

/** 日期整理成库里的秒时间戳字符串：空值 → null（清空）；2026-10-28 → 那天 00:00；纯数字秒时间戳原样保留；其余返回 undefined 表示格式错误。 */
export function toStamp(raw: unknown): string | null | undefined {
  if (raw === null || raw === undefined) return null;
  const value = String(raw).trim();
  if (!value) return null;
  // 位数口径统一在 @shared/time。
  if (isSecStamp(value)) return value;
  const seconds = cnDateToSec(value);
  return seconds === null ? undefined : String(seconds);
}

/** 开关值解析成布尔：只认 JSON 布尔。不能直接 Boolean()："false" 是真值会把开关反向保存；其余类型（字符串、数组、null）一律返回 null 由调用方 400。 */
export function parseFlag(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/** 正整数 id：非整数、0、负数一律返回 null，由调用方决定怎么回。 */
export function positiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** 读请求体并保证形状是对象。走 raw.clone() 而非 c.req.json()：better-auth 的 handler 后面要拿原始 body 解析，直接读会把流消耗掉。 */
export async function readBody(c: Ctx): Promise<Record<string, unknown>> {
  try {
    const value = (await c.req.raw.clone().json()) as unknown;
    // 客户端可发 null / 数组 / 数字，直接用会让 'x' in body 抛 TypeError 变 500。
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    // 坏 JSON 与空 body 在调用方看来都是 {}，所以不返 400（有的接口允许空 body）。但要留日志，否则分不清「参数没传」和「默认值兜底」。
    console.warn('请求体不是合法 JSON，按空对象处理：', c.req.url);
    return {};
  }
}
