import { useState } from 'react';
import { Link } from 'react-router';
import { AuthSubmit, useAuthForm, withNext } from '@/components/features/auth/auth-form';
import { AuthLayout } from '@/components/features/auth/auth-layout';
import { Field } from '@/components/ui/field';
import { REGISTER_PATH } from '@shared/routes';
import { PASSWORD_MIN_LENGTH } from '@shared/limits';

export default function LoginRoute() {
  const { next, busy, error, run } = useAuthForm('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await run({ email: email.trim(), password });
  }

  return (
    <AuthLayout
      kicker="Welcome back"
      title="登录 Miru"
      description="继续记录你的番剧进度、评分和想法。"
      onSubmit={submit}
      error={error}
      footer="登录状态保存在加密 Cookie 中，账号数据只存在你自己部署的 Cloudflare D1。"
    >
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
      <Field
        id="password"
        label="密码"
        type="password"
        autoComplete="current-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={`至少 ${PASSWORD_MIN_LENGTH} 位`}
      />
      <AuthSubmit busy={busy} label="登录" busyLabel="登录中…" />
      <p className="text-center text-2xs text-muted-foreground">
        还没有账号？{' '}
        <Link to={withNext(REGISTER_PATH, next)} className="font-medium text-primary hover:underline">
          注册一个
        </Link>
      </p>
    </AuthLayout>
  );
}
