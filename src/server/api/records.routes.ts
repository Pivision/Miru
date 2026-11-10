/** 条目与进度：加入片单、推进集数、删除。 */
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { BangumiError, getSubject } from '../sources/bangumi';
import { advanceEntryProgress, deleteEntry, getEntryBySubject, getEntryById, updateEntryFields, upsertEntry } from '../data/entries';
import { DEFAULT_SOURCE } from '../data/works';
import { PROGRESS_CAP, clampProgress } from '../data/progress';
import { isStatus, type EntryStatus } from '@shared/types';
import { bangumiFail, fail, ok, withUser } from './support';
import { positiveInt, readBody, toStamp } from './params';

export const recordsApi = new Hono<HonoEnv>();

recordsApi.post('/records', (c) =>
  withUser(c, async (user) => {
    const body = await readBody(c);
    const subjectId = positiveInt(body.subject_id);
    if (subjectId === null) return fail(c, '条目 ID 不合法', 400);
    const db = c.get('db');

    const status = 'status' in body ? String(body.status) : undefined;
    if (status && !isStatus(status)) return fail(c, '状态不对', 400);
    const entryStatus = status as EntryStatus | undefined;
    // 分工：路由层管形状与范围（未传、非有限数、越界直接 400），data 层管最终钳制（只有它知道总集数）。
    // progress 传 null/空串等同没传：兜成 0 会把进度静默清零。
    const progressRaw = 'progress' in body ? body.progress : undefined;
    const progress =
      progressRaw === undefined || progressRaw === null || progressRaw === ''
        ? undefined
        : Number(progressRaw);
    // 整数校验同时挡住 NaN/Infinity：同一个 400 不必分两条说。
    if (progress !== undefined && !Number.isInteger(progress)) {
      return fail(c, '进度参数必须是整数', 400);
    }
    // 与 /records/:id/progress 同口径：负数与超上限直接 400，不留给 clampProgress 兜。否则 999999 会被写成 9999，而 totalEps=0 时 isFinished 恒 false，前端卡在「已看 9999 / 0 集」。
    if (progress !== undefined && (progress < 0 || progress > PROGRESS_CAP)) {
      return fail(c, `进度需在 0 到 ${PROGRESS_CAP} 之间`, 400);
    }
    const ratingRaw = 'rating' in body ? String(body.rating ?? '').trim() : undefined;
    let rating: number | null | undefined;
    if (ratingRaw === undefined) rating = undefined;
    else if (ratingRaw === '') rating = null;
    else {
      const n = Number(ratingRaw);
      if (!Number.isInteger(n) || n < 1 || n > 10) return fail(c, '评分需为 1–10 的整数', 400);
      rating = n;
    }
    // 日期转当天 00:00 的秒时间戳：空串/null 清空，没传交给自动规则。
    const startedRaw = 'started_at' in body ? body.started_at : undefined;
    const finishedRaw = 'finished_at' in body ? body.finished_at : undefined;
    const startedAt = startedRaw === undefined ? undefined : toStamp(startedRaw);
    const finishedAt = finishedRaw === undefined ? undefined : toStamp(finishedRaw);
    if (startedRaw !== undefined && startedAt === undefined) return fail(c, '开始日期格式不对', 400);
    if (finishedRaw !== undefined && finishedAt === undefined) return fail(c, '结束日期格式不对', 400);

    try {
      const subject = await getSubject(c.env, db, subjectId);
      const entry = await upsertEntry(db, user.id, {
        subject,
        status: entryStatus,
        progress,
        rating,
        startedAt,
        finishedAt,
      });
      // 写完立刻读不到只可能是行刚被别处删掉，与下面 updateEntryFields 那条出口同口径。
      if (!entry) return fail(c, '记录已在别处被删除，请刷新后重试', 404);
      return ok(c, { entry });
    } catch (error) {
      // 上游取不到时改已有记录不该失败：作品快照库里已有，只有新建才非要上游。
      // 只兜上游异常：非 BangumiError 是数据库或代码出错，折成 502 会把「服务端坏了」报成「上游坏了」。
      if (!(error instanceof BangumiError)) {
        console.error('[records] 写入记录失败', error);
        throw error;
      }
      // 不折 null：读失败是真故障，吞掉会让下一步走新建分支撞唯一索引。
      const existing = await getEntryBySubject(db, user.id, subjectId, DEFAULT_SOURCE);
      if (!existing) return bangumiFail(c, error);
      const entry = await updateEntryFields(
        db,
        user.id,
        existing.id,
        {
          status: entryStatus,
          progress,
          rating,
          startedAt,
          finishedAt,
        },
        existing,
      );
      // updateEntryFields 写之前会重读一次：读不到说明这条刚被别处删掉，不是上游故障，别报成 502。
      if (!entry) return fail(c, '记录已在别处被删除，请刷新后重试', 404);
      return ok(c, { entry });
    }
  }),
);

