import { PASSWORD_MIN_LENGTH } from '@shared/limits';
import { API_PREFIX } from '@shared/routes';

export class ApiError extends Error {
  status: number;
  /** message 给开发者（可能是实现细节），userMessage 才给人看，分开才不盖掉页面 hint。 */
  userMessage: string;
  constructor(message: string, status: number, userMessage?: string) {
    super(message);
    this.status = status;
    this.userMessage = userMessage ?? message;
  }
}

/** 「会话过期」通知出口：call 收到 401 时调它。不直接跳登录页：纯数据层不该依赖路由，?next= 只有组件拼得出来。 */
let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null) {
  unauthorizedHandler = handler;
}

/** 写操作失败的统一兜底文案：认证入口与写 mutation 共用一份，改口径只改这里。 */
export const WRITE_FALLBACK = '操作失败，请稍后重试';

/** 折成可展示中文：只取 userMessage。网络中断已在 send 包成 ApiError，fallback 只兜「抛的不是 Error」。 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.userMessage;
  return error instanceof Error && error.message ? error.message : fallback;
}

/** 写请求超时：写入靠 mutation scope 串行化，一个永不返回的请求会让后面排队的写入和按钮一起卡死。 */
const WRITE_TIMEOUT_MS = 20000;

const JSON_HEADERS = { 'content-type': 'application/json', accept: 'application/json' };

function jsonPost(body: Record<string, unknown>): RequestInit {
  return { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(body) };
}

/** 认证接口的响应体：better-auth 回的是它自己的会话 JSON（含 user），不走 { ok, data } 信封。 */
type Payload = { error?: string; message?: string; user?: unknown } & { data?: unknown };

/** 请求骨架：fetch → 超时/网络错误归一 → 解析 JSON（坏响应退化成空对象）。前缀在这里拼一次，/api 的唯一来源是 API_PREFIX。 */
async function send(path: string, init: RequestInit, timeoutMs?: number): Promise<{ res: Response; payload: Payload }> {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let res: Response;
  try {
    res = await fetch(`${API_PREFIX}${path}`, { credentials: 'same-origin', signal: controller?.signal, ...init });
  } catch (error) {
    if (controller?.signal.aborted) throw new ApiError('请求超时，请稍后再试', 0);
    // fetch 的 TypeError: Failed to fetch 会挤掉页面提示，所以包成 ApiError：英文进 message，中文进 userMessage。
    const detail = error instanceof Error ? error.message : String(error);
    throw new ApiError(detail, 0, '网络好像断了，请稍后重试');
  } finally {
    if (timer) clearTimeout(timer);
  }
  const payload = (await res.json().catch((error) => {
    // 200 却不是 JSON 说明中间层塞了别的东西：留印证，否则前端只看到「缺 data 层」。
    console.warn(`[api] ${path} 响应不是 JSON，按空对象处理`, error);
    return {};
  })) as Payload;
  return { res, payload };
}

type CallOptions = {
  /** 写请求超时，读不设上限。 */
  timeoutMs?: number;
  /** 失败兜底文案，也是缺 data 层时给用户看的那句。 */
  fallback: string;
  /** true = 剥掉 { ok, data } 信封，只交 data。 */
  unwrap: boolean;
  /** true = 错误来自 Better Auth，文案先过 translateAuthError。 */
  auth?: boolean;
};

/** send 之上唯一一层语义：非 2xx 转 ApiError，可选剥信封。 */
async function call<T>(path: string, init: RequestInit, options: CallOptions): Promise<T> {
  const { res, payload } = await send(path, init, options.timeoutMs);
  if (!res.ok) {
    // 401 = 会话没了，只通知不跳转（?next= 由 app 层守卫拼）；登录注册的 401 是密码错，auth 时跳过。
    if (res.status === 401 && !options.auth) unauthorizedHandler?.();
    // Better Auth 的错误字段是 message，其余接口用 error。
    const raw = ((options.auth ? payload.error || payload.message : payload.error) || options.fallback) as string;
    throw new ApiError(options.auth ? translateAuthError(raw) : raw, res.status);
  }
  if (!options.unwrap) return payload as T;
  // 缺 data 层多半是形状变了或被守卫换了响应：返回 undefined 会让页面停在骨架屏，所以抛错。
  if (payload.data === undefined) throw new ApiError('响应缺少 data 层', res.status, options.fallback);
  return payload.data as T;
}

export function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  // 写接口响应同样是 { ok: true, data }，不剥拿到的是信封。
  return call<T>(path, jsonPost(body), {
    timeoutMs: WRITE_TIMEOUT_MS,
    fallback: '保存失败，请稍后重试',
    unwrap: true,
  });
}

export function getJson<T>(path: string): Promise<T> {
  return call<T>(path, { headers: { accept: 'application/json' } }, { fallback: '读取失败，请稍后重试', unwrap: true });
}

/* ------------------------------------------------------------------- 认证 */
function authRequest(path: string, body: Record<string, unknown>) {
  // 与写接口同一上限：都要落 D1，卡住时按钮不能一直转。
  return call<Payload>(`/auth/${path}`, jsonPost(body), {
    timeoutMs: WRITE_TIMEOUT_MS,
    fallback: WRITE_FALLBACK,
    unwrap: false,
    auth: true,
  });
}

function translateAuthError(message: string): string {
  const text = message.toLowerCase();
  if (text.includes('invalid email or password')) return '邮箱或密码不对';
  if (text.includes('user already exists')) return '这个邮箱已经注册过了';
  if (text.includes('password too short')) return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (text.includes('invalid email')) return '邮箱格式好像不对';
  if (text.includes('too many requests')) return '尝试太频繁了，请稍后再试';
  return message;
}

export function signIn(email: string, password: string) {
  return authRequest('sign-in/email', { email, password, rememberMe: true });
}

export function signUp(name: string, email: string, password: string, inviteCode?: string) {
  // 邀请码永远随请求发（没填是空串）：要不要校验由后端按站点设置决定，前端不必预知开关。
  return authRequest('sign-up/email', { name, email, password, inviteCode: inviteCode?.trim() ?? '' });
}

/** 退出登录。走 send 而非 call（不要 ApiError、不剥信封），只在超时与网络失败时抛；useSignOut 仍包 catch：本地清理不依赖服务端怎么答。 */
export async function signOut() {
  const { res } = await send('/auth/sign-out', jsonPost({}), WRITE_TIMEOUT_MS);
  return res;
}
