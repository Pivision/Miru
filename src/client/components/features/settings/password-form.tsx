import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { postJson } from '@/lib/api-client';
import { useWrite } from '@/lib/hooks/writes';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Section } from '@/components/features/settings/settings-parts';
import { Spinner } from '@/components/ui/spinner';
import { PASSWORD_MIN_LENGTH } from '@shared/limits';
import { passwordConfirmError } from '@shared/password';

/** 两次输入不一致在发请求前拦；服务端成功后 revokeOtherSessions，文案里要说清楚。 */
export function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const save = useWrite({
    mutationFn: () => postJson('/settings/password', { currentPassword, newPassword }),
    success: '密码已更新，其他设备已退出登录',
    refresh: false,
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
  });

  return (
    <Section title="修改密码" hint="修改后其他设备上的登录会失效。">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const mismatch = passwordConfirmError(newPassword, confirmPassword);
          if (mismatch) {
            toast.error(mismatch);
            return;
          }
          save.mutate();
        }}
        className="space-y-3"
      >
        <Field
          id="current-password"
          label="当前密码"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="new-password"
            label="新密码"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <Field
            id="confirm-password"
            label="确认新密码"
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : <KeyRound />}
          更新密码
        </Button>
      </form>
    </Section>
  );
}
