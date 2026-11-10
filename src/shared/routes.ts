/** 路由常量：登录/注册路径、跳转白名单、标签页标题。纯 SPA 不按路由生成 meta，只留标签页 title。 */

export const LOGIN_PATH = '/login';
export const REGISTER_PATH = '/register';

/** 接口前缀的唯一来源：Worker 分流、Hono 挂载点、前端拼接都引用它。 */
export const API_PREFIX = '/api';

/** 是否接口路径：Worker 要按它决定发 JSON 还是发页面，两处 503 提示页也要按它选格式，判据只留这一份。 */
export function isApiPath(pathname: string): boolean {
  return pathname === API_PREFIX || pathname.startsWith(`${API_PREFIX}/`);
}

const SITE = 'Miru';

/** 详情页路径前缀：拼链接用 subjectPath，判断是不是详情页用这一条（AppShell 据此决定通栏铺满）。 */
export const SUBJECT_PREFIX = '/subject/';

/** 详情页站内路径：卡片、hero、详情页自身都从这里拼，改前缀只改这一处。路由表里仍写 /subject/:id。 */
export function subjectPath(id: string | number): string {
  return `${SUBJECT_PREFIX}${id}`;
}

const PAGE_TITLES: Record<string, string> = {
  '/': '下一幕',
  '/library': '书库',
  '/discover': '发现',
  '/settings': '设置',
  [LOGIN_PATH]: '登录',
  [REGISTER_PATH]: '注册',
};

/** 路径 → 标签页标题：详情页传作品名，其余查表。 */
export function pageTitle(pathname: string, subjectName?: string): string {
  const own = PAGE_TITLES[pathname];
  if (own) return `${own} · ${SITE}`;
  if (subjectName) return `${subjectName} · ${SITE}`;
  return SITE;
}

/** 登录/注册页：不套外框、不做会话过期回跳。回跳守卫与 AppShell 都走这里。 */
export function isAuthPath(pathname: string): boolean {
  return pathname === LOGIN_PATH || pathname === REGISTER_PATH;
}

/** 跳转白名单：只放行站内绝对路径。判据是放进 URL 解析器比对 origin 而非字符串前后缀（反斜杠等价与 tab/LF 剥离都能绕过朴素判断）；同时挡掉指回登录/注册页的路径，避免登录成功后跳回登录页。 */
export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return fallback;
  // origin 只是占位，要判的是解析后有没有跑到别的 origin 去。
  const base = 'http://miru.invalid';
  let parsed: URL;
  try {
    parsed = new URL(value, base);
  } catch {
    return fallback;
  }
  if (parsed.origin !== base) return fallback;
  // 解析会把 /..//evil.com、/.//evil.com 这类 dot-segment 规范成 // 开头的 pathname（协议相对地址，送进 redirect 就跨域），必须复核一次。
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  if (path.startsWith('//')) return fallback;
  if (isSameOrChildPath(path, LOGIN_PATH) || isSameOrChildPath(path, REGISTER_PATH)) return fallback;
  return path;
}

/** path 是否等于 prefix 或在它下面（/login、/login?x、/login/a 都算）。 */
function isSameOrChildPath(path: string, prefix: string): boolean {
  if (path === prefix) return true;
  const next = path.charAt(prefix.length);
  return path.startsWith(prefix) && (next === '?' || next === '/');
}
