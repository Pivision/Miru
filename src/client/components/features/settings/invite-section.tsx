/** 邀请码：生成表单 + 列表。与站点开关互不相干，所以两者是各自独立的 Section。 */
import { useState } from 'react';
import { Plus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { postJson } from '@/lib/api-client';
import { useWrite } from '@/lib/hooks/writes';
import type { InviteCodeView } from '@shared/types';
import { fmtDateTime, msToSec } from '@/lib/time-format';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@/components/ui/empty-state';
import { Section } from '@/components/features/settings/settings-parts';
import { Spinner } from '@/components/ui/spinner';

/**
 * 邀请码状态：能用的显示次数，不能用的说清原因。判定顺序与后端 reserveInviteCode 一致。
 * 只读服务端给的 dead 字段，不在渲染里调 Date.now()，否则会出现「显示还能用但注册失败」。
 */
function inviteState(invite: InviteCodeView): { label: string; tone: 'ok' | 'dead' } {
  if (invite.revokedAt !== null) return { label: '已作废', tone: 'dead' };
  if (invite.dead) return { label: '已过期', tone: 'dead' };
  if (invite.remaining <= 0) return { label: '已用完', tone: 'dead' };
  return { label: `还能用 ${invite.remaining} 次`, tone: 'ok' };
}

export function InviteSection({ invites, reload }: { invites: InviteCodeView[]; reload: () => void }) {
  const [remaining, setRemaining] = useState('1');
  const [expiresInDays, setExpiresInDays] = useState('');
  /* 展开中的邀请码做成集合：原来存单值，展开 A 再点 B 会把 A 收起，与「分别展开」的预期不符。 */
  const [openUses, setOpenUses] = useState<Set<string>>(() => new Set());

  const createInviteMutation = useWrite<{ invite: InviteCodeView }>({
    mutationFn: () =>
      postJson<{ invite: InviteCodeView }>('/settings/invites', {
        // 清空输入框按 1 次：表单初值与最小合法值都是 1，这不是服务端字段的兜底。
        remaining: Number(remaining) || 1,
        expiresInDays: expiresInDays.trim(),
      }),
    success: (result) => `已生成邀请码 ${result.invite.code}`,
    onSuccess: () => {
      setRemaining('1');
      setExpiresInDays('');
      reload();
    },
  });

  const revokeMutation = useWrite<unknown, InviteCodeView>({
    mutationFn: (invite) => postJson(`/settings/invites/${invite.id}/revoke`, {}),
    success: '邀请码已作废',
    onSuccess: () => reload(),
  });

  function submitInvite(event: React.FormEvent) {
    event.preventDefault();
    createInviteMutation.mutate();
  }

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      toast.success('已复制');
    } catch {
      toast.error('复制失败，请手动选中');
    }
  }

  return (
    <Section title="邀请码" hint="生成后把码发给朋友，对方在注册页填上即可。用完次数、过期或作废后自动失效。">
      <form onSubmit={submitInvite} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="invite-remaining" className="text-2xs">
            可用次数
          </Label>
          <Input
            id="invite-remaining"
            type="number"
            min={1}
            max={100}
            value={remaining}
            onChange={(event) => setRemaining(event.target.value)}
            className="h-8 w-20 text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="invite-expires" className="text-2xs">
            有效天数
          </Label>
          <Input
            id="invite-expires"
            type="number"
            min={1}
            max={3650}
            value={expiresInDays}
            onChange={(event) => setExpiresInDays(event.target.value)}
            placeholder="永久"
            className="h-8 w-24 text-xs"
          />
        </div>
        <Button type="submit" size="sm" variant="outline" disabled={createInviteMutation.isPending}>
          {createInviteMutation.isPending ? <Spinner /> : <Plus />}
          生成邀请码
        </Button>
      </form>

      {invites.length === 0 ? (
        <EmptyState size="sm" className="mt-4 rounded-xl px-3 py-6 text-2xs" title="还没有邀请码。" />
      ) : (
        <ul className="mt-4 space-y-2">
          {invites.map((invite) => {
            const state = inviteState(invite);
            const expanded = openUses.has(invite.id);
            const revokingThis = revokeMutation.isPending && revokeMutation.variables?.id === invite.id;
            return (
              <li key={invite.id} className="rounded-xl border border-border/70 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <button
                    type="button"
                    onClick={() => void copy(invite.code)}
                    title="点击复制"
                    className="font-mono text-xs font-medium tracking-wide hover:text-primary"
                  >
                    {invite.code}
                  </button>
                  {/* 语义与观看状态无关：用中性/成功两档，别再借 watching/dropped 表达「可用/失效」。 */}
                  <Badge variant={state.tone === 'ok' ? 'success' : 'neutral'} className="text-2xs">
                    {state.label}
                  </Badge>
                  <span className="text-2xs text-muted-foreground">
                    已用 {invite.usedCount} 次 ·{' '}
                    {invite.expiresAt === null ? '永久有效' : `至 ${fmtDateTime(msToSec(invite.expiresAt))}`}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    {invite.uses.length > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-2xs"
                        onClick={() =>
                          setOpenUses((prev) => {
                            const next = new Set(prev);
                            if (next.has(invite.id)) next.delete(invite.id);
                            else next.add(invite.id);
                            return next;
                          })
                        }
                      >
                        {expanded ? '收起' : `使用记录 ${invite.uses.length}`}
                      </Button>
                    )}
                    {/* 只要还没被手动作废就允许点：过期/用完的码也常要撤掉留痕 */}
                    {invite.revokedAt === null && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-2xs text-destructive hover:text-destructive"
                        disabled={revokingThis}
                        onClick={() => revokeMutation.mutate(invite)}
                      >
                        {revokingThis ? (
                          <Spinner className="size-3" />
                        ) : (
                          <XCircle className="size-3" />
                        )}
                        作废
                      </Button>
                    )}
                  </div>
                </div>
                {expanded && (
                  <ul className="mt-2 space-y-1 border-t border-border/60 pt-2">
                    {invite.uses.map((use) => (
                      <li key={use.id} className="flex flex-wrap gap-x-2 text-2xs text-muted-foreground">
                        <span className="text-foreground/80">{use.userName || '（无昵称）'}</span>
                        <span>{use.userEmail}</span>
                        <span className="ml-auto">{fmtDateTime(msToSec(use.usedAt))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
