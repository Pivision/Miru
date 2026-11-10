/** 浏览器端的时间展示格式。服务端从不下发这些字符串，放进 shared 会让「两端都能用」变假；换算仍来自 @shared/time。 */
import { cnDate, cnDateParts, isSecStamp, nowSec, pad } from '@shared/time';

const DAY = 86_400;

/** 毫秒时间戳转秒：站内展示统一走秒，转换点集中在这里。 */
export function msToSec(ms: number): number {
  return Math.floor(ms / 1000);
}

/** 东八区的「M 月 D 日」，首页标题用。 */
export function cnMonthDay(seconds: number): string {
  const { month, day } = cnDateParts(seconds);
  return `${month} 月 ${day} 日`;
}

export function fmtDay(seconds?: number | null): string {
  if (!seconds) return '—';
  const { year, month, day } = cnDateParts(seconds);
  return `${year}.${pad(month)}.${pad(day)}`;
}

export function fmtDateTime(seconds?: number | null): string {
  if (!seconds) return '—';
  const { hour, minute } = cnDateParts(seconds);
  return `${fmtDay(seconds)} ${pad(hour)}:${pad(minute)}`;
}

/** 接受 Bangumi 返回的「2026-10-28」这类日期串。 */
export function fmtDate(value?: string | null): string {
  if (!value) return '—';
  return value.replaceAll('-', '.');
}

export function timeAgo(seconds?: number | null): string {
  if (!seconds) return '—';
  const diff = nowSec() - seconds;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < DAY) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < DAY * 7) return `${Math.floor(diff / DAY)} 天前`;
  return fmtDay(seconds);
}

/** 秒时间戳转日期框要的 YYYY-MM-DD；空值/非数字/非正数给空串。不挡的话 Number(null) 与 Number('') 都是 0，会把「没填」渲染成 1970-01-01。 */
export function stampToDay(value: string | null): string {
  // 位数要卡死：只判 Number() > 0 时 '2.5' 会被当成 2 秒算出 1970-01-01。
  if (!value || !isSecStamp(value)) return '';
  return cnDate(Number(value));
}
