/** 分层护栏自检（纯 SPA 版，三条 import 边）：shared → 只能引 shared；client → client/shared（永远不许碰 server）；server → server/shared；worker → 装配层，可见 server 与 shared。client 没有任何豁免：一旦出现 ../../server/...，浏览器产物会试图打包 D1 与 Better Auth，构建炸掉或悄悄把密钥带进前端包。 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** 相对项目根、统一正斜杠的路径，报错与层判定都用它。 */
const rel = (file) => relative(root, file).split('\\').join('/');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(full)) out.push(full);
  }
  return out;
}

/** 层归属：src/worker.ts 是装配层，单独一档。 */
function layerOf(file) {
  const path = rel(file);
  if (path === 'src/worker.ts') return 'worker';
  if (path.startsWith('src/client/')) return 'client';
  if (path.startsWith('src/server/')) return 'server';
  if (path.startsWith('src/shared/')) return 'shared';
  return 'other';
}

/** 允许的边；client 那一行没有 server。 */
const ALLOWED = {
  client: new Set(['client', 'shared', 'other']),
  server: new Set(['server', 'shared', 'other']),
  shared: new Set(['shared', 'other']),
  worker: new Set(['worker', 'server', 'client', 'shared', 'other']),
};

/* 裸包名也要拦：SPEC 只枚举相对路径与别名，import { Hono } from 'hono' 完全绕过分层判定。被误判时往对应层加白名单，不要删规则。 */
const FORBIDDEN_BARE = {
  shared: new Set(['hono', 'drizzle-orm', 'better-auth', '@better-auth', 'cloudflare:workers']),
  client: new Set(['hono', 'drizzle-orm', 'better-auth', '@better-auth', 'cloudflare:workers']),
  server: new Set([
    'react',
    'react-dom',
    'react-router',
    '@tanstack/react-query',
    '@radix-ui',
    'sonner',
    'lucide-react',
    'class-variance-authority',
    'tailwind-merge',
    'clsx',
  ]),
};

