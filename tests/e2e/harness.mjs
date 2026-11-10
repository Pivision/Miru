/** e2e 的公共装置：计数、断言、请求助手。断言本身按段落分文件。 */
export const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';

export const stamp = Date.now().toString(36);
export const email = `e2e-${stamp}@miru.local`;

// 登录态 cookie：02-auth 注册后写入，后续各段共用。用 let 而非传参，是因为这套 e2e 本来就是「一个会话从头跑到尾」的线性剧本。
export let cookie = null;
export function setCookie(value) {
  cookie = value;
}
export let passed = 0;
export const failures = [];
export const skipped = [];

export const PASSWORD = 'test1234';
export const NEW_PASSWORD = 'newpass1234';

/** 默认 x-forwarded-for：Better Auth 的限流按 IP 建桶。换桶的段落用 request 的 ip 选项或直接给 headers。 */
export const DEFAULT_IP = '10.0.0.7';

export function skip(name, why) {
  skipped.push(`${name} (${why})`);
  console.log(`  skip ${name} — ${why}`);
}

export function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

export async function request(path, { method = 'GET', cookie, json, headers = {}, ip = DEFAULT_IP } = {}) {
  const init = { method, headers: { origin: BASE, 'x-forwarded-for': ip, ...headers }, redirect: 'manual' };
  if (cookie) init.headers.cookie = cookie;
  if (json !== undefined) {
    init.body = JSON.stringify(json);
    init.headers['content-type'] = 'application/json';
  }
  const res = await fetch(BASE + path, init);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  return { res, status: res.status, text, data, setCookies };
}

export function cookieOf(result, name) {
  for (const raw of result.setCookies) {
    if (raw.startsWith(name + '=')) return raw.split(';')[0];
  }
  return null;
}

/** 写操作简写：多数调用只需换 method。 */
export const post = (path, options = {}) => request(path, { ...options, method: 'POST' });

/** 注册一个账号：各调用点只有 name / email / inviteCode / headers 在变，密码与端点固定。 */
export function signUp({ name, email: address, inviteCode, headers }) {
  const json = { name, email: address, password: PASSWORD };
  if (inviteCode !== undefined) json.inviteCode = inviteCode;
  return post('/api/auth/sign-up/email', { headers, json });
}

/** 只关心状态码的断言。 */
export function checkStatus(name, result, expected) {
  const ok = Array.isArray(expected) ? expected.includes(result.status) : result.status === expected;
  check(name, ok, `status ${result.status}`);
}

/** 页面壳：多个段落共用，避免重复请求。 */
export const getShell = (cookieValue) => request('/', { cookie: cookieValue });

/** 从 HTML 抠出的资源地址可能是 undefined，此时不发请求。 */
export const tryGet = async (href) => (href ? request(href) : { status: 0, text: '' });
