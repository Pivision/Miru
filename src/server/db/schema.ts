import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/* 认证：Better Auth 官方 SQLite schema，时间存毫秒、布尔存 0/1 */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_user_id_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('account_user_id_idx').on(t.userId)],
);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
});

/** 限流：登录等接口靠它计数 */
export const rateLimit = sqliteTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull().default(0),
  lastRequest: integer('last_request').notNull().default(0),
});

/** 作品：上游条目的本地快照，多人追同一部只存一行 */
export const works = sqliteTable(
  'works',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull().default('bangumi'),
    /** 上游 id 存文本：别的源未必是数字 */
    sourceId: text('source_id').notNull(),
    title: text('title').notNull(),
    titleCn: text('title_cn'),
    poster: text('poster'),
    airDate: text('air_date'),
    totalEps: integer('total_eps').notNull().default(0),
    /** platform：动画的 type 恒为 2，区分不了 TV / 剧场版 / OVA */
    platform: text('platform'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [uniqueIndex('works_source_idx').on(t.source, t.sourceId)],
);

/** 记录：谁把这部作品追到什么程度；作品信息全在 works，这里不冗余 */
export const entries = sqliteTable(
  'entries',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workId: text('work_id')
      .notNull()
      .references(() => works.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('planned'),
    rating: integer('rating'),
    progress: integer('progress').notNull().default(0),
    startedAt: text('started_at'),
    finishedAt: text('finished_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('entries_user_work_idx').on(t.userId, t.workId),
    index('entries_user_updated_idx').on(t.userId, t.updatedAt),
  ],
);

/** 想法只对整部作品，不绑某一集，所以无 episode 列 */
export const thoughts = sqliteTable(
  'thoughts',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id')
      .notNull()
      .references(() => entries.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('thoughts_entry_idx').on(t.entryId, t.createdAt)],
);

export const subjectCache = sqliteTable('subject_cache', {
  key: text('key').primaryKey(),
  payload: text('payload').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
});

/* 站点管理：site_settings 键值对存开关，加开关不用改表 */
export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** 邀请码：用完、过期或作废后不可再用 */
export const inviteCode = sqliteTable(
  'invite_code',
  {
    id: text('id').primaryKey(),
    code: text('code').notNull().unique(),
    /** 还能用几次；每注册一次减 1，归零失效 */
    remaining: integer('remaining').notNull().default(1),
    /** 已用总次数 */
    usedCount: integer('used_count').notNull().default(0),
    /** 过期时间（毫秒），null = 不过期 */
    expiresAt: integer('expires_at'),
    /** 作废时间（毫秒），null = 未作废 */
    revokedAt: integer('revoked_at'),
    /** 创建者；删号置空，码还有额度时别人要用 */
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: integer('created_at').notNull(),
  },
  (t) => [index('invite_code_created_idx').on(t.createdAt)],
);

/** 邀请码使用记录：谁在什么时候用哪个码注册的 */
export const inviteUse = sqliteTable(
  'invite_use',
  {
    id: text('id').primaryKey(),
    codeId: text('code_id')
      .notNull()
      .references(() => inviteCode.id, { onDelete: 'cascade' }),
    /** 用码的人；删号置空，记录是审计线索 */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    usedAt: integer('used_at').notNull(),
  },
  (t) => [index('invite_use_code_idx').on(t.codeId)],
);

export type WorkRow = typeof works.$inferSelect;
export type ThoughtRow = typeof thoughts.$inferSelect;
