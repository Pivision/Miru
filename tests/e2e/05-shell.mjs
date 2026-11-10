import { check, checkStatus, cookie, getShell, post, request, skip } from './harness.mjs';

/* ---------------------------------------------------------- 页面壳（共用） */
// 几段检查的是同一份 HTML，取一次。
const shellPage = await getShell(cookie);

/* ------------------------------------------------------------------ 主题 */
{
  // 主题引导脚本是外部文件，首帧前同步执行：不是 module 也不带 defer，CSP 只需 'self'。
  check('authed home serves the SPA shell', shellPage.status === 200 && shellPage.text.includes('<div id="root">'));
  check('shell references the external theme boot script', /<script[^>]*src="\/theme-boot\.js"/.test(shellPage.text));
  const boot = await request('/theme-boot.js');
  check('theme boot script is served', boot.status === 200 && boot.text.includes('miru-theme'));
  check('theme boot script writes colorScheme', boot.text.includes('colorScheme'));
  check('theme boot script is not inlined', !shellPage.text.includes('miru-theme'));
}

/* ---------------------------------------------------- 读接口与删除路径补网 */
{
  // 删除类接口会删错行或静默 500，只断言 200 抓不到，必须复查数据。
  // 本段依赖记录段建出的那一条，写成显式前置条件，否则报错会指向书库过滤而不是真因。
  const preflight = await request('/api/library', { cookie });
  const libraryTotal = preflight.data?.data?.total ?? 0;
  const searched = await request('/api/discover?q=%E8%8A%99%E8%8E%89%E8%8E%B2', { cookie });
  if (libraryTotal === 0) {
    skip('read API coverage', '书库为空：记录段没建出记录，本段断言无从执行');
  } else if (searched.status === 502 && searched.data?.upstream === true) {
    skip('read API coverage', '上游搜索不可用（502 upstream），本段断言无从执行');
  } else {
    // 有 q 走搜索，无 q 走放送表。
    check(
      'discover search returns results',
      searched.status === 200 && Array.isArray(searched.data?.data?.results) && searched.data.data.results.length > 0,
      `status ${searched.status} total ${searched.data?.data?.total}`,
    );
    // 搜索路径不该顺带算放送表：用不上，白等上游。
    check(
      'discover search skips the calendar fetch',
      (searched.data?.data?.calendar ?? []).length === 0,
      `days ${searched.data?.data?.calendar?.length}`,
    );
    const calendar = await request('/api/discover?weekday=3', { cookie });
    check(
      'discover calendar returns seven days',
      calendar.status === 200 &&
        calendar.data?.data?.results === null &&
        (calendar.data?.data?.calendar ?? []).length === 7,
      `status ${calendar.status} days ${calendar.data?.data?.calendar?.length}`,
    );

    // 书库：q 命中、越界与非整数页码都不能 500。
    const byQuery = await request('/api/library?q=%E8%8A%99%E8%8E%89%E8%8E%B2', { cookie });
    check(
      'library search filters entries',
      byQuery.status === 200 && (byQuery.data?.data?.entries ?? []).length === 1,
      `status ${byQuery.status} entries ${byQuery.data?.data?.entries?.length}`,
    );
    const sorted = await request('/api/library?sort=title', { cookie });
    check(
      'library accepts a sort key',
      sorted.status === 200 && (sorted.data?.data?.entries ?? []).length === 1,
      `status ${sorted.status}`,
    );
    // sort key 要有两条记录、两种排序首条相反才有信息量（见下面那段），只有一条时断言必然空转。
    const farPage = await request('/api/library?page=99999', { cookie });
    check(
      'library clamps a far page instead of failing',
      farPage.status === 200 && farPage.data?.data?.page === farPage.data?.data?.pages && (farPage.data?.data?.entries ?? []).length > 0,
      `status ${farPage.status} page ${farPage.data?.data?.page}/${farPage.data?.data?.pages}`,
    );
    // 不钳制时 Infinity 会流进 offset，变成 D1 绑定异常。
    const badPage = await request('/api/library?page=Infinity', { cookie });
    check(
      'library falls back to page 1 for a non-integer page',
      badPage.status === 200 && badPage.data?.data?.page === 1,
      `status ${badPage.status} page ${badPage.data?.data?.page}`,
    );

    checkStatus('subject rejects a non-numeric id', await request('/api/subject/abc', { cookie }), 404);

    // 改名：字段名对不上时整条链路静默失效。
    const renamed = await post('/api/settings/profile', { cookie, json: { name: '改名后的我' } });
    const settingsAfter = await request('/api/settings', { cookie });
    check(
      'profile rename persists',
      renamed.status === 200 && settingsAfter.data?.data?.user?.name === '改名后的我',
      `status ${renamed.status} name ${settingsAfter.data?.data?.user?.name}`,
    );

    // 排序真序：只有一条记录时任何 sort 都「看起来对」。白箱评分低、书名靠前，两条 key 首条相反才分得清方向。
    const extraEntry = await post('/api/records', { cookie, json: { subject_id: 400603, rating: 3, status: 'planned' } });
    const sortByRating = await request('/api/library?sort=rating', { cookie });
    const sortByTitle = await request('/api/library?sort=title', { cookie });
    // Entry 里上游条目 id 是 sourceId（字符串），不是 subjectId。
    const firstId = (res) => res.data?.data?.entries?.[0]?.sourceId;
    check(
      'library sorting actually reorders rows',
      extraEntry.status === 200 && firstId(sortByRating) === '400602' && firstId(sortByTitle) === '400603',
      `rating first=${firstId(sortByRating)} title first=${firstId(sortByTitle)}`,
    );
    // 写错的 key 必须静默回落成默认排序。
    const sortByUpdated = await request('/api/library?sort=updated', { cookie });
    const sortByUnknown = await request('/api/library?sort=not-a-key', { cookie });
    check(
      'library falls back to the default sort for an unknown key',
      Boolean(firstId(sortByUpdated)) && firstId(sortByUnknown) === firstId(sortByUpdated),
      `unknown first=${firstId(sortByUnknown)} updated first=${firstId(sortByUpdated)}`,
    );
    // 计数必须与筛选无关：带 status 统计时分组只剩一行，「全部」也只等于那一行；此时 total 是 1，counts 得是全量 2。
    const counted = await request('/api/library?status=watching', { cookie });
    const counts = counted.data?.data?.counts;
    check(
      'library counts ignore the active status filter',
      counted.status === 200 &&
        counted.data?.data?.total === 1 &&
        counts?.all === 2 &&
        counts?.watching === 1 &&
        counts?.planned === 1 &&
        counts?.completed === 0,
      `total=${counted.data?.data?.total} counts=${JSON.stringify(counts)}`,
    );
    // 后面几段假定书库只剩芙莉莲一条，验完撤掉白箱；这条留作删除用例的标靶。
    await post(`/api/records/${extraEntry.data?.data?.entry?.id}/delete`, { cookie, json: {} });
    const remaining = (await request('/api/library', { cookie })).data?.data?.entries ?? [];
    check('second record is cleaned up again', remaining.length === 1, `entries=${remaining.length}`);
    const entryForDelete = remaining[0];
    // 后面的删除断言都以这条为前提。
    check('library returns an entry to delete', Boolean(entryForDelete?.id), `entries=${remaining.length}`);
    const tempThought = await post('/api/thoughts', {
      cookie,
      json: { entry_id: entryForDelete?.id, content: '这条待删。' },
    });
    const thoughtId = tempThought.data?.data?.thought?.id;
    // 先断言它真在库里：只断言「删除后找不到」时，想法根本没建成（id 为 undefined）也一样绿。
    const detailBefore = await request('/api/subject/400602', { cookie });
    const liveThought = (detailBefore.data?.data?.thoughts ?? []).find((item) => item.id === thoughtId);
    check(
      'thought is visible before deleting it',
      typeof thoughtId === 'string' && thoughtId.length > 0 && liveThought?.content === '这条待删。',
      `status ${tempThought.status} thoughtId=${thoughtId} content=${liveThought?.content}`,
    );
    const removedThought = await post(`/api/thoughts/${thoughtId}/delete`, { cookie, json: {} });
    const detailAfter = await request('/api/subject/400602', { cookie });
    check(
      'deleting a thought removes it from the detail API',
      removedThought.status === 200 &&
        !(detailAfter.data?.data?.thoughts ?? []).some((item) => item.id === thoughtId),
      `status ${removedThought.status}`,
    );

    // 书库清空、详情页 entry 变 null、重复删除不 500。
    const removedEntry = await post(`/api/records/${entryForDelete?.id}/delete`, { cookie, json: {} });
    const libraryAfter = await request('/api/library', { cookie });
    const detailNoEntry = await request('/api/subject/400602', { cookie });
    check(
      'deleting a record clears it from library and detail',
      removedEntry.status === 200 &&
        (libraryAfter.data?.data?.entries ?? []).length === 0 &&
        detailNoEntry.data?.data?.entry === null,
      `status ${removedEntry.status} entries ${libraryAfter.data?.data?.entries?.length}`,
    );
    // 已删掉，再删一次必须 404。
    checkStatus(
      'deleting an already deleted record reports 404',
      await post(`/api/records/${entryForDelete?.id}/delete`, { cookie, json: {} }),
      404,
    );
  }
}

