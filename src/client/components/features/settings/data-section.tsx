import { useState } from 'react';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { postJson } from '@/lib/api-client';
import { API_PREFIX } from '@shared/routes';
import { useWrite } from '@/lib/hooks/writes';
import { useSignOutMutation } from '@/lib/hooks/sign-out';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Section } from '@/components/features/settings/settings-parts';
import { Spinner } from '@/components/ui/spinner';

/** 删号是全站唯一的不可逆操作，输入 DELETE 才算确认（服务端也校验一次）。 */
export function DataSection({ onDeleted }: { onDeleted: () => void }) {
  const [confirmDelete, setConfirmDelete] = useState('');

  const signoutOthers = useWrite({
    mutationFn: () => postJson('/settings/signout-others', {}),
    success: '其他设备已退出',
    // 会话列表不在设置页展示，这里刷不刷新都一样，省掉一次全量重取。
    refresh: false,
  });

  const removeAccount = useWrite({
    mutationFn: () => postJson('/settings/delete', { confirm: confirmDelete }),
    success: '账号已删除',
    refresh: false,
    onSuccess: () => onDeleted(),
  });

  function deleteAccount(event: React.FormEvent) {
    event.preventDefault();
    removeAccount.mutate();
  }

  // 退出登录没有「成功后要不要刷新缓存」的语义，用 useSignOutMutation 的 isPending 就够，
  // 不必为了一个忙态再自己维护一份 signingOut。
  const logout = useSignOutMutation();

  return (
    <Section title="数据管理" hint="导出会生成一个 JSON 文件，包含全部记录、想法和账号资料。">
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <a href={`${API_PREFIX}/export`} download>
            <Download /> 导出我的数据
          </a>
        </Button>
        <Button size="sm" variant="outline" onClick={() => signoutOthers.mutate()} disabled={signoutOthers.isPending}>
          {signoutOthers.isPending ? <Spinner /> : <LogOut />}
          退出其他设备
        </Button>
        {/* 退出登录要等服务端清完会话，期间不禁用的话连点会重复发请求（侧栏那个出口同理）。 */}
        <Button size="sm" variant="ghost" onClick={() => logout.mutate()} disabled={logout.isPending}>
          {logout.isPending ? <Spinner /> : null}
          退出登录
        </Button>
      </div>

      <Separator className="my-5" />

      <form onSubmit={deleteAccount} className="rounded-xl border border-destructive/25 bg-destructive/[0.04] p-3">
        <p className="text-xs font-medium text-destructive">删除账号</p>
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
          会永久删除所有记录、想法与会话，无法恢复。请输入 <span className="font-mono font-semibold">DELETE</span> 确认。
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Input
            value={confirmDelete}
            onChange={(event) => setConfirmDelete(event.target.value)}
            placeholder="DELETE"
            className="h-8 w-32 font-mono text-xs"
            aria-label="输入 DELETE 确认删除"
          />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={removeAccount.isPending || confirmDelete !== 'DELETE'}
          >
            {removeAccount.isPending ? <Spinner /> : <Trash2 />}
            永久删除
          </Button>
        </div>
      </form>
    </Section>
  );
}
