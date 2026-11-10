/**
 * 沙箱兼容预加载（本机跑 vite / wrangler 时用）：沙箱只允许执行白名单程序。
 * 1. Vite 的 windowsSafeRealPathSync 会同步 exec("net use") 探测网络驱动器，spawn 同步抛 EPERM 且没有 try/catch，构建在加载配置阶段就挂。
 * 2. wrangler 的 logger 会调 esbuild.formatMessagesSync 上色，esbuild 要起 service 子进程同样被拒，真正的报错被二次故障盖住。
 * 处理：exec 只在同步抛出时退化成「回调报错、无子进程」；两个格式化函数先按原样调用，出错才退回纯文本。能正常 spawn 的机器（CI）上两处都是直通。不能靠「先 spawn 一个试试」判断环境：本机允许 node、只拒 net.exe / esbuild.exe，探测会误判。
 * esbuild 是 wrangler 的依赖，构建链不用它，但这里要劫持它的格式化函数，所以在 devDependencies 显式声明：靠提升上来的间接依赖会静默失效。
 */
import cp from 'node:child_process';
import fs from 'node:fs';
import Module, { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const realExec = cp.exec;
const noopChild = () => {
  // 三个流不能给 null：调用方常写 child.stdout.on(...)，拿到 null 抛 TypeError 会把 spawn EPERM 顶掉。给一个永不产出也不挂断的最小可读流。
  const silent = () => new PassThrough().resume();
  const child = {
    stdin: new PassThrough(),
    stdout: silent(),
    stderr: silent(),
    on() {
      return child;
    },
    once() {
      return child;
    },
    unref() {
      return child;
    },
    kill() {
      return true;
    },
  };
  return child;
};

cp.exec = function exec(command, options, callback) {
  try {
    return realExec.call(this, command, options, callback);
  } catch (error) {
    const cb = typeof options === 'function' ? options : callback;
    if (typeof cb === 'function') queueMicrotask(() => cb(error, '', ''));
    return noopChild();
  }
};

// 让上面这行修改对 import { exec } from 'node:child_process' 也生效。
syncBuiltinESMExports();

/** esbuild service 起不来时退化成纯文本。必须返回数组：调用方会 join / 遍历 / 取 [0]，返回字符串会逐字符遍历或只取首字。 */
const plainFormat = (messages) =>
  messages.map((message) =>
    [message.text, ...(message.notes ?? []).map((note) => note.text)].filter(Boolean).join('\n'),
  );

/** 先按原样调用，只在沙箱里抛错时退回纯文本。 */
const wrapFormat = (original, fallback) => {
  return function patched(...args) {
    try {
      return original.apply(this, args);
    } catch {
      return fallback(...args);
    }
  };
};

/** 异步版：try/catch 抓不到 Promise reject，必须再挂 .catch。 */
const wrapFormatAsync = (original, fallback) => {
  return function patched(...args) {
    try {
      return Promise.resolve(original.apply(this, args)).catch(() => fallback(...args));
    } catch {
      return Promise.resolve(fallback(...args));
    }
  };
};

const realLoad = Module._load;
Module._load = function patchedLoad(request, ...rest) {
  const loaded = realLoad.call(this, request, ...rest);
  if (request !== 'esbuild') return loaded;
  return new Proxy(loaded, {
    get(target, key, receiver) {
      if (key === 'formatMessagesSync') return wrapFormat(target.formatMessagesSync, plainFormat);
      if (key === 'formatMessages') {
        return wrapFormatAsync(target.formatMessages, async (messages) => plainFormat(messages));
      }
      return Reflect.get(target, key, receiver);
    },
  });
};

/**
 * 3. workerd 子进程在系统临时目录下建 miniflare-email-store 被拒（kj/filesystem-disk-win32.c++:773: failed: CreateDirectory: #5），
 *    而同一路径 node 进程自己能建：父子进程权限上下文不同，所以「node 能写」不能推出「workerd 能写」。
 *    处理：所有平台一律把临时目录改到项目内 .tmp/（已在 .gitignore），不探测也不分平台——
 *    系统临时目录的可写性由运行环境决定，本地、沙箱、CI 各不相同，统一到仓库内最可预测。
 */
const ensureTempDir = () => {
  const fallback = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp');
  try {
    fs.mkdirSync(fallback, { recursive: true });
  } catch {
    return;
  }
  process.env.TMP = fallback;
  process.env.TEMP = fallback;
  process.env.TMPDIR = fallback;
};

ensureTempDir();