recordsApi.post('/records/:id/progress', (c) =>
  withUser(c, async (user) => {
    const body = await readBody(c);
    const db = c.get('db');
    const id = c.req.param('id');
    // 钳制位置不同：value 走 clampProgress（要先读 totalEps），delta 走 SQL 里的 max(0, min(progress + delta, bound))（并发安全）。
    // 都不能写 Number(x) || 0：NaN 会被兜成 0，一次误传就把进度清零。
    if ('value' in body) {
      // Number(null) 是 0：不挡就会把误传当成「标记到第 0 集」。
      if (body.value === null || body.value === '') return fail(c, '进度参数不合法', 400);
      const value = Number(body.value);
      // 整数性必须先判：NaN 既不 <0 也不 >上限，放到读库后面会让它白读一次 D1。Math.round(0.4) 得 0 会照样写库回 200，所以小数也在这里挡。
      if (!Number.isInteger(value)) return fail(c, '进度参数必须是整数', 400);
      // 负数与超上限直接 400，不留给 clampProgress 兜。
      if (value < 0 || value > PROGRESS_CAP) return fail(c, `进度需在 0 到 ${PROGRESS_CAP} 之间`, 400);
      const current = await getEntryById(db, user.id, id);
      if (!current) return fail(c, '找不到这条记录', 404);
      const capped = clampProgress(value, current.totalEps);
      // 「看满即完成」交给 updateEntryFields 判，规则只有一份。
      const next = await updateEntryFields(db, user.id, current.id, { progress: capped }, current);
      // 与 POST /records 同口径：写完读不回来就是被别处删了，不能回 { entry: null } 让前端崩在 .progress 上。
      if (!next) return fail(c, '记录已在别处被删除，请刷新后重试', 404);
      return ok(c, { entry: next });
    }
    if ('delta' in body) {
      // Number(null) 与 Number('') 都是 0，不挡就是 +0 的假写入。
      if (body.delta === null || body.delta === '') return fail(c, '进度参数不合法', 400);
      const delta = Number(body.delta);
      // 必须整数：Math.round(±0.4) 得 0 会是假成功；isInteger 同时也挡住 NaN/Infinity。
      if (!Number.isInteger(delta)) return fail(c, '进度参数必须是整数', 400);
      // 增量走 SQL 的 progress + delta：读改写并发 +1 会互相覆盖成只前进 1 集。
      const next = await advanceEntryProgress(db, user.id, id, delta);
      if (!next) return fail(c, '找不到这条记录', 404);
      return ok(c, { entry: next });
    }
    // 两个键都没有 = 没说想改成几集。兜成 0 会把旧进度再写一遍并回 200，弹假成功。
    return fail(c, '缺少进度参数', 400);
  }),
);

recordsApi.post('/records/:id/delete', (c) =>
  withUser(c, async (user) => {
    // 0 行 = 不存在或不属于当前用户。照样回 ok 会让前端弹「已删除」但列表里还在。
    const changes = await deleteEntry(c.get('db'), user.id, c.req.param('id'));
    if (changes === 0) return fail(c, '找不到这条记录', 404);
    return ok(c, {});
  }),
);
