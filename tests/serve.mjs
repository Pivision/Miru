/** 本地验收 harness：用 node:sqlite 顶替 D1，把打包好的 Worker 跑在 node 上，静态资源取自 dist/client/ 与 public/。产物在 dist/miru/，入口名带 hash 故从生成的 wrangler.json 的 main 读。产物是纯 ESM，不需要 workerd。入口解析失败一律抛错、不回退：静默回退会在「跑的是旧代码」的前提下全绿。 */
import { createServer } from 'node:http';
import {
  readFileSync,
  existsSync,
  statSync,
  readdirSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  copyFileSync,
} from 'node:fs';
import { dirname, extname, join, normalize, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { createDatabase } from './d1-local.mjs';
import { startFakeUpstream } from './fake-upstream.mjs';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.PORT || 8787);

// ENV 必须在 await import(workerEntry()) 之前快照：产物里 @cloudflare/unenv-preset 会把 globalThis.process 换成 Workers 桩，之后读 process.argv 永远是 [] 且不报错。
const ENV = { ...process.env };

function workerEntry() {
  const viteDir = join(root, 'dist/miru');
  const manifestPath = join(viteDir, 'wrangler.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      `[entry] 找不到 ${manifestPath}：先跑一次 \`npm run build\``,
    );
  }
  const generated = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!generated.main) {
    throw new Error(`[entry] ${manifestPath} 里没有 main 字段：@cloudflare/vite-plugin 的产物结构变了`);
  }
  const fromVite = join(viteDir, generated.main);
  if (!existsSync(fromVite)) {
    throw new Error(`[entry] ${manifestPath} 指向的 ${generated.main} 不存在：产物不完整，重跑 \`npm run build\``);
  }
  warnIfStale(fromVite);
  return fromVite;
}

/** 产物比源码旧时警告一句：改完源码忘了 build，e2e 全绿但绿的是上一次的代码。不抛错（本地故意用旧产物是合法的），但要说清验的是什么。 */
function warnIfStale(entryPath) {
  const builtAt = statSync(entryPath).mtimeMs;
  const stale = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, name.name);
      if (name.isDirectory()) walk(full);
      else if (statSync(full).mtimeMs > builtAt) stale.push(full);
    }
  };
  walk(join(root, 'src'));
  if (!stale.length) return;
  console.warn(
    `[entry] 警告：${stale.length} 个源码文件比产物新（如 ${relative(root, stale[0])}），` +
      '下面的结果可能跑的是旧代码，先重跑 build。',
  );
}

const entry = workerEntry();
// 接口地址写死在源码里（去掉镜像回落时一并定死，不再读环境变量），所以只能改写产物文本才能指向假上游。
// 改写失败就抛错：静默漏改会让 e2e 真的打官方，断网时整段 skip，而 skip 看起来和全绿几乎一样。
const OFFICIAL_API = 'https://api.bgm.tv';
const fakeUpstream = await startFakeUpstream(12_000);
const originalBundle = readFileSync(entry, 'utf8');
if (!originalBundle.includes(OFFICIAL_API)) {
  throw new Error(`[upstream] 产物里找不到 ${OFFICIAL_API}：http.ts 的 DEFAULT_BASE 改过名或被打包器改写，e2e 不能指望走假上游`);
}
// 不按内容直接加载 ESM：node 做不到，落盘到系统临时目录。必须放在带 assets 子目录的临时目录下并指到 patchedEntry：
// 产物是按 ./assets/xxx.js 相对引用的，摆在别处会让整条依赖链解析失败。
const patchedDir = join(tmpdir(), `miru-harness-${process.pid}`);
mkdirSync(join(patchedDir, 'assets'), { recursive: true });
const patchedEntry = join(patchedDir, 'worker.mjs');
const assetsDir = join(dirname(entry), 'assets');
if (existsSync(assetsDir)) {
  for (const name of readdirSync(assetsDir)) {
    copyFileSync(join(assetsDir, name), join(patchedDir, 'assets', name));
  }
}
writeFileSync(patchedEntry, originalBundle.replaceAll(OFFICIAL_API, fakeUpstream.base));
const mod = await import(pathToFileURL(patchedEntry).href);
// 不回退到 mod.default.default：静默回退会在「跑的是旧代码」的前提下全绿（记忆 #0039）。
if (typeof mod.default?.fetch !== 'function') {
  throw new Error(`[entry] 产物默认导出没有 fetch：@cloudflare/vite-plugin 的产物结构变了（${entry}）`);
}
const app = mod.default;
console.log(`[entry] ${entry}`);

