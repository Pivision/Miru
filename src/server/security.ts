/** Worker 层三道闸：跨站写请求、安全响应头、登录守卫。调用点只有 src/worker.ts 一个，拆开反而每次改动都要跨文件跳。 */
import { LOGIN_PATH, isAuthPath } from '@shared/routes';
import type { SessionUser } from '@shared/types';

/* ------------------------------------------------------------- 跨站写请求 */

function blocked(): Response {
  return new Response('跨站请求被拒绝', { status: 403 });
}

/** 跨站写拦截：非 GET/HEAD 且 Origin 的 host 与当前请求不同就 403，在 Worker 入口先于业务逻辑执行。没有 Origin（同源表单、curl、服务端调用）或 Origin: null（沙箱 iframe、隐私模式）仍放行。 */
export function rejectCrossSiteWrite(request: Request): Response | null {
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') return null;

  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return null;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return blocked();
  }

  if (originHost !== new URL(request.url).host) return blocked();
  return null;
}

/* --------------------------------------------------------------- 安全响应头 */

/** 纯 SPA 的页面壳是没有内联脚本的静态 index.html，script-src 只需 'self'，CSP nonce 那一套（生成、转发、贴属性）全部退役。 */
function contentSecurityPolicy(): string {
  return `default-src 'self'; img-src 'self' https: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:; connect-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'self'`;
}

/** 补全站安全头。必须重新构造 Response：headers 在部分运行时只读，redirect 与流式响应要原样保留 status 与 body。 */
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'SAMEORIGIN');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('content-security-policy', contentSecurityPolicy());

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/* ----------------------------------------------------------------- 登录守卫 */

// 页面壳对所有路径都是同一份 index.html，不在 Worker 层拦的话，未登录用户会先看到空白壳再被前端跳走，所以发任何 HTML 之前就 303。判据只看 URL 与传入的 user，守卫本身零 D1 读。

/** 构建产物目录：一律按资源处理，不论末段有无扩展名。 */
const ASSET_PREFIX = '/assets/';

/** Vite dev 注入的内部模块（/@vite/、/@react-refresh 等）。末段没有扩展名，会被「带点即资源」漏掉而 303 到 /login，浏览器跟过去后 Vite 把 index.html 当 JS 解析，报 Failed to parse source for import analysis，dev 白屏。 */
const DEV_MODULE_PREFIXES = ['/@vite/', '/@react-refresh', '/@fs/', '/@id/'];

/** 带扩展名的路径当资源看：产物缺失该老实 404，而不是折去登录页（/theme-boot.js、/favicon.ico 靠这条）。/assets/ 开头无条件算资源，目录本身与缺失 chunk 都该 404。 */
export function looksLikeAsset(pathname: string): boolean {
  if (pathname.startsWith(ASSET_PREFIX)) return true;
  if (DEV_MODULE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last.includes('.');
}

/** 未登录且访问非公开页面时 303 到 /login?next=原地址，否则返回 null 放行。 */
export function loginGuard(request: Request, user: SessionUser | null): Response | null {
  if (user) return null;

  const method = request.method.toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return null;

  const url = new URL(request.url);
  if (isAuthPath(url.pathname)) return null;

  const next = encodeURIComponent(url.pathname + url.search);
  return new Response(null, {
    status: 303,
    headers: { location: `${LOGIN_PATH}?next=${next}` },
  });
}
