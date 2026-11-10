import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/** 项目根目录，用于解析 @/* 与 @shared/* 别名（别名同时定义在 tsconfig.json 的 paths）。 */
const ROOT = path.dirname(fileURLToPath(import.meta.url));

/** 构建链：Vite 打包前端，@cloudflare/vite-plugin 管 Worker 与本地 dev。纯 SPA 没有 SSR 构建，路由用 BrowserRouter 手写。前端入口是根目录 index.html，Worker 入口是 wrangler.jsonc 的 main，Tailwind 走 @tailwindcss/vite。 */
export default defineConfig({
  // @/* 是 shadcn 登记的别名，@shared/* 用于跨层引用（一眼看出跨了层，也免掉四层深路径）。tsconfig.json 的 paths 只管类型检查，真正打包靠这里，两条必须同时存在。
  // 用带 \/ 的正则且写成数组：对象键是前缀替换，@shared 必须排在 @ 前面才不被吃掉，那是靠顺序维持的隐式约束；正则写法让两条互不干扰。不能用 new URL 拼路径（Windows 盘符会出事）。
  resolve: {
    alias: [
      { find: /^@shared\//, replacement: path.resolve(ROOT, 'src/shared') + '/' },
      { find: /^@\//, replacement: path.resolve(ROOT, 'src/client') + '/' },
    ],
  },
  plugins: [tailwindcss(), cloudflare()],
});
