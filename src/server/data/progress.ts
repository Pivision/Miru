import { isFinished, totalEpisodes } from '@shared/display';
import type { EntryStatus } from '@shared/types';

/** 纯计算：进度与状态的派生规则。不碰 db，放回 entries.ts 会让「读 SQL 的函数」和「纯算术」混在一起。 */

/** 总集数未知时的进度上界哨兵。advanceEntryProgress 的增量守卫用同一个数。 */
export const PROGRESS_CAP = 9999;

/** 进度钳制：总集数已知夹到 [0, total]，未知时只保证非负且不超上限。 */
export function clampProgress(progress: number, total: number | null): number {
  // 先归零 NaN / Infinity。路由层已挡越界，这里再钳一次兜的是并发写入与旧数据：别的请求可能刚把 totalEps 改小。
  if (!Number.isFinite(progress)) return 0;
  const max = totalEpisodes(total ?? 0, PROGRESS_CAP);
  return Math.max(0, Math.min(Math.round(progress), max));
}

/** 看满全集时自动置为看过。必须用钳制后的进度判断，否则与钳制结果对不上；「看满」口径复用 shared 的 isFinished。 */
export function autoCompletedStatus(
  progress: number,
  totalEps: number,
  current: EntryStatus,
): EntryStatus | undefined {
  return isFinished({ progress, totalEps }) && current !== 'completed' ? 'completed' : undefined;
}

/** 状态变更时自动补起止日期：只在状态真的变了且目标字段空着时补。只看最终值不够——status 没传时会从 existing 兜底，只改进度也会把用户清空的日期填回去。规则只补空不删值。 */
export function autoDates(
  statusChanged: boolean,
  status: EntryStatus,
  startedAt: string | null,
  finishedAt: string | null,
  now: number,
): { startedAt: string | null; finishedAt: string | null } {
  return {
    startedAt: statusChanged && status !== 'planned' && !startedAt ? String(now) : startedAt,
    finishedAt: statusChanged && status === 'completed' && !finishedAt ? String(now) : finishedAt,
  };
}

