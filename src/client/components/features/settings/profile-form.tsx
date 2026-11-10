import { useState } from 'react';
import { UserRound } from 'lucide-react';
import { postJson } from '@/lib/api-client';
import { useWrite } from '@/lib/hooks/writes';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Section } from '@/components/features/settings/settings-parts';
import { Spinner } from '@/components/ui/spinner';
import { NAME_MAX_LENGTH } from '@shared/limits';

/** 写成功后由路由通过 `onSaved` 同步本地 `user`（侧栏与首页问候语立刻跟着变），组件只管发请求与报错。 */
export function ProfileForm({
  name,
  email,
  onSaved,
}: {
  /** 当前昵称，由路由从查询数据与本地覆盖里取好。 */
  name: string;
  email: string;
  onSaved: (name: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? name;

  const save = useWrite<unknown, string>({
    mutationFn: (next) => postJson('/settings/profile', { name: next }),
    success: '昵称已更新',
    onSuccess: (_result, next) => {
      setDraft(null);
      onSaved(next);
    },
  });

  return (
    <Section title="账号资料" hint="昵称会显示在侧栏和首页问候语里。">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(value.trim());
        }}
        className="space-y-3"
      >
        <Field
          id="display-name"
          label="昵称"
          value={value}
          maxLength={NAME_MAX_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="你的名字"
        />
        <Field
          id="account-email"
          label="邮箱"
          value={email}
          readOnly
          footer="邮箱用于登录，暂不支持在站内修改。"
        />
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? <Spinner /> : <UserRound />}
          保存资料
        </Button>
      </form>
    </Section>
  );
}
