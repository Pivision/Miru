/**
 * 站点开关：开放注册与「注册需要邀请码」。仅管理员可见，由设置页按 data.admin 决定是否渲染。
 * 改完点保存才落库：两个开关一次提交，避免「开了注册但邀请码还没配好」的中间态。
 */
import { useEffect, useState } from 'react';
import { postJson } from '@/lib/api-client';
import { useWrite } from '@/lib/hooks/writes';
import type { SiteSettingsData } from '@shared/types';
import { Button } from '@/components/ui/button';
import { Section, SwitchRow } from '@/components/features/settings/settings-parts';
import { Spinner } from '@/components/ui/spinner';

export function SiteSwitchSection({ site, reload }: { site: SiteSettingsData; reload: () => void }) {
  const [registrationOpen, setRegistrationOpen] = useState(site.registrationOpen);
  const [requireInvite, setRequireInvite] = useState(site.requireInvite);
  const dirty = registrationOpen !== site.registrationOpen || requireInvite !== site.requireInvite;

  /*
    有未保存改动时不拿服务端值覆盖草稿 —— 页面会静默刷新，否则用户刚点的开关
    会被后台那次刷新吞掉。等保存完 dirty 变回 false，再把服务端值同步下来。
  */
  useEffect(() => {
    if (dirty) return;
    setRegistrationOpen(site.registrationOpen);
    setRequireInvite(site.requireInvite);
  }, [site.registrationOpen, site.requireInvite, dirty]);

  const saveSiteMutation = useWrite({
    mutationFn: () => postJson('/settings/site', { registrationOpen, requireInvite }),
    success: '站点设置已保存',
    // reload() 已经是整页数据重新拉取，不必再走一次全量失效，否则同一份数据刷两遍。
    refresh: false,
    onSuccess: () => reload(),
  });

  return (
    <Section
      title="站点管理"
      hint="你是这台实例的管理员（第一个注册的账号）。这里的开关影响所有人，改完记得保存。"
    >
      <div className="space-y-2">
        <SwitchRow
          id="registration-open"
          label="开放注册"
          hint="关掉以后任何人都注册不了，邀请码也不行。"
          checked={registrationOpen}
          disabled={saveSiteMutation.isPending}
          onChange={setRegistrationOpen}
        />
        <SwitchRow
          id="require-invite"
          label="注册需要邀请码"
          hint="仅在开放注册时生效；开启后没有有效邀请码就无法注册。"
          checked={requireInvite}
          disabled={saveSiteMutation.isPending || !registrationOpen}
          onChange={setRequireInvite}
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button type="button" size="sm" onClick={() => saveSiteMutation.mutate()} disabled={!dirty || saveSiteMutation.isPending}>
          {saveSiteMutation.isPending ? <Spinner /> : null}
          保存设置
        </Button>
        {dirty && <span className="text-2xs text-muted-foreground">有未保存的改动</span>}
      </div>
    </Section>
  );
}
