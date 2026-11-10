/** 顶栏右侧的账号区：头像 + 名称 + 邮箱，点开是「账号设置 / 退出登录」。 */
import { useRef } from 'react';
import { Link } from 'react-router';
import { LogOut, Settings } from 'lucide-react';
import { useAuth } from '@/lib/hooks/auth-context';
import { useSignOutMutation } from '@/lib/hooks/sign-out';
import { Spinner } from '@/components/ui/spinner';

export function UserCard() {
  const { user } = useAuth();
  // 退出要等服务端清完会话，期间不禁用的话连点会重复发请求。
  // 忙态由 useSignOutMutation 统一提供，设置页那个退出按钮用的是同一个。
  const logout = useSignOutMutation();
  // details 是浏览器自己开合的，React 不知道它开着；点「账号设置」跳转后菜单留在原地，
  // 所以这里受控：点任一项都显式收起。
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  function close() {
    if (menuRef.current) menuRef.current.open = false;
  }
  // 全站强制登录：只有登录后才会渲染这个组件。但首帧会话还没取到时 user 仍是 null，下面要兜住。
  if (!user) return null;
  return (
    <details ref={menuRef} className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-2xl border border-border/70 bg-card/70 px-3 py-2.5 transition-colors hover:bg-accent [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium">{user.name}</span>
          <span className="block truncate text-2xs text-muted-foreground">{user.email}</span>
        </span>
      </summary>
      <div className="absolute bottom-full left-0 z-40 mb-2 w-full overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg">
        <Link
          to="/settings"
          onClick={close}
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent"
        >
          <Settings className="size-4" /> 账号设置
        </Link>
        <button
          type="button"
          disabled={logout.isPending}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-destructive hover:bg-destructive/10 disabled:opacity-60"
          onClick={() => {
            close();
            logout.mutate();
          }}
        >
          {logout.isPending ? <Spinner /> : <LogOut className="size-4" />} 退出登录
        </button>
      </div>
    </details>
  );
}
