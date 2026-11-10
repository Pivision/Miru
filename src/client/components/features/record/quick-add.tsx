import type { Entry, Subject } from '@shared/types';
import { STATUS_META } from '@shared/types';
import { postJson } from '@/lib/api-client';
import { RECORD_SCOPE, useWrite } from '@/lib/hooks/writes';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/** 未加入片单时 hero 里的三个状态按钮：点了直接落库。 */
export function QuickAdd({ subject }: { subject: Subject }) {
  const add = useWrite<unknown, Entry['status']>({
    scope: RECORD_SCOPE,
    mutationFn: (status) => postJson('/records', { subject_id: subject.id, status }),
    success: (_result, status) => `已标记为「${STATUS_META[status].label}」`,
  });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-2xs leading-snug text-muted-foreground">加入片单：</span>
      {(['watching', 'planned', 'completed'] as const).map((status) => (
        <Button
          key={status}
          variant="outline"
          size="sm"
          className="backdrop-blur"
          onClick={() => add.mutate(status)}
          disabled={add.isPending}
        >
          {/* 忙态只换图标、不改文案：按钮宽度不跳，三个状态也不会互相错位。 */}
          {add.isPending && add.variables === status ? <Spinner /> : null}
          {STATUS_META[status].label}
        </Button>
      ))}
    </div>
  );
}
