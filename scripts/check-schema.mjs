/** 表结构对账：建库只跑 schema.sql、运行时读 schema.ts，只改一边不报错。比对列名、亲和性、NOT NULL/主键、索引名/列/UNIQUE（漏建唯一索引会改变 onConflictDoUpdate 的语义）。 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { is } from 'drizzle-orm';
import { splitTopLevel, stripLineComments, tableBodies, TABLE_CONSTRAINT_RE } from './lib/sql-text.mjs';

const root = resolve(import.meta.dirname, '..');

/** SQLite 类型亲和性（官方文档 §3.1）：按名字关键词归类。 */
function affinityOf(sqlType) {
  const type = sqlType.toUpperCase();
  if (type.includes('INT')) return 'integer';
  if (type.includes('CHAR') || type.includes('CLOB') || type.includes('TEXT')) return 'text';
  if (type.includes('BLOB') || type === '') return 'blob';
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB')) return 'real';
  return 'numeric';
}

/** 从 schema.sql 抽「表 → 列/索引」，只认 CREATE TABLE / CREATE INDEX。 */
function parseSqlSchema(text) {
  const tables = new Map();
  const indexes = new Map();
  for (const [name, body] of tableBodies(text)) {
    const columns = new Map();
    const tablePrimary = [];
    for (const definition of splitTopLevel(body)) {
      // 先去掉行注释，否则 -- xxx 里的词会被当成列名。
      const line = stripLineComments(definition).trim();
      if (!line) continue;
      // 表级主键 PRIMARY KEY(a, b)：标记回填到对应列。
      const tableKey = /^PRIMARY\s+KEY\s*\(([^)]*)\)/i.exec(line);
      if (tableKey) {
        for (const column of tableKey[1].split(',')) tablePrimary.push(unquote(column.trim()));
        continue;
      }
      // 其余表级约束（UNIQUE/FOREIGN KEY/CHECK）不是列定义。
      if (TABLE_CONSTRAINT_RE.test(line)) continue;
      const parsed = parseSqlColumn(line);
      if (parsed) columns.set(parsed.name, parsed);
    }
    for (const column of tablePrimary) {
      const target = columns.get(column);
      if (target) target.primary = true;
    }
    tables.set(name, columns);
  }

  const indexRe = /CREATE\s+(UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+(\w+)\s+ON\s+(\w+)\s*\(([^)]*)\)/gi;
  for (const [, unique, name, table, columns] of text.matchAll(indexRe)) {
    indexes.set(name, {
      table,
      columns: columns.split(',').map((column) => unquote(column.trim())),
      unique: Boolean(unique),
    });
  }
  return { tables, indexes };
}

