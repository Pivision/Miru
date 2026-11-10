import { check, cookie, post, request, skip } from './harness.mjs';

/* ------------------------------------------------------------------ 记录 */
{
  const add = await post('/api/records', {
    cookie,
    json: { subject_id: 400602, status: 'watching', progress: 1, rating: 9 },
  });
  const entryId = add.data?.data?.entry?.id ?? null;
  // 只有上游真的不可达才允许跳过：502 也可能是服务端代码坏了（异常被折成 502），裸判会把真 bug 伪装成环境问题，所以看 upstream 标记。
  if (add.status === 502 && add.data?.upstream === true) {
    skip('records flow', '上游拉取条目失败（502 upstream），新建记录无从验证');
  } else {
    // 建记录带的 progress/rating 走 upsert 的插入分支，与下面「先调 /progress 再读」不是同一条路。
    const created = add.data?.data?.entry;
    check(
      'create record',
      add.status === 200 && Boolean(entryId) && created?.progress === 1 && created?.rating === 9,
      `status ${add.status} progress=${created?.progress} rating=${created?.rating}`,
    );

    const lib = await request('/api/library?status=watching', { cookie });
    const libTitles = (lib.data?.data?.entries ?? [])
      .map((entry) => `${entry.titleCn ?? ''}|${entry.title ?? ''}`)
      .join(' ');
    check('record appears in library API', lib.status === 200 && libTitles.includes('芙莉莲'), `titles=${libTitles}`);

    const progress = await post(`/api/records/${entryId}/progress`, { cookie, json: { value: 3 } });
    check('progress updates', progress.status === 200 && progress.data?.data?.entry?.progress === 3);

    // delta 与 value 是两条独立分支，只测一条会放过另一条。
    const bumped = await post(`/api/records/${entryId}/progress`, { cookie, json: { delta: 2 } });
    check(
      'progress delta adds to the current value',
      bumped.status === 200 && bumped.data?.data?.entry?.progress === 5,
      `status ${bumped.status} progress=${bumped.data?.data?.entry?.progress}`,
    );
    // 并发增量：服务端用 SQL 的 progress = progress + delta 累加。但 harness 的 D1 垫片是同步的、await 不让出宏任务，请求天然串行，这条只证明两次 +1 都落账，证不了原子性（改回读改写照样绿）。
    const [c1, c2] = await Promise.all([
      post(`/api/records/${entryId}/progress`, { cookie, json: { delta: 1 } }),
      post(`/api/records/${entryId}/progress`, { cookie, json: { delta: 1 } }),
    ]);
    const raced = await request('/api/library?status=watching', { cookie });
    const racedEntry = (raced.data?.data?.entries ?? []).find((entry) => entry.id === entryId);
    check(
      'two delta bumps both land',
      c1.status === 200 && c2.status === 200 && racedEntry?.progress === 7,
      `status ${c1.status}/${c2.status} progress=${racedEntry?.progress}`,
    );
    // 越界钳制与自动完成：value=999 夹到 28 并把状态推成 completed。测完立刻退回 watching，后面断言依赖它。
    const over = await post(`/api/records/${entryId}/progress`, { cookie, json: { value: 999 } });
    check(
      'progress clamps to total_eps and auto-completes',
      over.status === 200 && over.data?.data?.entry?.progress === 28 && over.data?.data?.entry?.status === 'completed',
      `status ${over.status} progress=${over.data?.data?.entry?.progress} entryStatus=${over.data?.data?.entry?.status}`,
    );
    const rewatch = await post('/api/records', {
      cookie,
      json: { subject_id: 400602, status: 'watching', progress: 5, finished_at: null },
    });
    check(
      'progress restored after the clamp probe',
      rewatch.status === 200 &&
        rewatch.data?.data?.entry?.status === 'watching' &&
        rewatch.data?.data?.entry?.finishedAt === null &&
        // 走 upsert 的更新分支：不钉 progress，丢掉也照样绿。
        rewatch.data?.data?.entry?.progress === 5,
      `status=${rewatch.data?.data?.entry?.status} finishedAt=${rewatch.data?.data?.entry?.finishedAt} progress=${rewatch.data?.data?.entry?.progress}`,
    );
    // 空 body 是「没说改成几集」而非「推进 0 集」，必须 400 且进度不动（曾被 Number(delta ?? 0) 兜成静默成功）。
    const empty = await post(`/api/records/${entryId}/progress`, { cookie, json: {} });
    check(
      'progress rejects an empty body instead of silently succeeding',
      empty.status === 400 && Boolean(empty.data?.error),
      `status ${empty.status} error=${empty.data?.error}`,
    );
    // Number(null) 是 0，不挡就静默清零。
    const nullValue = await post(`/api/records/${entryId}/progress`, { cookie, json: { value: null } });
    check(
      'progress rejects a null value instead of zeroing it',
      nullValue.status === 400 && Boolean(nullValue.data?.error),
      `status ${nullValue.status} error=${nullValue.data?.error}`,
    );
    // 负数与超上限必须 400，与 POST /records 同一条规则。超上限要用 PROGRESS_CAP 之上（10000）：999 合法，会被钳到 28。
    const negative = await post(`/api/records/${entryId}/progress`, { cookie, json: { value: -1 } });
    const tooBig = await post(`/api/records/${entryId}/progress`, { cookie, json: { value: 10000 } });
    check(
      'progress rejects out-of-range values on both write paths',
      negative.status === 400 && tooBig.status === 400,
      `negative=${negative.status} tooBig=${tooBig.status}`,
    );
    // 增量必须是整数：Math.round(±0.4) 得 0，以前写库回 200，一次误传变成假成功。
    const fractional = await post(`/api/records/${entryId}/progress`, { cookie, json: { delta: 0.4 } });
    check(
      'progress rejects a fractional delta instead of rounding it to zero',
      fractional.status === 400,
      `status ${fractional.status} progress=${fractional.data?.data?.entry?.progress}`,
    );
    // Number(null) 与 Number('') 都是 0，不挡就是 +0 的假写入。
    const nullDelta = await post(`/api/records/${entryId}/progress`, { cookie, json: { delta: null } });
    const emptyDelta = await post(`/api/records/${entryId}/progress`, { cookie, json: { delta: '' } });
    check(
      'progress rejects a null or empty delta instead of treating it as zero',
      nullDelta.status === 400 && emptyDelta.status === 400,
      `null=${nullDelta.status} empty=${emptyDelta.status}`,
    );
    // 建记录的 progress 也必须是整数：0.5 会被 Math.round 取整成 1 回 200，而同值走 /progress 是 400。
    const fractionalCreate = await post('/api/records', {
      cookie,
      json: { subject_id: 400602, progress: 5.5 },
    });
    check(
      'creating a record rejects a fractional progress instead of rounding it',
      fractionalCreate.status === 400,
      `status ${fractionalCreate.status}`,
    );
    // 回到基线（3 集 + 9 分）。
    await post(`/api/records/${entryId}/progress`, { cookie, json: { value: 3 } });
    await post('/api/records', { cookie, json: { subject_id: 400602, rating: 9 } });

    // 想法只到整部作品：响应里不该有 episode 字段。
    const thought = await post('/api/thoughts', {
      cookie,
      json: { entry_id: entryId, content: '第三集的分镜很漂亮。' },
    });
    check(
      'thought created',
      thought.status === 200 &&
        Boolean(thought.data?.data?.thought?.id) &&
        !('episode' in (thought.data?.data?.thought ?? {})),
    );

    const detail = await request('/api/subject/400602', { cookie });
    const detailData = detail.data?.data ?? null;
    check(
      'detail API returns the subject and the record',
      detail.status === 200 && Boolean(detailData?.subject) && detailData?.entry?.progress === 3,
      `status ${detail.status}`,
    );
    // 自动填充见 autoDates：状态不是 planned 时 startedAt 写「现在」，finishedAt 只有 completed 才填。旧的 'startedAt' in entry 恒真，连值为 null 也放过。
    check(
      'detail API auto-fills the start date for a watching record',
      /^\d{9,12}$/.test(String(detailData?.entry?.startedAt)) && detailData?.entry?.finishedAt === null,
      `startedAt=${detailData?.entry?.startedAt} finishedAt=${detailData?.entry?.finishedAt}`,
    );
    check(
      'detail API returns the thought',
      (detailData?.thoughts ?? []).some((item) => item.content === '第三集的分镜很漂亮。'),
    );
    // 只断言 Array.isArray 等于没断言：降级占位集也是数组。占位集 name 恒空、id 从 1 起，必须验真名。
    check(
      'detail API reports the episode count',
      detailData?.subject?.eps === 28 &&
        (detailData?.episodes ?? []).length > 0 &&
        typeof detailData?.episodes?.[0]?.id === 'number' &&
        typeof detailData?.episodes?.[0]?.sort === 'number' &&
        Boolean(detailData?.episodes?.[0]?.name),
      `eps=${detailData?.subject?.eps} episodes=${detailData?.episodes?.length} first=${detailData?.episodes?.[0]?.name}`,
    );

    const partial = await post('/api/records', { cookie, json: { subject_id: 400602, rating: 9 } });
    check(
      'partial update keeps entry',
      partial.status === 200 && partial.data?.data?.entry?.rating === 9 && partial.data?.data?.entry?.progress === 3,
    );

    // 日期落库是当天 00:00（东八区）的秒时间戳，按同一换算算期望值；只查键存在时值错成 null 也照样绿。
    const startSec = String(Date.UTC(2026, 9, 1) / 1000 - 8 * 3600);
    const endSec = String(Date.UTC(2026, 9, 20) / 1000 - 8 * 3600);
    const dated = await post('/api/records', {
      cookie,
      json: { subject_id: 400602, started_at: '2026-10-01', finished_at: '2026-10-20' },
    });
    check(
      'record stores the start and end dates',
      dated.data?.data?.entry?.startedAt === startSec && dated.data?.data?.entry?.finishedAt === endSec,
      `startedAt=${dated.data?.data?.entry?.startedAt} finishedAt=${dated.data?.data?.entry?.finishedAt}`,
    );

    const exportData = await request('/api/export', { cookie });
    // 只断条数会放过导出一堆空壳对象，所以再钉住几个能还原记录本体的字段。
    const exportedEntry = exportData.data?.entries?.[0];
    check(
      'export returns json',
      exportData.status === 200 &&
        Array.isArray(exportData.data?.entries) &&
        exportData.data.entries.length === 1 &&
        Boolean(exportedEntry?.id) &&
        exportedEntry?.sourceId === '400602' &&
        typeof exportedEntry?.title === 'string',
      `entries=${exportData.data?.entries?.length} status=${exportedEntry?.status} title=${exportedEntry?.title} sourceId=${exportedEntry?.sourceId}`,
    );
  }
}

/* 上游 4xx 该被当成什么 */
{
  // 上游 4xx 是「上游对这次请求的回答」，不是「上游不可达」。旧实现把非 404 的 4xx 折成 502 并计熔断，400 原样透传的分支永远走不到。
  const badRequest = await post('/api/records', { cookie, json: { subject_id: 400001, status: 'watching' } });
  check(
    'upstream 400 passes through instead of folding into 502',
    badRequest.status === 400 && badRequest.data?.upstream === true,
    `status=${badRequest.status} body=${JSON.stringify(badRequest.data)}`,
  );
}

