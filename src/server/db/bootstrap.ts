/** 懒建表：Cloudflare 的「连仓库即部署」流程里，D1 是在部署那一刻才被自动创建的资源，build 阶段没有任何库可连，所以建表只能挪到 Worker 第一次真正访问数据时。schema.sql 全是 CREATE TABLE IF NOT EXISTS，重复执行是空操作，因此按 isolate 只跑一次、失败不缓存。 */
import schemaSql from './schema.sql?raw';
import type { Env } from '../env';

// 只按「本 isolate 有没有跑过」记，不比对 binding 对象身份：一个 isolate 只绑一个 DB，
// 而 env.DB 的包装对象是否跨请求同一引用没有文档保证，靠身份判断一旦不成立就会每请求重跑整份 schema。
let ready: Promise<void> | null = null;

/** 切成一条条单语句：D1 的 prepare 只接受一条，而 exec 会按换行拆（记忆 #0101）。 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let quote: string | null = null;
  let inLineComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === '\n') {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (quote) {
      current += ch;
      if (ch === quote) {
        // SQL 里连续两个同种引号是转义的引号本身，不算收尾。
        if (next === quote) {
          current += next;
          i++;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      i++;
      continue;
    }

    // 只认 -- 行注释（schema.sql 文件头已写明）。块注释里常带分号，按分号切会把注释和语句一起切碎，
    // 残句要等 D1 在线上执行时才报 incomplete input —— 在这里直接炸掉，比线上 1101 好排查得多。
    if (ch === '/' && next === '*') {
      throw new Error(`schema.sql 里出现了 /* 块注释，splitStatements 只支持 -- 行注释（位置 ${i}）`);
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }

    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      continue;
    }

    current += ch;
  }
  if (current.trim()) statements.push(current.trim());

  return statements;
}

/**
 * 不能用 db.exec(整份 schema)：真 D1 的 exec 实现是 `query.trim().split('\n')`，按换行切成一行一条再逐条送出，
 * 于是跨多行的 CREATE TABLE 会被拆成残句（incomplete input / syntax error），两次重试都失败就把错抛穿
 * route() —— 整站 1101。所以这里逐条 prepare + run，语句边界由 SQL 分号决定而不是换行。
 * 切分放在函数里而不是模块顶层：schema.sql 写了块注释时 splitStatements 会抛，模块顶层抛等于整个 Worker
 * 起不来（连 503 提示都给不出），放在函数里才能被 ensureSchema 的重试与 route 的兜底接住。
 */
async function runSchema(db: D1Database): Promise<void> {
  for (const statement of splitStatements(schemaSql)) {
    await db.prepare(statement).run();
  }
}

export function ensureSchema(env: Env): Promise<void> {
  if (ready) return ready;
  // 冷启动时页面与几个接口会同时打进来，多个 isolate 一起建同一批表时可能撞上「同一条 CREATE 正在别处执行」。
  // 语句本身是 IF NOT EXISTS，再跑一遍就过了，所以失败重试一次；两次都失败才把错抛出去，且两条错都记日志，
  // 免得排查方向被「并发撞车」带偏。
  const pending = (async () => {
    try {
      await runSchema(env.DB);
    } catch (first) {
      try {
        await runSchema(env.DB);
      } catch (second) {
        console.error('[db] 建表失败（已重试一次）', first, second);
        throw second;
      }
    }
  })().catch((error) => {
    // 失败不缓存：下一次请求会重跑一遍，成功即收敛。
    ready = null;
    throw error;
  });
  ready = pending;
  return pending;
}