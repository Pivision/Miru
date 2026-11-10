/* 两个表结构检查脚本共用的 SQL 文本工具：都要从 CREATE TABLE 表体按列拆开，各抄一份迟早走偏。 */

/** 按顶层逗号切分表体。不能逐行切：列定义可折成多行，逐行会把 DEFAULT、REFERENCES 当成列名。引号内的逗号也不切。 */
export function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of body) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth += 1;
    } else if (ch === ')') {
      depth -= 1;
    } else if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** 去掉行注释：-- 注释不是列定义的一部分。 */
export function stripLineComments(text) {
  return text.replace(/--.*$/gm, '');
}

/** 从 schema.sql 切出「表名 + 表体」。IF NOT EXISTS 写可选，免得写法一变整张表漏掉（漏掉的表会在反向比对里报成「另一边多了一张表」）。用生成器而非导出带 g 的正则：共享实例的 lastIndex 会互相污染。 */
export function* tableBodies(text) {
  const tableRe = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)\s*\(([\s\S]*?)\)\s*;/g;
  for (const [, name, body] of text.matchAll(tableRe)) yield [name, body];
}

/** 表级约束关键字：这几类行没有「列名在首位」，解析列定义时必须跳过。两个脚本曾各写一份且清单不同，收在这里统一。 */
export const TABLE_CONSTRAINT_RE = /^(?:PRIMARY|UNIQUE|FOREIGN|CHECK|CONSTRAINT)\b/i;