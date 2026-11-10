import { NEW_PASSWORD, PASSWORD, check, checkStatus, cookie, cookieOf, email, post, request, setCookie } from './harness.mjs';

/* 账号设置与退出：改密码、退出其他设备、退出登录。 */
/* -------------------------------------------------------------- 账号设置 */
{
  // 第二个会话：验证「退出其他设备」踢了谁。
  const second = await post('/api/auth/sign-in/email', { json: { email, password: PASSWORD } });
  const secondCookie = cookieOf(second, '__Secure-better-auth.session_token');
  check('a second session can sign in', second.status === 200 && Boolean(secondCookie), `status ${second.status}`);

  const beforeMain = await request('/library', { cookie });
  const beforeSecond = await request('/library', { cookie: secondCookie });
  check(
    'both sessions are valid before the account writes',
    beforeMain.status === 200 && beforeSecond.status === 200,
    `main ${beforeMain.status} second ${beforeSecond.status}`,
  );

  // 字段名对不上时这个功能恒定返回「新密码至少 8 位」，等于完全不可用。
  const wrongCurrent = await post('/api/settings/password', {
    cookie,
    json: { currentPassword: 'not-my-password', newPassword: NEW_PASSWORD },
  });
  check(
    'password change rejects a wrong current password',
    wrongCurrent.status === 400 && String(wrongCurrent.data?.error ?? '').includes('当前密码'),
    `status ${wrongCurrent.status} error=${wrongCurrent.data?.error}`,
  );

  const changed = await post('/api/settings/password', {
    cookie,
    json: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
  });
  check('password change accepts the right current password', changed.status === 200, `status ${changed.status} error=${changed.data?.error}`);

  const relogin = await post('/api/auth/sign-in/email', { json: { email, password: NEW_PASSWORD } });
  check('the new password signs in', relogin.status === 200 && Boolean(relogin.data?.user), `status ${relogin.status}`);

  // 改密码会 revokeOtherSessions，第二会话已没了；用 relogin 拿到的 cookie 当当前会话，它与最初的 cookie 是两个 token。
  const thirdCookie = cookieOf(relogin, '__Secure-better-auth.session_token');
  check('the password change kept this session usable', Boolean(thirdCookie));

  // 只该踢其他设备。曾经拿 body.session_id 当当前会话而前端从不传，条件退化成 id != ''，把自己也删了。
  const others = await post('/api/settings/signout-others', { cookie: thirdCookie, json: {} });
  // 接口固定回 ok(c, {})；302/303 说明被页面跳转接走了，不该算通过。
  checkStatus('sign-out others responds', others, 200);

  const afterMain = await request('/library', { cookie: thirdCookie });
  const afterThird = await request('/library', { cookie });
  check('the current session survives signing others out', afterMain.status === 200, `status ${afterMain.status}`);
  checkStatus('the other session is invalidated', afterThird, 303);

  // 最初的 cookie 刚被踢掉，后面的 exit 段还要用：把当前仍有效的会话回填，别让它假失败（站点管理段用的是自己的 adminCookie）。
  setCookie(thirdCookie);
}

/* ------------------------------------------------------------------ 退出 */
{
  const signout = await post('/api/auth/sign-out', { cookie, json: {} });
  checkStatus('sign-out responds', signout, [200, 204]);
  const after = await request('/library', { cookie: cookieOf(signout, '__Secure-better-auth.session_token') || cookie });
  checkStatus('session invalidated after sign-out', after, 303);
}
