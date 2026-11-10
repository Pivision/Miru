/** Worker 唯一入口（纯 SPA）。三条去向：/api/* → Hono；带扩展名 → 静态产物（未命中 404）；其余 → 过登录守卫再吐 index.html。业务逻辑不在这层，只做分流、守卫与安全头。 */
import { apiApp } from './server/api';
import { isApiPath } from '@shared/routes';
import type { Env } from './server/env';
import { readUser, secretProblem } from './server/auth';
import { ensureSchema } from './server/db/bootstrap';
import { applySecurityHeaders, loginGuard, looksLikeAsset, rejectCrossSiteWrite } from './server/security';

/** 页面壳固定取这个文件，不依赖 not_found_handling。 */
const SHELL_PATH = '/index.html';

function notFound(): Response {
  return new Response('Not Found', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/** 取静态产物；ASSETS 未绑定时返回 null，由调用方决定 404 还是 500。 */
async function fromAssets(request: Request, env: Env): Promise<Response | null> {
  if (!env.ASSETS) return null;
  return env.ASSETS.fetch(request);
}

/** 吐页面壳：不论请求哪个路径，body 都是同一份 index.html。取壳时不转发浏览器请求头，只声明 accept: text/html：转发 sec-fetch-dest: script 之类会让 Vite 按 JS 解析这份 HTML 并报 Failed to parse source。 */
async function serveShell(request: Request, env: Env): Promise<Response> {
  const shellUrl = new URL(SHELL_PATH, new URL(request.url));
  const shell = await fromAssets(
    new Request(shellUrl, { method: 'GET', headers: { accept: 'text/html' } }),
    env,
  );
  if (!shell || !shell.ok) {
    return new Response('页面壳缺失：先跑一次 npm run build', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const headers = new Headers(shell.headers);
  // 壳里带 hash 资源名，缓存住会让发版后旧页面指向已删除的 JS。
  headers.set('cache-control', 'no-cache');
  return new Response(shell.body, { status: 200, headers });
}

/** 24 字节随机数 base64url，恰好 32 字符，满足 BETTER_AUTH_SECRET 的长度要求。每次请求现生成、不落任何存储：页面是公网可见的，若把生成的串写进 KV，先访问的人就拿走了签名密钥。 */
function randomSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 部署漏配密钥时的提示页：有这一步，用户看到的才是「照着做就能修好」，而不是一片空白 500。
 *  只给可全选的串，不做复制按钮：剪贴板要走脚本，而站点 CSP 不允许内联脚本，为一个配置页再挂一个外部 JS 不划算。 */
function configProblemResponse(request: Request, message: string): Response {
  const url = new URL(request.url);
  if (isApiPath(url.pathname)) {
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  }
  const secret = randomSecret();
  // 样式与下面 databaseProblemResponse 的 body/main/code 三条保持一致；改配色时两处同步。
  // 不要抽公共模板、也不要引 CSS 变量：这两页必须在密钥缺失或 D1 不可用时仍能渲染。
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>站点尚未配置完成</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;font:16px/1.7 system-ui,sans-serif;padding:24px}
main{max-width:44rem}h1{font-size:1.35rem;margin:0 0 1rem}p{margin:0 0 1rem;color:#d4d4d8}
code{background:#1f1f22;padding:.15em .4em;border-radius:4px;font-size:.92em}
.secret code{display:block;margin:1rem 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;padding:.5em .7em;user-select:all}
.hint{font-size:.88rem;color:#a1a1aa}</style></head>
<body><main><h1>站点尚未配置完成</h1>
<p>${message}</p>
<p>下面这串 32 位随机串可以直接用，点一下选中再自己复制：</p>
<div class="secret"><code id="secret">${secret}</code></div>
<p class="hint">这串是本次打开页面时现生成的，刷新会换一组；它没有存到任何地方，只有你复制走的那一份算数。</p>
<p>把它填到 Cloudflare 控制台的 <strong>Workers → 设置 → 变量与机密</strong>，名称 <code>BETTER_AUTH_SECRET</code>，类型选「机密」。也可以用命令：<code>npx wrangler secret put BETTER_AUTH_SECRET</code>。</p>
<p>配置完成后刷新本页即可，不需要重新部署。</p>
</main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** 建表失败时的兜底页：库没准备好时整站都不可用，但用户该看到「服务暂时不可用」，而不是 Error 1101。
 *  这层兜底的意义不止本次这个 bug：任何建表失败（D1 临时故障、并发撞车两次、schema 写错）都不该变成 1101。 */
function databaseProblemResponse(request: Request, error: unknown): Response {
  console.error('[db] 初始化失败，已降级为 5xx', error);
  const url = new URL(request.url);
  if (isApiPath(url.pathname)) {
    return new Response(JSON.stringify({ ok: false, error: '数据库尚未就绪，请稍后重试' }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    });
  }
  // 样式与上面 configProblemResponse 的 body/main/code 三条保持一致；改配色时两处同步。
  // 不要抽公共模板、也不要引 CSS 变量：这两页必须在密钥缺失或 D1 不可用时仍能渲染。
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>服务暂时不可用</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0b0c;color:#f4f4f5;font:16px/1.7 system-ui,sans-serif;padding:24px}
main{max-width:44rem}h1{font-size:1.35rem;margin:0 0 1rem}p{margin:0 0 1rem;color:#d4d4d8}
code{background:#1f1f22;padding:.15em .4em;border-radius:4px;font-size:.92em}</style></head>
<body><main><h1>服务暂时不可用</h1>
<p>数据库还没准备好，正在自动重试。刷新页面或稍后再试即可，通常几秒内恢复。</p>
<p>如果一直这样，去 Cloudflare 控制台看 <code>miru</code> 的日志，搜 <code>[db]</code>。</p>
</main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

/** 分流本体：安全头由外层 fetch 统一加一次。 */
async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  // 缺密钥时整站都不可用（会话签名无从谈起），提前拦成可读提示，别让用户撞 500。
  // 静态资源放行：提示页是内联 HTML，但放行能让浏览器缓存与其它资源请求保持原样。
  const problem = secretProblem(env);
  if (problem && !looksLikeAsset(url.pathname)) return configProblemResponse(request, problem);

  // 真实产物已被 run_worker_first 排除，这里只兜「像资源但不存在」的路径。
  // 静态资源不需要库，放在建表之前，避免每个资源请求都触发一次初始化。
  if (looksLikeAsset(url.pathname)) {
    return (await fromAssets(request, env)) ?? notFound();
  }

  // 首次访问先把表建好：一键部署下 D1 是 deploy 那一刻才被自动创建的空库（见 db/bootstrap.ts）。
  // 页面要读会话、接口要读写业务表，两者都依赖表结构，所以放在分流之前、只跑一次。
  // 失败必须在这里接住：异常穿出 fetch 就是 Worker exception，用户只会看到 Error 1101、没有任何线索。
  try {
    await ensureSchema(env);
  } catch (error) {
    return databaseProblemResponse(request, error);
  }

  if (isApiPath(url.pathname)) {
    // 会话在接口层按需懒读（见 api/index.ts 的 loadUser），公开接口不必白打一次 D1。
    return apiApp.fetch(request, env, ctx);
  }

  const user = await readUser(env, request.headers);
  return loginGuard(request, user) ?? serveShell(request, env);
}

export default {
  async fetch(request, env, ctx) {
    // 跨站写请求在分流前就拦掉，不该碰到接口或页面。
    const blocked = rejectCrossSiteWrite(request);
    // 所有出口都要带安全头，只在最外层包一次。
    return applySecurityHeaders(blocked ?? (await route(request, env, ctx)));
  },
} satisfies ExportedHandler<Env>;
