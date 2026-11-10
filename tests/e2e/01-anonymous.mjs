import { check, checkStatus, post, request, tryGet } from './harness.mjs';

/* 强制登录：匿名访问全部拦截。 */
{
  // 未登录访问业务页必须 303 到 /login?next=原地址。
  const home = await request('/');
  check(
    'anonymous / redirects to login',
    home.status === 303 && String(home.res.headers.get('location')).startsWith('/login?next='),
    `status ${home.status}`,
  );

  const login = await request('/login');
  // 纯 SPA：任何业务路径都吐同一份页面壳。
  check('GET /login serves the SPA shell', login.status === 200 && login.text.includes('<div id="root">'));
  check(
    'GET /login has no rendering placeholders',
    !/undefined|\[object Object\]|NaN/.test(login.text.replace(/<script[\s\S]*?<\/script>/g, '')),
  );
  check(
    'CSP allows same-origin scripts only',
    /script-src 'self'(;|$)/.test(String(login.res.headers.get('content-security-policy'))),
  );

  // 资源名带 hash，从壳里抠。
  const clientEntry = login.text.match(/<script[^>]*type="module"[^>]*src="(\/assets\/[^"]+\.js)"/)?.[1];
  const js = await tryGet(clientEntry);
  check('client bundle served', js.status === 200 && js.text.length > 10000, `entry=${clientEntry ?? '未找到'}`);
  check('client script is type=module', /<script[^>]*type="module"/.test(login.text));

  const cssHref = login.text.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/)?.[1];
  const css = await tryGet(cssHref);
  check('stylesheet served', css.status === 200 && css.text.includes('.bg-card'), `href=${cssHref ?? '未找到'}`);

  // 必须带 text/html，否则浏览器会当附件下载。
  check(
    'shell is served as text/html',
    String(login.res.headers.get('content-type')).startsWith('text/html'),
    `content-type ${login.res.headers.get('content-type')}`,
  );

  // 产物目录不是资源：应当 404，而不是被登录守卫折去 /login。
  checkStatus('asset directory is a 404', await request('/assets/'), 404);
  checkStatus('missing asset is a 404', await request('/assets/nope-12345.js'), 404);

  // 安全头只在 Worker 这一层加（security.ts 的 applySecurityHeaders），所以断言必须落在真过 Worker 的路径上。
  // 生产里 /assets/*、/theme-boot.js、/favicon.svg 被 wrangler.jsonc 的 run_worker_first 排除，
  // 由 Cloudflare 静态层直出，只带 public/_headers 里的 Cache-Control 与 nosniff、没有 CSP；
  // 页面壳则一定过 Worker，拿它验才有意义。
  const shell = await request('/');
  check(
    'the shell carries security headers',
    Boolean(shell.res.headers.get('content-security-policy')) && Boolean(shell.res.headers.get('x-content-type-options')),
    `csp ${shell.res.headers.get('content-security-policy')}`,
  );
  // 这条验的是 harness 的 ASSETS 桩（serve.mjs 自己造 etag 并回 304），不代表生产行为：
  // 生产上这个文件由静态层直出。留着是为了盯住桩本身，别当成生产契约。
  const staticAsset = await request('/theme-boot.js');
  check(
    'static asset can be revalidated with an etag (harness stub only)',
    staticAsset.status === 200 && Boolean(staticAsset.res.headers.get('etag')),
    `etag ${staticAsset.res.headers.get('etag')}`,
  );

  // Vite dev 的内部模块没有扩展名，曾被「带点即资源」漏掉而折去 /login，浏览器按 module script 跟进后 dev 直接白屏。后两条刻意不带扩展名，否则「带点即资源」会替前缀兜底。
  for (const devPath of ['/@vite/client', '/@react-refresh', '/@fs/C:/nope', '/@id/__x00__virtual']) {
    checkStatus(`${devPath} is not folded into the login guard`, await request(devPath), 404);
  }

  // 模块脚本被 303 后浏览器跟随时仍带 sec-fetch-dest: script。壳必须无条件按 HTML 取，否则 dev 下 Vite 会拿 HTML 当 JS 解析。
  const shellAsScript = await request('/login', { headers: { 'sec-fetch-dest': 'script', accept: '*/*' } });
  check(
    'shell is served as html even for script-semantics requests',
    shellAsScript.status === 200 && shellAsScript.text.includes('<div id="root">'),
    `status ${shellAsScript.status}`,
  );

  const register = await request('/register');
  check('GET /register serves the SPA shell', register.status === 200 && register.text.includes('<div id="root">'));

  const nope = await request('/definitely-not-a-page');
  check(
    'anonymous unknown route redirects to login',
    nope.status === 303 && String(nope.res.headers.get('location')).startsWith('/login'),
    `status ${nope.status}`,
  );

  checkStatus('anonymous /library redirects', await request('/library'), 303);
  checkStatus('anonymous /discover redirects', await request('/discover'), 303);
  checkStatus('anonymous /settings redirects', await request('/settings'), 303);
  checkStatus('anonymous /subject redirects', await request('/subject/400602'), 303);

  const guestApi = await post('/api/records', { json: { subject_id: 1 } });
  check('guest API is 401', guestApi.status === 401 && guestApi.data?.error === '请先登录');
}