function unquote(value) {
  return value.replace(/^[`"]|[`"]$/g, '');
}

function parseSqlColumn(line) {
  const head = /^(?:`([^`]+)`|"([^"]+)"|([A-Za-z_]\w*))(?:\s+([\s\S]*))?$/.exec(line);
  if (!head) return null;
  const name = head[1] ?? head[2] ?? head[3];
  const rest = head[4] ?? '';
  const primary = /\bPRIMARY\s+KEY\b/i.test(rest);
  const type = /^([A-Za-z]+(?:\s*\([^)]*\))?)/.exec(rest)?.[1] ?? '';
  return {
    name,
    affinity: affinityOf(type),
    // 主键列隐含 NOT NULL，drizzle 侧由 primaryKey() 表达，下面跳过比对。
    notNull: primary || /\bNOT\s+NULL\b/i.test(rest),
    primary,
    defaultValue: sqlDefaultOf(rest),
  };
}

/** DEFAULT → 可比较字面量。表达式型（(unixepoch() * 1000)、CURRENT_TIMESTAMP）两边写法必然不同，统一记 'expression' 跳过。 */
function sqlDefaultOf(rest) {
  const match = /\bDEFAULT\s+('(?:[^']|'')*'|"(?:[^"]|"")*"|\([^)]*\)|[^\s,]+)/i.exec(rest);
  if (!match) return undefined;
  const raw = match[1];
  if (raw.startsWith('(')) return 'expression';
  if (/^CURRENT_(TIME|DATE|TIMESTAMP)$/i.test(raw)) return 'expression';
  if (raw.startsWith("'") || raw.startsWith('"')) return raw.slice(1, -1).replace(/''/g, "'").replace(/""/g, '"');
  return raw;
}

/** drizzle 列类型 → SQLite 亲和性，认不出按 dataType 兜底。 */
const DRIZZLE_AFFINITY = {
  SQLiteText: 'text',
  SQLiteTextJson: 'text',
  SQLiteInteger: 'integer',
  // drizzle 的 DDL 里 boolean/timestamp 都是 INTEGER：写成 BOOLEAN 或 DATETIME 会落到 NUMERIC 亲和性。
  SQLiteBoolean: 'integer',
  SQLiteTimestamp: 'integer',
  SQLiteBigInt: 'integer',
  SQLiteReal: 'real',
  SQLiteBlob: 'blob',
  SQLiteNumeric: 'numeric',
};

const DATA_TYPE_AFFINITY = {
  string: 'text',
  number: 'numeric',
  boolean: 'integer',
  bigint: 'integer',
  buffer: 'blob',
  date: 'integer',
  json: 'text',
};

/** drizzle 默认值 → 与 sqlDefaultOf 同口径的文本。布尔列是 0/1，表达式记 'expression'。 */
function drizzleDefaultOf(column) {
  if (!column.hasDefault || column.default === undefined) return undefined;
  const value = column.default;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number' || typeof value === 'string') return String(value);
  return 'expression';
}

async function parseDrizzleSchema() {  // Windows 上绝对路径必须转成 file:// URL，否则 import() 把 `e:` 当协议。
  const mod = await import(pathToFileURL(resolve(root, 'src/server/db/schema.ts')).href);
  const tables = new Map();
  const indexes = new Map();
  for (const value of Object.values(mod)) {
    // 只认 sqliteTable 实例：枚举与辅助函数在这里被 is() 判掉，不用靠 getTableConfig 抛错来分辨。
    if (!is(value, SQLiteTable)) continue;
    const config = getTableConfig(value);
    const columns = new Map();
    for (const column of config.columns) {
      columns.set(column.name, {
        affinity: DRIZZLE_AFFINITY[column.columnType] ?? DATA_TYPE_AFFINITY[column.dataType] ?? 'unknown',
        notNull: column.notNull,
        primary: column.primary,
        defaultValue: drizzleDefaultOf(column),
      });
    }
    tables.set(config.name, columns);
    for (const index of config.indexes) {
      indexes.set(index.config.name, {
        table: config.name,
        columns: index.config.columns.map((column) => column.name),
        unique: Boolean(index.config.unique),
      });
    }
  }
  return { tables, indexes };
}

const sql = parseSqlSchema(readFileSync(resolve(root, 'src/server/db/schema.sql'), 'utf8'));
const ts = await parseDrizzleSchema();

const problems = [];
// 比对到的 DEFAULT 条数：纳入零命中护栏，防解析器失效。
let defaultsCompared = 0;

// 按表名并集遍历：缺表与缺列在同一次循环里报出。
for (const name of new Set([...sql.tables.keys(), ...ts.tables.keys()])) {
  const sqlColumns = sql.tables.get(name);
  const tsColumns = ts.tables.get(name);
  if (!sqlColumns) {
    problems.push(`表 ${name}：schema.ts 有，schema.sql 没有`);
    continue;
  }
  if (!tsColumns) {
    problems.push(`表 ${name}：schema.sql 有，schema.ts 没有`);
    continue;
  }
  for (const [column, fromSql] of sqlColumns) {
    const fromTs = tsColumns.get(column);
    if (!fromTs) {
      problems.push(`表 ${name}：列 ${column} 只在 schema.sql 里`);
      continue;
    }
    if (fromSql.affinity !== fromTs.affinity) {
      problems.push(`表 ${name}.${column}：类型不一致（schema.sql ${fromSql.affinity} / schema.ts ${fromTs.affinity}）`);
    }
    // 主键列的可空性由主键表达，不比对。
    if (!fromSql.primary && fromSql.notNull !== fromTs.notNull) {
      problems.push(
        `表 ${name}.${column}：NOT NULL 不一致（schema.sql ${fromSql.notNull ? '有' : '无'} / schema.ts ${fromTs.notNull ? '有' : '无'}）`,
      );
    }
    if (fromSql.primary !== fromTs.primary) {
      problems.push(`表 ${name}.${column}：主键标记不一致`);
    }
    // DEFAULT 最容易只改一边。只有两侧都是表达式才跳过；一侧字面量一侧表达式同样算漂移。
    const bothExpression = fromSql.defaultValue === 'expression' && fromTs.defaultValue === 'expression';
    if (!bothExpression && fromSql.defaultValue !== fromTs.defaultValue) {
      problems.push(
        `表 ${name}.${column}：DEFAULT 不一致（schema.sql ${fromSql.defaultValue ?? '无'} / schema.ts ${fromTs.defaultValue ?? '无'}）`,
      );
    }
    if (fromSql.defaultValue !== undefined || fromTs.defaultValue !== undefined) defaultsCompared += 1;
  }
  for (const column of tsColumns.keys()) {
    if (!sqlColumns.has(column)) problems.push(`表 ${name}：列 ${column} 只在 schema.ts 里`);
  }
}

// 索引：漏建唯一索引不报错，但会让 onConflictDoUpdate 的语义与建表脚本不一致。
for (const name of new Set([...sql.indexes.keys(), ...ts.indexes.keys()])) {
  const fromSql = sql.indexes.get(name);
  const fromTs = ts.indexes.get(name);
  if (!fromSql) {
    problems.push(`索引 ${name}：schema.ts 有，schema.sql 没有`);
    continue;
  }
  if (!fromTs) {
    problems.push(`索引 ${name}：schema.sql 有，schema.ts 没有`);
    continue;
  }
  if (fromSql.table !== fromTs.table) {
    problems.push(`索引 ${name}：所在表不一致（schema.sql ${fromSql.table} / schema.ts ${fromTs.table}）`);
  }
  if (fromSql.unique !== fromTs.unique) {
    problems.push(`索引 ${name}：UNIQUE 标记不一致（schema.sql ${fromSql.unique ? '是' : '否'} / schema.ts ${fromTs.unique ? '是' : '否'}）`);
  }
  if (fromSql.columns.join(',') !== fromTs.columns.join(',')) {
    problems.push(`索引 ${name}：列顺序不一致（schema.sql ${fromSql.columns.join(',')} / schema.ts ${fromTs.columns.join(',')}）`);
  }
}

/* 零命中护栏：解析写坏（正则不匹配、表数变 0）时会一条都不报然后打印「通过」，那是更糟的假绿。
 * 阈值取「不低于当前实际值」（12 表 / 8 索引 / 11 个默认值列）而非目标值：真删了表就一起改小，但不能为变绿随手调低，那等于拆掉护栏。 */
const MIN_TABLES = 12;
const MIN_INDEXES = 8;
const MIN_DEFAULTS = 11;
if (
  sql.tables.size < MIN_TABLES ||
  ts.tables.size < MIN_TABLES ||
  sql.indexes.size < MIN_INDEXES ||
  // 索引两侧都校验：只查一侧时，schema.ts 解析器坏掉会表现为「8 条索引 schema.ts 里没有」，把解析失效误报成真不一致。
  ts.indexes.size < MIN_INDEXES ||
  defaultsCompared < MIN_DEFAULTS
) {
  console.error('表结构对账自身失效：解析结果异常，不能据此判定通过。');
  console.error(`  schema.sql 解析到 ${sql.tables.size} 张表 / ${sql.indexes.size} 个索引（期望 ≥ ${MIN_TABLES} / ${MIN_INDEXES}）`);
  console.error(`  schema.ts  解析到 ${ts.tables.size} 张表 / ${ts.indexes.size} 个索引`);
  console.error(`  DEFAULT 比对到 ${defaultsCompared} 列（期望 ≥ ${MIN_DEFAULTS}）`);
  process.exit(1);
}

if (problems.length) {
  console.error(`\n表结构不一致，共 ${problems.length} 处：`);
  for (const line of problems) console.error('  ' + line);
  console.error('\nschema.sql 是建库的唯一真相，schema.ts 必须与它逐列、逐索引一致。');
  process.exit(1);
}

console.log(
  `表结构对账通过：${sql.tables.size} 张表、${sql.indexes.size} 个索引、${defaultsCompared} 列默认值，列类型/可空/主键/DEFAULT 与索引逐一一致。`,
);
