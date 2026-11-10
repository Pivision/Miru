import { cn } from '@/lib/utils';

/** 被多处复用的样式串：描述站点统一外观，改一次全站生效，所以不与 cn() 之类纯工具混在 utils 里。 */

/** 清零全局焦点环：Radix 会在 Trigger / Content / Item 三层分别拿焦点，逐层覆盖是必须的。 */
export const FOCUS_RESET =
  'focus:outline-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0';

/** 触发胶囊忙碌态的视觉禁用。用 aria-disabled 而非原生 disabled：后者在弹层关闭时收不到 Radix 归还的焦点，键盘用户会丢位置。 */
export const BUSY_LOOK = 'aria-disabled:cursor-progress aria-disabled:opacity-60';

/** 海报网格列轨道：发现页与书库共用，首页用下方的 POSTER_GRID_COMPACT。 */
export const POSTER_GRID = 'grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6';

/** 书库网格：信息更密，lg/xl 比发现页各少一列，2xl 起对齐。 */
export const POSTER_GRID_WIDE = cn(POSTER_GRID, 'lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6');

/** 首页主栏「在看 / 待看」：间距更紧、最多 4 列，主栏 864px 仍保 4 列。 */
export const POSTER_GRID_COMPACT = 'grid grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 lg:grid-cols-4';

/** 胶囊/标签页的选中与未选中态：书库状态筛选与发现页星期标签共用。 */
export const PILL_ACTIVE = 'bg-primary text-primary-foreground shadow-xs';
export const PILL_IDLE = 'text-muted-foreground hover:bg-accent';

/** 表单控件基础外观（输入框与多行输入共用），尺寸由各自追加。 */
export const FIELD_BASE = cn(
  'flex w-full rounded-xl border border-input bg-background px-3.5 text-sm shadow-xs transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:cursor-not-allowed disabled:opacity-50',
);

/** 搜索框左侧放大镜：叠在输入框内，顶栏与发现页共用。 */
export const SEARCH_ICON =
  'pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground';

/** 区块眉题（全大写小字）：登录/注册页与首页日期共用。 */
export const EYEBROW = 'text-2xs font-medium uppercase tracking-[0.18em] text-primary';