/** @scope/pkg/sub → @scope/pkg。 */
function bareRoot(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** 按包名前缀比：@radix-ui 要拦住 @radix-ui/react-dialog，react 又不能把 react-dom 算进去，所以是「等于」或「以 名字/ 开头」。 */
function forbiddenBy(pkg, set) {
  if (!set) return null;
  for (const name of set) {
    if (pkg === name || pkg.startsWith(`${name}/`)) return name;
  }
  return null;
}

const sources = walk(join(root, 'src'));
const violations = [];
const counts = new Map();
let importCount = 0;
let bareCount = 0;

/* 要抓的 import 写法（漏一种等于护栏失效）：from / import() / require() / 副作用 import / CSS 的 @import。只抓相对路径与 @shared/*、@/* 别名，纯包名交给 BARE_RE。 */
const SPEC = '\\.{1,2}\\/[^\'"]*|@shared\\/[^\'"]*|@\\/[^\'"]*';
const IMPORT_RE = new RegExp(
  '(?<![\\w$])(?:from\\s+|import\\s*\\(\\s*|import\\s+|require\\s*\\(\\s*|@import\\s+(?:url\\(\\s*)?)([\'"])(' + SPEC + ')\\1',
  'g',
);

/** 任意 import 说明符：抓裸包名（上面那条只抓路径）。前缀 @ 的是 CSS at-rule，不算裸包 import。 */
const BARE_RE = /(?<![\w$@])(?:from\s+|import\s*\(\s*|import\s+|require\s*\(\s*)(['"])([^'"]+)\1/g;

/** Node 内置模块名：不带 node: 前缀也能引，不许进 client/shared。 */
const NODE_BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'events', 'fs',
  'http', 'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'querystring',
  'readline', 'stream', 'string_decoder', 'timers', 'tls', 'tty', 'url', 'util', 'v8', 'vm',
  'worker_threads', 'zlib',
]);

/* 把注释换成等长空白（保留换行、行号不变）再跑正则。不剥的话 // import x from './old' 会被当成真 import；也不能简单删 // 之后的内容，字符串里的 https:// 会被误当注释起点，所以走状态机。 */
function stripComments(text) {
  const out = text.split('');
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (ch === '/' && next === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) {
        if (text[i] !== '\n') out[i] = ' ';
        i += 1;
      }
      if (i < text.length) {
        out[i++] = ' ';
        out[i++] = ' ';
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) { i += 1; break; }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
  return out.join('');
}

for (const file of sources) {
  const from = layerOf(file);
  const where = rel(file);
  const text = stripComments(readFileSync(file, 'utf8'));
  for (const match of text.matchAll(IMPORT_RE)) {
    const spec = match[2];
    importCount += 1;
    // Vite 的 `?raw` / `?url` 后缀不是路径的一部分：剥掉再解析，否则 bundled 资源（如 schema.sql）会被当成解析失败。
    const specPath = spec.split('?')[0];
    let base;
    if (specPath.startsWith('@shared/')) base = resolve(root, 'src/shared', specPath.slice('@shared/'.length));
    else if (specPath.startsWith('@/')) base = resolve(root, 'src/client', specPath.slice('@/'.length));
    else base = resolve(dirname(file), specPath);
    const target = [base, base + '.tsx', base + '.ts', base + '.css', join(base, 'index.tsx'), join(base, 'index.ts')]
      .find((c) => existsSync(c) && statSync(c).isFile());
    if (!target) {
      violations.push(`${where} → ${spec}（解析不到目标文件）`);
      continue;
    }
    const to = layerOf(target);
    const key = `${from} → ${to}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (!ALLOWED[from]?.has(to)) {
      violations.push(`${where} → ${rel(target)}（${from} 不许直接引 ${to}）`);
    }
  }
  // 裸包名：只判黑名单，不解析 node_modules。
  for (const match of text.matchAll(BARE_RE)) {
    const spec = match[2];
    if (spec.startsWith('.') || spec.startsWith('@/') || spec.startsWith('@shared/')) continue;
    bareCount += 1;
    const builtin = spec.startsWith('node:') || NODE_BUILTINS.has(spec.split('/')[0]);
    if (builtin && from !== 'server' && from !== 'worker') {
      violations.push(`${where} → ${spec}（${from} 不许引 Node 内置模块）`);
      continue;
    }
    const pkg = bareRoot(spec);
    const banned = forbiddenBy(pkg, FORBIDDEN_BARE[from]);
    if (banned) {
      violations.push(`${where} → ${spec}（${from} 不许引 ${banned}）`);
    }
  }
}

/* 零命中护栏：扫描本身坏掉（根目录推导错、walk 空转、正则写坏）时会一条不报再打印「通过」，比违规更糟的假绿，所以三个计数各设下限。
 * 阈值是当前实测值的约八成（108 文件 / 459 import / 134 裸包），留出删文件的余量；离得太远等于没有护栏，增删源码文件后必须同步。 */
const MIN_FILES = 87;
const MIN_IMPORTS = 324;
const MIN_BARE = 40;
if (sources.length < MIN_FILES || importCount < MIN_IMPORTS || bareCount < MIN_BARE) {
  console.error('分层检查自身失效：扫描结果异常，不能据此判定通过。');
  console.error(`  扫到文件 ${sources.length} 个（期望 ≥ ${MIN_FILES}）`);
  console.error(`  抓到路径 import ${importCount} 条（期望 ≥ ${MIN_IMPORTS}）`);
  console.error(`  抓到裸包 import ${bareCount} 条（期望 ≥ ${MIN_BARE}）`);
  console.error(`  扫描根目录：${join(root, 'src')}`);
  process.exit(1);
}

console.log('分层依赖统计（只列跨层）：');
for (const [key, value] of [...counts].sort()) {
  const [from, to] = key.split(' → ');
  if (from !== to) console.log(`  ${key}: ${value}`);
}

if (violations.length) {
  console.error(`\n${violations.length} 处违规：`);
  for (const line of violations) console.error('  ' + line);
  process.exit(1);
}
console.log('\n分层检查通过：client 只引 client/shared，server 只引 server/shared。');
