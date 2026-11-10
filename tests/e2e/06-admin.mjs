import { DEFAULT_IP, PASSWORD, check, checkStatus, cookie, cookieOf, email, post, request, signUp, skip, stamp } from './harness.mjs';

/* -------------------------------------------------------- 站点管理（管理员） */
{
  // 管理员判定是「createdAt 最早的账号」：harness 每次都是全新内存 D1，auth 段的 email 就是第一个账号。
  // 整段结束前必须恢复开关，否则后面的用例会被「注册已关闭」挡死。每个 sign-up 都换 x-forwarded-for：Better Auth 对 /sign-up/email 限 60 秒 5 次。
  // 同毫秒时 isAdmin 退到 asc(id)，而 id 是随机串，所以并发注册比不出先后。
  let seq = 0;
  // 从 DEFAULT_IP 换末段派生，IP 只有这一个来源。
  const freshIp = () => ({ 'x-forwarded-for': DEFAULT_IP.replace(/\.\d+$/, `.${(seq++ % 250) + 1}`) });

  const adminCookie = cookie;
  // 站点开关与邀请码的唯一读侧是 GET /api/settings 的 data.admin。
  const readAdmin = async () => {
    const res = await request('/api/settings', { cookie: adminCookie });
    // 只有「200 且 admin 为 null」才判非管理员；否则会把 500 伪装成「本段不适用」。
    if (res.status !== 200) throw new Error(`GET /api/settings 返回 ${res.status}，管理员探测本身失败`);
    return res.data?.data?.admin;
  };
  let adminProbe;
  let probeFailed = false;
  try {
    adminProbe = await readAdmin();
  } catch (error) {
    probeFailed = true;
    check('admin probe succeeds', false, error.message);
  }
  // 探测失败时不能再 skip。
  if (!adminProbe && !probeFailed) {
    skip(
      'site admin section',
      '当前账号不是管理员（GET /api/settings 的 data.admin 为 null）：本段只在 harness 的全新内存库上有效',
    );
  } else if (adminProbe) {
    check(
      'admin reads site settings',
      adminProbe.site?.registrationOpen === true && adminProbe.site?.requireInvite === false,
      `site ${JSON.stringify(adminProbe.site)}`,
    );

    // 非管理员：接口 403，/api/settings 里也没有管理数据。e2e 账号本身是管理员，所以另建一个普通账号。
    const plainSignup = await signUp({ name: '普通用户', email: `e2e-plain-${stamp}@miru.local`, headers: freshIp() });
    const plainCookie = cookieOf(plainSignup, '__Secure-better-auth.session_token');
    check('second account signs up', plainSignup.status === 200 && Boolean(plainCookie), `status ${plainSignup.status}`);
    // 写侧 403，读侧只是 admin 为 null。
    const forbidden = await post('/api/settings/invites', { cookie: plainCookie, json: { remaining: 1 } });
    checkStatus('non-admin is rejected with 403', forbidden, 403);
    const plainSettings = await request('/api/settings', { cookie: plainCookie });
    check(
      'non-admin gets no site management data',
      plainSettings.status === 200 && plainSettings.data?.data?.admin === null,
      `status ${plainSettings.status}`,
    );

    // 2 次额度，不过期。
    const created = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 2 } });
    const invite = created.data?.data?.invite;
    check('admin creates an invite code', created.status === 200 && Boolean(invite?.code), `status ${created.status}`);
    check('new invite starts unused', invite?.remaining === 2 && invite?.usedCount === 0 && invite?.dead === false);

    const badCount = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 0 } });
    checkStatus('invite count is validated', badCount, 400);

    // 打开邀请码开关。
    const requireOn = await post('/api/settings/site', { cookie: adminCookie, json: { requireInvite: true } });
    check('admin turns on invite requirement', requireOn.status === 200 && requireOn.data?.data?.site?.requireInvite === true);

    const noCode = await signUp({ name: '无码', email: `invite-none-${stamp}@miru.local`, headers: freshIp() });
    check(
      'sign-up without a code is refused',
      noCode.status === 403 && noCode.data?.code === 'INVITE_REQUIRED',
      `status ${noCode.status}`,
    );

    const wrongCode = await signUp({
      name: '错码',
      email: `invite-wrong-${stamp}@miru.local`,
      inviteCode: 'MIRU-0000-0000',
      headers: freshIp(),
    });
    check(
      'sign-up with a bogus code is refused',
      wrongCode.status === 403 && wrongCode.data?.error === '邀请码不存在',
      `status ${wrongCode.status} ${wrongCode.data?.error ?? ''}`,
    );

    const firstUse = await signUp({
      name: '持码者一',
      email: `invite-ok1-${stamp}@miru.local`,
      inviteCode: invite?.code,
      headers: freshIp(),
    });
    check('sign-up with a valid code succeeds', firstUse.status === 200 && Boolean(firstUse.data?.user), `status ${firstUse.status}`);

    const afterFirst = await readAdmin();
    const tracked = afterFirst?.invites?.find((item) => item.id === invite?.id);
    check(
      'invite is consumed after sign-up',
      tracked?.remaining === 1 && tracked?.usedCount === 1 && tracked?.uses?.length === 1,
      `remaining=${tracked?.remaining} used=${tracked?.usedCount} uses=${tracked?.uses?.length}`,
    );
    check('invite use records who used it', tracked?.uses?.[0]?.userEmail === `invite-ok1-${stamp}@miru.local`);

    // 丢连字符、大小写混也该能用（normalizeCode 会重排）；单独用一个码，免得吃掉上面的额度。
    const loose = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 1 } });
    const squashed = await signUp({
      name: '抄错码',
      email: `invite-squashed-${stamp}@miru.local`,
      inviteCode: String(loose.data?.data?.invite?.code ?? '').replace(/-/g, '').toLowerCase(),
      headers: freshIp(),
    });
    checkStatus('invite code is normalized before lookup', squashed, 200);

    // 用完额度即失效 → 再用被拒。
    const secondUse = await signUp({
      name: '持码者二',
      email: `invite-ok2-${stamp}@miru.local`,
      inviteCode: invite?.code,
      headers: freshIp(),
    });
    checkStatus('invite can be reused while it has quota', secondUse, 200);

    const exhausted = await signUp({
      name: '持码者三',
      email: `invite-ok3-${stamp}@miru.local`,
      inviteCode: invite?.code,
      headers: freshIp(),
    });
    check(
      'exhausted invite is refused',
      exhausted.status === 403 && exhausted.data?.error === '这个邀请码已经用完了',
      `status ${exhausted.status} ${exhausted.data?.error ?? ''}`,
    );

    const spent = await readAdmin();
    const deadCode = spent?.invites?.find((item) => item.id === invite?.id);
    check('exhausted invite is marked dead', deadCode?.dead === true && deadCode?.remaining === 0);

    // 建号失败不该白吃额度：同邮箱注册两次，第二次被拒且次数退回。
    const refund = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 2 } });
    const refundCode = refund.data?.data?.invite?.code;
    const refundEmail = `invite-refund-${stamp}@miru.local`;
    await signUp({ name: '退款甲', email: refundEmail, inviteCode: refundCode, headers: freshIp() });
    const refundDup = await signUp({ name: '退款乙', email: refundEmail, inviteCode: refundCode, headers: freshIp() });
    check('duplicate sign-up is refused', refundDup.status >= 400, `status ${refundDup.status}`);
    const refundState = await readAdmin();
    const refundRow = refundState?.invites?.find((item) => item.code === refundCode);
    check(
      'failed sign-up refunds the invite quota',
      refundRow?.remaining === 1 && refundRow?.usedCount === 1,
      `remaining ${refundRow?.remaining} used ${refundRow?.usedCount}`,
    );

    // 作废后注册被拒。
    const doomed = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 5 } });
    const doomedId = doomed.data?.data?.invite?.id;
    const doomedCode = doomed.data?.data?.invite?.code;
    const revoke = () => post(`/api/settings/invites/${doomedId}/revoke`, { cookie: adminCookie, json: {} });
    const revoked = await revoke();
    checkStatus('admin revokes an invite', revoked, 200);
    const revokeAgain = await revoke();
    checkStatus('revoking twice is a 404', revokeAgain, 404);

    const useRevoked = await signUp({
      name: '废码',
      email: `invite-revoked-${stamp}@miru.local`,
      inviteCode: doomedCode,
      headers: freshIp(),
    });
    check(
      'revoked invite is refused',
      useRevoked.status === 403 && useRevoked.data?.error === '这个邀请码已被作废',
      `status ${useRevoked.status} ${useRevoked.data?.error ?? ''}`,
    );

    // 关闭注册后：有效码也进不来。
    const keep = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 5 } });
    const keepCode = keep.data?.data?.invite?.code;
    const closed = await post('/api/settings/site', { cookie: adminCookie, json: { registrationOpen: false } });
    check('admin closes registration', closed.status === 200 && closed.data?.data?.site?.registrationOpen === false);

    const blocked = await signUp({
      name: '关站期间',
      email: `invite-closed-${stamp}@miru.local`,
      inviteCode: keepCode,
      headers: freshIp(),
    });
    check(
      'closed registration beats a valid invite',
      blocked.status === 403 && blocked.data?.code === 'REGISTRATION_CLOSED',
      `status ${blocked.status}`,
    );

    // 路径变体不能绕过注册拦截。不能用 signUp()：它固定打 /api/auth/sign-up/email。
    const variants = ['/api/auth/sign-up/email/', '/api/auth//sign-up/email', '/api/auth/sign%2Dup/email'];
    for (const variant of variants) {
      const res = await post(variant, {
        headers: freshIp(),
        json: {
          name: '绕',
          email: `bypass-${Math.random().toString(36).slice(2)}@miru.local`,
          password: PASSWORD,
        },
      });
      checkStatus(`path variant ${variant} cannot bypass the gate`, res, 403);
    }

    // 点段（/./、/../）测不了：fetch 用 WHATWG URL 解析，发出前就抹平了，断言只会复述上面的 403。// 与 %2D 原样到达，是真断言；测点段得用 node:http 发不归一化的请求行。
    // 恢复原状，后面用例还要能跑。
    const restore = await post('/api/settings/site', {
      cookie: adminCookie,
      json: { registrationOpen: true, requireInvite: false },
    });
    check(
      'site settings are restored',
      restore.status === 200 &&
        restore.data?.data?.site?.registrationOpen === true &&
        restore.data?.data?.site?.requireInvite === false,
    );

    const emptyPatch = await post('/api/settings/site', { cookie: adminCookie, json: {} });
    checkStatus('empty site patch is rejected', emptyPatch, 400);

    // 认不出的开关值必须 400，不能折成 false：那会把误传变成「关掉注册」。
    const bogusFlag = await post('/api/settings/site', {
      cookie: adminCookie,
      json: { registrationOpen: 'maybe' },
    });
    checkStatus('an unparseable site flag is rejected', bogusFlag, 400);

    // 次数必须是整数：Math.round 会把 2.9 变 3，与 records 的两条进度接口同口径。
    const fractionalInvite = await post('/api/settings/invites', {
      cookie: adminCookie,
      json: { remaining: 2.9 },
    });
    checkStatus('a fractional invite quota is rejected instead of rounded', fractionalInvite, 400);

    // 用码的人删号后，码与使用记录都要留着（外键 SET NULL 而非 CASCADE）：码可能还有额度，记录是审计线索。
    await post('/api/settings/site', { cookie: adminCookie, json: { requireInvite: true } });
    const keeper = await post('/api/settings/invites', { cookie: adminCookie, json: { remaining: 2 } });
    const keeperCode = keeper.data?.data?.invite?.code;
    const keeperId = keeper.data?.data?.invite?.id;
    const leaving = await signUp({
      name: '要走的人',
      email: `invite-leaver-${stamp}@miru.local`,
      inviteCode: keeperCode,
      headers: freshIp(),
    });
    const leavingCookie = cookieOf(leaving, '__Secure-better-auth.session_token');
    const removed = await post('/api/settings/delete', { cookie: leavingCookie, json: { confirm: 'DELETE' } });
    // 只接受 200 JSON：302/303 等于把「跳到错误页」判成成功。
    checkStatus('invite user can delete their account', removed, 200);
    // 账号删了会话行也得跟着没，否则旧 cookie 仍可用。会话接口对无效 cookie 照回 200 + user: null，所以查 user。
    const afterDelete = await request('/api/session', { cookie: leavingCookie });
    check(
      'deleted account is signed out',
      afterDelete.status === 200 && afterDelete.data?.data?.user === null,
      `status ${afterDelete.status} user ${JSON.stringify(afterDelete.data?.data?.user)}`,
    );

    const survivor = await readAdmin();
    const survivorRow = survivor?.invites?.find((item) => item.id === keeperId);
    check(
      'invite survives its user being deleted',
      Boolean(survivorRow) && survivorRow?.remaining === 1 && survivorRow?.uses?.length === 1,
      `remaining=${survivorRow?.remaining} uses=${survivorRow?.uses?.length}`,
    );
    check('invite use keeps a record with a null user', survivorRow?.uses?.[0]?.userEmail === null);
    await post('/api/settings/site', { cookie: adminCookie, json: { requireInvite: false } });
  }
}