// 刻意不预建表：线上是「空库 + Worker 首次访问懒建表」（见 src/server/db/bootstrap.ts），
// harness 起空库才能让 e2e 真的走到那条路径，否则建表逻辑永远不被执行。
const { db } = createDatabase();

// 未列到的走 octet-stream 兜底。.html 必须列上：落到 octet-stream 会让浏览器下载而不是渲染页面。
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

const publicDir = join(root, 'public');
// public/ 会被拷进 dist/client/，ASSETS 绑定也指向它，所以先查 dist/client 再查 public/（兜底 favicon 这类未进构建的文件）。
const assetDirs = [join(root, 'dist/client'), publicDir];

function findAsset(rel) {
  for (const dir of assetDirs) {
    const file = join(dir, rel);
    if (file.startsWith(dir) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

const assets = {
  async fetch(request) {
    const url = new URL(request.url);
    const rel = normalize(decodeURIComponent(url.pathname));
    const file = findAsset(rel);
    if (!file) {
      return null;
    }
    // dev 下 Vite 的 transform 中间件按 sec-fetch-dest: script 把 HTML 当 JS 解析并抛 Failed to parse source。harness 不模拟这层，serveShell 转发请求头的 bug 就验不出来（两种请求拿到同样的 HTML）。真实平台的 ASSETS 没有这层。
    if (extname(file) === '.html' && request.headers.get('sec-fetch-dest') === 'script') {
      return new Response('Failed to parse source for import analysis because the content contains invalid JS syntax.', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      });
    }
    const body = readFileSync(file);
    // 真实 ASSETS 会给 ETag，照着做：否则条件请求永远拿不到 304，验不出缓存复用。
    const stat = statSync(file);
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    if (request.headers.get('if-none-match') === etag) {
      return new Response(null, { status: 304, headers: { etag } });
    }
    return new Response(body, {
      headers: {
        'content-type': MIME[extname(file)] || 'application/octet-stream',
        'cache-control': 'no-cache',
        etag,
      },
    });
  },
};

// 静态产物由 Worker 自己分流（looksLikeAsset → ASSETS），所以必须注入 ASSETS 且不在 harness 外面抢先拦截，否则页面路径拿不到壳、serveShell 直接 500。
const env = {
  DB: db,
  ASSETS: assets,
  BGM_UA: 'Miru/0.1 (local harness)',
  // BGM_IMG_BASE 只在显式给出时注入：e2e 从不真的取图，改写与否不影响断言。
  BGM_IMG_BASE: ENV.BGM_IMG_BASE || undefined,
  BETTER_AUTH_SECRET: ENV.BETTER_AUTH_SECRET || 'local-harness-secret-please-change',
};

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolveBody(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const method = req.method || 'GET';
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
      else headers.set(key, value);
    }
    let body;
    if (method !== 'GET' && method !== 'HEAD') body = await readBody(req);
    const request = new Request(url, { method, headers, body, redirect: 'manual' });
    // 直接交给 Worker，才能把三条分流（/api/* → Hono；带扩展名 → ASSETS；其余 → 登录守卫 + 页面壳）一起验到。
    const response = await app.fetch(request, env);
    res.statusCode = response.status;
    const setCookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : [];
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') return;
      res.setHeader(key, value);
    });
    if (setCookies.length) res.setHeader('set-cookie', setCookies);
    const buffer = Buffer.from(await response.arrayBuffer());
    res.end(buffer);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end('Harness error: ' + (error && error.stack ? error.stack : String(error)));
  }
});

server.listen(port, '127.0.0.1', () => {
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Miru local harness → ${baseUrl}`);
  // 接口源码里写死了官方地址，产物文本被改写后才指向假上游；把这件事打出来，免得误以为 e2e 走的是真官方。
  console.log(`Bangumi 上游：本地假上游 ${fakeUpstream.base}（不联网，改写产物里的 ${OFFICIAL_API}）`);
  if (env.BGM_IMG_BASE) console.log(`Bangumi 图片：${env.BGM_IMG_BASE}`);
});

// 假上游随 harness 一起关，不留悬空监听；临时产物一并删掉（不删会在 %TEMP% 里按 pid 越积越多）。
process.on('SIGINT', () => {
  void fakeUpstream?.close().then(() => rmSync(patchedDir, { recursive: true, force: true }));
  process.exit(0);
});
