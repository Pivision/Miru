/** 退出登录的唯一入口。只调 signOut() 不够：useSession 的 staleTime 是 Infinity，缓存里还留着上一个用户，根组件判不出未登录，而接口已 401，页面会卡在骨架屏。所以这里做三件事：调接口、把缓存换成未登录、回首页。 */
import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { setUnauthorizedHandler, signOut } from '@/lib/api-client';
import { useAuth } from '@/lib/hooks/auth-context';
import { isNotSessionQuery, queryKeys } from '@/lib/hooks/query';

/** 只清理本地登录态，不调接口：删号时服务端已连会话一起删了，再调 sign-out 没意义。 */
export function useResetSession() {
  const queryClient = useQueryClient();
  const { setUser } = useAuth();

  return () => {
    setUser(null);
    // 清掉上一个用户的数据，但保留会话这条 query：clear() 会把 query 摘掉，挂在它上面的 observer 会短暂指向已脱离的实例。
    queryClient.removeQueries({ predicate: isNotSessionQuery });
    // 显式写入未登录：staleTime 是 Infinity，不会自己重取，不写就判不出来。
    queryClient.setQueryData(queryKeys.session, { user: null });
  };
}

function useSignOut() {
  const resetSession = useResetSession();
  const navigate = useNavigate();

  return async () => {
    // 接口失败也要清理本地状态：cookie 可能已失效，留着缓存更难解释。但要留一行印证，否则接口真坏了永远查不到。
    await signOut().catch((error) => console.warn('[auth] sign-out 接口失败，仅清理本地状态', error));
    resetSession();
    navigate('/');
  };
}

/** 退出按钮的忙态：把 useSignOut 包一层 mutation，顶栏与设置页两处共用同一个 isPending，请求期间禁用。 */
export function useSignOutMutation() {
  const signOutNow = useSignOut();
  return useMutation({ mutationFn: () => signOutNow() });
}

/** 会话在页面打开期间过期时把本地登录态清成未登录。触发点是任何接口回 401：不处理的话 useSession 的 staleTime 是 Infinity，缓存里的 user 永不失效，页面会一直停在错误态。这里只清状态不导航，跳转由 app 层守卫做。 */
export function useUnauthorizedGuard() {
  const resetSession = useResetSession();

  useEffect(() => {
    setUnauthorizedHandler(resetSession);
    return () => setUnauthorizedHandler(null);
  }, [resetSession]);
}
