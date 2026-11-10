import { BASE, check, checkStatus, cookie, post, request } from './harness.mjs';

/* 跨站写保护：Origin 不同源必须 403，且数据不能被改动。本段沿用 02-auth 产出的 cookie。 */

{
  // 用只写库、不碰上游的改名接口，任何环境都会真正执行（挂在「记录」段时上游一挂就整段跳过，中间件删掉也没人发现）。Origin: null（沙箱 iframe / 隐私模式）按设计放行。
  const before = await request('/api/settings', { cookie });
  const nameBefore = before.data?.data?.user?.name ?? null;
  // 先把「读得到当前昵称」钉成断言：后面两次写入要复用这个值，读不到就写不进去，别用假名兜着蒙过去。
  check(
    'settings exposes the current nickname',
    typeof nameBefore === 'string' && nameBefore.length > 0,
    `name ${nameBefore}`,
  );
  const evil = await post('/api/settings/profile', {
    cookie,
    json: { name: '跨站写入' },
    headers: { origin: 'https://evil.example' },
  });
  checkStatus('cross-site write is rejected with 403', evil, 403);
  const after = await request('/api/settings', { cookie });
  check(
    'cross-site write leaves the data untouched',
    after.data?.data?.user?.name === nameBefore,
    `name ${after.data?.data?.user?.name}`,
  );
  const nullOrigin = await post('/api/settings/profile', {
    cookie,
    json: { name: nameBefore },
    headers: { origin: 'null' },
  });
  checkStatus('Origin: null is allowed', nullOrigin, 200);

  // 不带 Origin（同源表单、curl、服务端调用）必须放行，是 rejectCrossSiteWrite 的既定设计；request() 默认注入 origin，所以这里直接 fetch。
  const bare = await fetch(BASE + '/api/settings/profile', {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({ name: nameBefore }),
    redirect: 'manual',
  });
  await bare.text();
  checkStatus('a write without an Origin header is allowed', { status: bare.status }, 200);
  // 放行分支已有两个（Origin 缺失、Origin: null），必须配一条同源写入的正对照，否则被改成一律放行也会全绿。
  const sameOrigin = await post('/api/settings/profile', { cookie, json: { name: '同源写入' } });
  const afterSameOrigin = await request('/api/settings', { cookie });
  check(
    'a same-origin write is applied',
    sameOrigin.status === 200 && afterSameOrigin.data?.data?.user?.name === '同源写入',
    `status ${sameOrigin.status} name ${afterSameOrigin.data?.data?.user?.name}`,
  );
}

