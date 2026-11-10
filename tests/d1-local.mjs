/** 本地验收 harness：用 node:sqlite 实现的极简 D1 替身。不参与部署，线上跑的是 Cloudflare 真正的 D1。 */
import { DatabaseSync } from 'node:sqlite';

function normalize(params) {
  // 只需补 undefined → null（node:sqlite 拒绑 undefined）：布尔已经由 drizzle 的 integer 映射转成 1/0。
  return params.map((value) => (value === undefined ? null : value));
}

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }

  _prepared() {
    return this.db.prepare(this.sql);
  }

  /** drizzle 的 D1 驱动只无参调用 raw()，返回值是每行的值数组。 */
  async raw() {
    const rows = this._prepared().all(...normalize(this.params));
    return rows.map((row) => Object.values(row));
  }

  async all() {
    const rows = this._prepared().all(...normalize(this.params)).map((row) => ({ ...row }));
    return {
      success: true,
      results: rows,
      meta: { duration: 0, changes: 0, last_row_id: 0, rows_read: rows.length, rows_written: 0 },
    };
  }

  async run() {
    const info = this._prepared().run(...normalize(this.params));
    return {
      success: true,
      results: [],
      meta: {
        duration: 0,
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        rows_read: 0,
        rows_written: Number(info.changes),
      },
    };
  }
}

export class LocalD1 {
  constructor(sqlite) {
    this.sqlite = sqlite;
  }

  prepare(sql) {
    return new Statement(this.sqlite, sql);
  }

  /**
   * 对应真 D1 的 D1Database.exec。真实现（workerd src/cloudflare/internal/d1-api.ts）是
   * `query.trim().split('\n')` —— 按换行切成一行一条、逐条送出，所以一条跨多行的 CREATE TABLE
   * 会被拆成残句而报 incomplete input / syntax error。垫片必须照抄这个拆行行为，否则本地永远绿、
   * 线上必炸（2026-11-07 整站 1101 就是这么漏出去的）。
   */
  async exec(sql) {
    const lines = sql.trim().split('\n');
    let count = 0;
    for (const [i, line] of lines.entries()) {
      try {
        this.sqlite.exec(line);
      } catch (error) {
        throw new Error(`D1_EXEC_ERROR: Error in line ${i + 1}: ${line}: ${error.message}`, { cause: error });
      }
      count++;
    }
    return { count, duration: 0 };
  }
}

export function createDatabase(schema) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  if (schema) sqlite.exec(schema);
  return { sqlite, db: new LocalD1(sqlite) };
}
