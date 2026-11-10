import { check, checkStatus, cookie, cookieOf, email, post, request, setCookie, signUp } from './harness.mjs';

/* 登录注册：注册、会话、重复注册、错误密码。cookie 从这里产出，后续段共用。 */
{
  const signup = await signUp({ name: 'E2E 测试', email });
  check('sign-up succeeds', signup.status === 200 && Boolean(signup.data?.user), `status ${signup.status}`);
  // cookie 是模块级状态、可能被更早的段写过，要断言的是这次注册自己下发的那一枚。
  const sessionToken = cookieOf(signup, '__Secure-better-auth.session_token');
  setCookie(sessionToken);
  check('sign-up sets session cookie', Boolean(sessionToken), `set-cookie ${JSON.stringify(signup.setCookies)}`);

  // 前端 getJson 只认 payload.data，少套一层会让侧栏账号卡片静默消失。
  const sessionAuthed = await request('/api/session', { cookie });
  check(
    '/api/session returns the user under data',
    sessionAuthed.data?.data?.user?.email === email,
    `data ${JSON.stringify(sessionAuthed.data)}`,
  );
  const sessionGuest = await request('/api/session');
  check(
    '/api/session keeps the data layer for guests',
    sessionGuest.status === 200 && sessionGuest.data?.data?.user === null,
    `data ${JSON.stringify(sessionGuest.data)}`,
  );

  const library = await request('/api/library', { cookie });
  check(
    'authed /api/library responds',
    library.status === 200 && Array.isArray(library.data?.data?.entries),
    `status ${library.status}`,
  );

  const settings = await request('/api/settings', { cookie });
  check(
    'authed /api/settings responds',
    settings.status === 200 && Boolean(settings.data?.data?.user),
    `status ${settings.status}`,
  );

  // HeroStats 只在 stats 非 null 时渲染，所以出现 stats 同时证明了「会话被解析」与「拿到统计」。
  const authedHome = await request('/api/home', { cookie });
  check(
    'home API carries the signed-in stats',
    authedHome.status === 200 && typeof authedHome.data?.data?.stats?.total === 'number',
    `status ${authedHome.status}`,
  );

  const dup = await signUp({ name: 'x', email });
  check('duplicate sign-up rejected', dup.status >= 400 && dup.status < 500, `status ${dup.status}`);

  const wrong = await post('/api/auth/sign-in/email', { json: { email, password: 'wrongpass' } });
  checkStatus('wrong password rejected', wrong, 401);
}

