import { Component, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from '@/components/layout/shell';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider } from '@/lib/hooks/auth-context';
import { useUnauthorizedGuard } from '@/lib/hooks/sign-out';
import { useSession } from '@/lib/hooks/query';
import { usePageTitle } from '@/lib/hooks/title';
import { Button } from '@/components/ui/button';
import { NOT_FOUND, Notice, NoticeLinks } from '@/components/ui/notice';
import { LOGIN_PATH, REGISTER_PATH, isAuthPath, pageTitle } from '@shared/routes';
import HomeRoute from '@/routes/_index';
import LibraryRoute from '@/routes/library';
import DiscoverRoute from '@/routes/discover';
import SubjectRoute from '@/routes/subject.$id';
import SettingsRoute from '@/routes/settings';
import LoginRoute from '@/routes/login';
import RegisterRoute from '@/routes/register';

/** 应用外壳：登录守卫 + 路由表 + 错误边界。硬守卫在 Worker 里（loginGuard 直接 303），这里只补「会话在页面打开期间过期」：会话明确为 null 且不在登录页就带 ?next= 回登录页。 */
export function App() {
  const { pathname, search } = useLocation();
  const session = useSession();
  const isAuthPage = isAuthPath(pathname);

  usePageTitle(pageTitle(pathname));

  if (!isAuthPage && session.data && !session.data.user) {
    return <Navigate to={`${LOGIN_PATH}?next=${encodeURIComponent(pathname + search)}`} replace />;
  }

  return (
    <AuthProvider user={session.data?.user ?? null}>
      <UnauthorizedGuard />
      <ErrorBoundary key={pathname}>
        <AppShell>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
            <Route path="/library" element={<LibraryRoute />} />
            <Route path="/discover" element={<DiscoverRoute />} />
            <Route path="/subject/:id" element={<SubjectRoute />} />
            <Route path="/settings" element={<SettingsRoute />} />
            <Route path={LOGIN_PATH} element={<LoginRoute />} />
            <Route path={REGISTER_PATH} element={<RegisterRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AppShell>
      </ErrorBoundary>
      <Toaster />
    </AuthProvider>
  );
}

/** 把「任何接口回 401」接到本地会话清理上。必须在 Provider 内部才能用 useResetSession。 */
function UnauthorizedGuard() {
  useUnauthorizedGuard();
  return null;
}

function NotFound() {
  return (
    <Notice {...NOT_FOUND}>
      <NoticeLinks />
    </Notice>
  );
}

/** 渲染期异常兜底。纯 SPA 没有路由错误边界，只能用类组件；生产只给中文文案，dev 才透出原始 message。 */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const detail = import.meta.env.DEV && error.message ? error.message : '服务暂时出了点问题，稍后再试一次。';
    // 只清 error 不够：出错期间 URL 可能已变（前进后退仍可用），出错的组件会原样再抛一次。所以把 pathname 当 key：URL 真变了才重建子树，同页重试仍是清 error → 正常重渲染。
    return (
      <Notice code={500} title="这一页出了点问题" detail={detail}>
        <Button size="sm" onClick={() => this.setState({ error: null })}>
          再试一次
        </Button>
        <NoticeLinks />
      </Notice>
    );
  }
}
