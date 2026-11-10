/** 东八区相对 UTC 的偏移（秒）：换算按它走，与宿主时区无关。 */
const CN_OFFSET = 8 * 60 * 60;

/** 挪到东八区，之后一律用 getUTC* 读，避免宿主时区参与。 */
function shifted(seconds: number): Date {
  return new Date((seconds + CN_OFFSET) * 1000);
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

/** 东八区拆解出的年月日时分：换算只留这一份。 */
export function cnDateParts(seconds: number): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const d = shifted(seconds);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

export function cnDate(seconds: number): string {
  const { year, month, day } = cnDateParts(seconds);
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function weekdayId(seconds: number): number {
  const day = shifted(seconds).getUTCDay();
  return day === 0 ? 7 : day;
}

/** 下标 0 对应周一；放模块级免得每次新建数组。调用方传的是 weekdayId() 的 1–7。 */
const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export function weekdayLabel(id: number): string {
  return WEEKDAY_LABELS[id - 1];
}

/** 两位补零：前后端共用这一份。 */
export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 秒时间戳位数口径：9 位是 2001 年之后，12 位上界挡住毫秒值。两端共用，改位数只改这里。 */
const SEC_STAMP = /^\d{9,12}$/;

export function isSecStamp(value: string): boolean {
  return SEC_STAMP.test(value);
}

/** 「2026-10-28」→ 那天 00:00（东八区）的秒时间戳。与 cnDate 互为逆运算。 */
export function cnDateToSec(value?: string | null): number | null {
  if (!value) return null;
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!matched) return null;
  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const utc = Date.UTC(year, month - 1, day);
  const seconds = Math.floor(utc / 1000) - CN_OFFSET;
  // Date.UTC 会把 2026-02-31 静默滚成 03-03，只能靠回验拦：转回去必须还是原来那串。
  if (cnDate(seconds) !== value.trim()) return null;
  return seconds;
}
