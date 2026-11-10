import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { normalizeUser, useAuth } from '@/lib/hooks/auth-context';
import { errorMessage, signIn, signUp } from '@/lib/api-client';
import { safeNext } from '@shared/routes';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** 登录/注册页的提交按钮：忙碌时是 spinner + 进行中文案，空闲时是文案 + 箭头。两页只差文案，共用一份。 */
export function AuthSubmit({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <Button type="submit" className="w-full" disabled={busy}>
      {busy ? (
        <>
          <Spinner className="size-4" />
          {busyLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight className="size-4" />
        </>
      )}
    </Button>
  );
}

/** 站内跳转链接：next 是首页时不带查询串。 */
export function withNext(path: string, next: string): string {
  return next === '/' ? path : `${path}?next=${encodeURIComponent(next)}`;
}

/** 登录/注册的表单逻辑。错误贴在表单上而非全局 toast：就地看得到该改哪个框。成功后写缓存再跳转，侧栏与问候语要立刻显示新用户。 */
export function useAuthForm(kind: 'signIn' | 'signUp') {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(payload: Record<string, string>) {
    setBusy(true);
    setError(null);
    try {
      const result =
        kind === 'signIn'
          ? await signIn(payload.email, payload.password)
          : await signUp(payload.name, payload.email, payload.password, payload.inviteCode);
      const user = normalizeUser(result.user);
      if (user) setUser(user);
      await queryClient.invalidateQueries();
      navigate(next, { replace: true });
    } catch (cause) {
      setError(errorMessage(cause, kind === 'signIn' ? '登录失败' : '注册失败'));
    } finally {
      setBusy(false);
    }
  }

  return { next, busy, error, setError, run };
}
