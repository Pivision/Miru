/* 数值展示格式：散在组件里各写一遍会漂（小数位、千分位、舍入方向都可能不一致）。 */

/** 千分位分组：手写而不用 toLocaleString，避免各浏览器 ICU 数据差异。 */
export function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 评分统一一位小数（10 分制，多一位是假精度）。 */
export function fmtScore(score: number): string {
  return score.toFixed(1);
}

/** 观看进度占比（整数百分比）。total 缺失时有值即 100%，避免「不知道总集数」把进度条画成空的。 */
export function progressPercent(value: number, total: number): number {
  if (total > 0) return Math.min(100, Math.round((value / total) * 100));
  return value > 0 ? 100 : 0;
}
