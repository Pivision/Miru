-- Miru · D1 schema
-- 真相是这份文件：Worker 首次访问时用 ?raw 内嵌执行它（src/server/db/bootstrap.ts），
-- npm run db:init:local / db:init:remote 只是把同一份 SQL 手动重跑一遍。
-- 全是 IF NOT EXISTS，重复执行是空操作；改结构对已有库无效，需要另写 ALTER。
-- 注释只写 -- 行注释：建表前语句按分号切分（src/server/db/bootstrap.ts 的 splitStatements），
-- 块注释 /* */ 里带分号会把语句切碎，所以遇到块注释会直接报错。
-- 刻意不写 PRAGMA foreign_keys = ON：D1 每个查询都包在隐式事务里，官方明确「cannot change this
-- during a query or migration」，而且 D1 本来就默认强制外键，这行在线上是无效指令。

-- ---------------------------------------------------------------- Better Auth
CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  email_verified INTEGER NOT NULL DEFAULT 0,
  image TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS session (
  id TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS session_user_id_idx ON session(user_id);

CREATE TABLE IF NOT EXISTS account (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  id_token TEXT,
  access_token_expires_at INTEGER,
  refresh_token_expires_at INTEGER,
  scope TEXT,
  password TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS account_user_id_idx ON account(user_id);

CREATE TABLE IF NOT EXISTS verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER,
  updated_at INTEGER
);

CREATE TABLE IF NOT EXISTS rate_limit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0,
  last_request INTEGER NOT NULL DEFAULT 0
);

-- -------------------------------------------------------------------- domain
-- 作品（上游条目的本地快照）：与「谁在追它」无关，多个人追同一部只存一行。
-- source + source_id 是上游身份：接第二个数据源（TMDB）时 id 空间互不干扰，
-- 不会再像只有 subject_id 那样把两个源的同一个数字撞成一条。
CREATE TABLE IF NOT EXISTS works (
  id TEXT PRIMARY KEY,
  -- 上游标识：目前只有 bangumi
  source TEXT NOT NULL DEFAULT 'bangumi',
  -- 上游 id，存成文本以容纳非数字 id
  source_id TEXT NOT NULL,
  -- 上游原名，缺失时回落到中文名，两者都空才用 id
  title TEXT NOT NULL,
  -- 中文名，前端优先展示它
  title_cn TEXT,
  poster TEXT,
  air_date TEXT,
  total_eps INTEGER NOT NULL DEFAULT 0,
  -- Bangumi 的 platform（TV / 剧场版 / OVA / Web…），type 字段对动画恒为 2 无法区分形态
  platform TEXT,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS works_source_idx ON works(source, source_id);

-- 记录（entries）：只放「谁把这部作品追到什么程度」，作品信息全在 works 里。
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'planned',
  rating INTEGER,
  progress INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_user_work_idx ON entries(user_id, work_id);
CREATE INDEX IF NOT EXISTS entries_user_updated_idx ON entries(user_id, updated_at);

-- 想法只对整部作品，不绑某一集，所以没有 episode 列。
CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS thoughts_entry_idx ON thoughts(entry_id, created_at);

CREATE TABLE IF NOT EXISTS subject_cache (
  key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);

-- ------------------------------------------------------------------ 站点管理
-- 键值对存站点开关（registration_open / require_invite），加新开关不用改表结构。
CREATE TABLE IF NOT EXISTS site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 邀请码：剩余次数用完、过期、手动作废后都不可再用。
CREATE TABLE IF NOT EXISTS invite_code (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  remaining INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  -- 过期时间（毫秒时间戳），NULL = 永不过期
  expires_at INTEGER,
  -- 手动作废时间（毫秒时间戳），NULL = 未作废
  revoked_at INTEGER,
  -- 创建者被删号时邀请码要留着（别人可能还在用），所以 SET NULL 而不是 CASCADE
  created_by TEXT REFERENCES user(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invite_code_created_idx ON invite_code(created_at);

-- 邀请码使用记录：谁在什么时候用哪个码注册的。
CREATE TABLE IF NOT EXISTS invite_use (
  id TEXT PRIMARY KEY,
  code_id TEXT NOT NULL REFERENCES invite_code(id) ON DELETE CASCADE,
  -- 用码的人删号了，记录也不该跟着消失，置空即可
  user_id TEXT REFERENCES user(id) ON DELETE SET NULL,
  used_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS invite_use_code_idx ON invite_use(code_id);
