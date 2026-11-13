import { useNavigate } from 'react-router';
import { useAuth } from '@/lib/hooks/auth-context';
import { useSettings } from '@/lib/hooks/query';
import { useResetSession } from '@/lib/hooks/sign-out';
import { PageHeader } from '@/components/layout/page-header';
import { QueryBoundary } from '@/components/ui/query-boundary';
import { ProfileForm } from '@/components/features/settings/profile-form';
import { PasswordForm } from '@/components/features/settings/password-form';
import { AppearanceSection } from '@/components/features/settings/appearance-section';
import { DataSection } from '@/components/features/settings/data-section';
import { SiteSwitchSection } from '@/components/features/settings/site-switch-section';
import { InviteSection } from '@/components/features/settings/invite-section';

/** 设置页：六个分区各自成组件，后两个（站点管理 / 邀请码）只有管理员渲染，这里只留排布。 */
export default function SettingsRoute() {
  const { data, isError, error, refetch: reload } = useSettings();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const resetSession = useResetSession();

  // 删号后服务端连会话一起删了，清本地状态再回首页即可。
  function handleDeleted() {
    resetSession();
    navigate('/');
  }

  // 取数失败时各分区会用 ?? 兜底静默退化成空表单、没有重试入口，所以必须先判错误态：走 QueryBoundary 与其余页面同一套三段式出口。
  return (
    <div className="space-y-6">
      <PageHeader title="设置" description="账号资料、密码、外观，以及你的数据。" />

      {/* 骨架屏留空：分区本来就用 ?? 兜底渲染出等价表单，先给骨架再换同一份表单反而会闪。 */}
      <QueryBoundary
        data={data}
        isError={isError}
        error={error}
        onRetry={() => void reload()}
        errorTitle="设置暂时打不开"
        skeleton={null}
      >
        {(settings) => (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <ProfileForm
                name={settings.user.name}
                email={settings.user.email}
                onSaved={(name) => {
                  // 服务端返回的就是当前会话用户，用其余字段回填本地视图。
                  setUser({ ...settings.user, name });
                  void reload();
                }}
              />
              <AppearanceSection stats={settings.stats} />
              <PasswordForm />
              <DataSection onDeleted={handleDeleted} />
            </div>

            {settings.admin && (
              <>
                <SiteSwitchSection site={settings.admin.site} reload={() => void reload()} />
                <InviteSection invites={settings.admin.invites} reload={() => void reload()} />
              </>
            )}
          </>
        )}
      </QueryBoundary>
    </div>
  );
}
