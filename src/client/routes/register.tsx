import { useState } from 'react';
import { Link } from 'react-router';
import { AuthSubmit, useAuthForm, withNext } from '@/components/features/auth/auth-form';
import { AuthLayout } from '@/components/features/auth/auth-layout';
import { Field } from '@/components/ui/field';
import { LOGIN_PATH } from '@shared/routes';
import { NAME_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '@shared/limits';
import { passwordConfirmError } from '@shared/password';

export default function RegisterRoute() {
  const { next, busy, error, setError, run } = useAuthForm('signUp');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // 邀请码常驻输入框：是否真的要求由后端按站点设置判定，前端不去猜开关状态。
  const [inviteCode, setInviteCode] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // 两次密码不一致是表单自己的问题，不该发请求。
    const mismatch = passwordConfirmError(password, confirm);
    if (mismatch) {
      setError(mismatch);
      return;
    }
    await run({
      name: name.trim() || email.split('@')[0],
      email: email.trim(),
      password,
      inviteCode: inviteCode.trim(),
    });
  }

  return (
    <AuthLayout
      kicker="New here"
      title="创建账号"
      description="只需要邮箱和密码，一分钟就能开始记番。"
      onSubmit={submit}
      error={error}
    >
      <Field
        id="name"
        label="昵称"
        autoComplete="nickname"
        maxLength={NAME_MAX_LENGTH}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="怎么称呼你？"
      />
      <Field
        id="email"
        label="邮箱"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
      />
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="password"
          label="密码"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
        />
        <Field
          id="confirm"
          label="确认密码"
          type="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          placeholder="再输一次"
        />
      </div>
      <Field
        id="inviteCode"
        label="邀请码"
        hint="（没有就留空）"
        autoComplete="off"
        spellCheck={false}
        maxLength={40}
        value={inviteCode}
        onChange={(event) => setInviteCode(event.target.value)}
        placeholder="MIRU-XXXX-XXXX"
        className="font-mono uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
      />
      <AuthSubmit busy={busy} label="创建账号" busyLabel="创建中…" />
      <p className="text-center text-2xs text-muted-foreground">
        已经有账号？{' '}
        <Link to={withNext(LOGIN_PATH, next)} className="font-medium text-primary hover:underline">
          直接登录
        </Link>
      </p>
    </AuthLayout>
  );
}
