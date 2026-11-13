export type EntryStatus = 'watching' | 'planned' | 'completed' | 'on_hold' | 'dropped';

interface StatusMeta {
  label: string;
}

export const STATUS_META: Record<EntryStatus, StatusMeta> = {
  watching: { label: '在看' },
  planned: { label: '想看' },
  completed: { label: '看过' },
  on_hold: { label: '搁置' },
  dropped: { label: '抛弃' },
};

/** 顺序即筛选条顺序，由 STATUS_META 的键推出，加状态只改一处。 */
export const STATUS_ORDER = Object.keys(STATUS_META) as EntryStatus[];

export function isStatus(value: unknown): value is EntryStatus {
  // 必须用 Object.hasOwn：in 会命中原型链，'toString' 会被当成合法状态放行。
  return typeof value === 'string' && Object.hasOwn(STATUS_META, value);
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** 上游数据源标识，目前只接 Bangumi。 */
export type SourceId = 'bangumi';

/** 作品：上游条目的本地快照，与谁在追无关。 */
export interface Work {
  id: string;
  source: SourceId;
  /** 上游 id（存字符串以容纳非数字 id 的源） */
  sourceId: string;
  title: string;
  titleCn: string | null;
  poster: string | null;
  airDate: string | null;
  totalEps: number;
  /** platform（TV / 剧场版 / OVA…）：动画的 type 恒为 2，区分不了形态 */
  platform: string | null;
  updatedAt: number;
}

/** 记录 + 作品的读取视图：entries 只存追到什么程度，作品信息靠 join works 补。不复用 Work：两者 id 含义不同，继承会让 Entry['id'] 悄悄指向作品。 */
export interface Entry {
  /** entries.id，不是作品 id */
  id: string;
  sourceId: string;
  title: string;
  titleCn: string | null;
  poster: string | null;
  totalEps: number;
  platform: string | null;
  status: EntryStatus;
  rating: number | null;
  progress: number;
  startedAt: string | null;
  finishedAt: string | null;
  /** 记录最后改动时间，不是作品快照的更新时间 */
  updatedAt: number;
}

export interface Thought {
  id: string;
  entryId: string;
  content: string;
  createdAt: number;
  entryTitle?: string;
}

export interface SubjectImages {
  large?: string;
  common?: string;
  medium?: string;
  small?: string;
  grid?: string;
}

export interface Subject {
  id: number;
  name: string;
  nameCn: string;
  summary: string;
  images: SubjectImages;
  eps: number;
  date: string | null;
  platform: string;
  score: number;
  votes: number;
  /** 评分分布：长度固定 10，索引 0 对应 1 分；未返回时为空数组 */
  scoreBuckets: number[];
  /** 官方归类标签（TV / 日本 / 战斗…），可能重复 */
  metaTags: string[];
  infobox: { key: string; value: string }[];
}

export interface Episode {
  id: number;
  sort: number;
  ep: number | null;
  name: string;
  nameCn: string;
  airDate: string;
  /** 上游取不到分集时的占位格，只有编号；前端据此换文案，不显示假空标题。 */
  placeholder?: boolean;
}

export interface CalendarDay {
  weekday: number;
  items: Subject[];
}

export interface Stats {
  total: number;
  watching: number;
  completed: number;
  episodes: number;
  ratingCount: number;
  avgRating: number;
}

/** 书架排序方式，文案在 @shared/library-filters。 */
export type LibrarySort = 'updated' | 'rating' | 'title' | 'air_date' | 'created';

export interface LibraryFilters {
  status: EntryStatus | 'all';
  q: string;
  sort: LibrarySort;
  page: number;
}

/** 书架呈现方式：服务端不读，不放进 LibraryFilters。 */
export type LibraryView = 'grid' | 'list';

export interface LibraryData {
  entries: Entry[];
  counts: Record<EntryStatus | 'all', number>;
  total: number;
  page: number;
  pages: number;
}

export interface HomeData {
  /** 服务端算好的「现在」（秒）：客户端重算会跨小时/跨日边界，文案不一致。 */
  now: number;
  stats: Stats | null;
  /** Hero 海报与「上次看到」共用：在看里最后修改的那部。 */
  spotlight: Entry | null;
  recentThoughts: Thought[];
  airingToday: Subject[];
  /** 在看组：按最后修改时间倒序，最多 8 部。 */
  watching: Entry[];
  /** 想看组：按加入时间倒序，最多 8 部。 */
  planned: Entry[];
}

export interface DiscoverData {
  /** 服务端算好的「现在」（秒）：放送表默认选中日用，理由同 HomeData.now。 */
  now: number;
  q: string;
  results: Subject[] | null;
  total: number;
  page: number;
  pages: number;
  calendar: CalendarDay[];
  tracked: number[];
}

export interface SubjectData {
  /** 取不到上游数据时为 null，原因见 error。 */
  subject: Subject | null;
  entry: Entry | null;
  episodes: Episode[];
  thoughts: Thought[];
  error?: string;
}

export interface SettingsData {
  user: SessionUser;
  stats: Stats;
  /** 仅管理员有值，前端据此决定是否渲染站点管理分区 */
  admin: AdminPanelData | null;
}

export interface InviteUseView {
  id: string;
  usedAt: number;
  userName: string | null;
  userEmail: string | null;
}

export interface InviteCodeView {
  id: string;
  code: string;
  remaining: number;
  usedCount: number;
  /** 毫秒时间戳，null = 永不过期 */
  expiresAt: number | null;
  /** 毫秒时间戳，null = 未作废 */
  revokedAt: number | null;
  createdAt: number;
  /** 用尽 / 过期 / 作废任一为真 */
  dead: boolean;
  uses: InviteUseView[];
}

export interface SiteSettingsData {
  registrationOpen: boolean;
  requireInvite: boolean;
}

export interface AdminPanelData {
  site: SiteSettingsData;
  invites: InviteCodeView[];
}
