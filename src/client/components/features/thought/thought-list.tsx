import { Trash2 } from 'lucide-react';
import { postJson } from '@/lib/api-client';
import { RECORD_SCOPE, useWrite } from '@/lib/hooks/writes';
import { timeAgo } from '@/lib/time-format';
import type { Thought } from '@shared/types';

function ThoughtItem({ thought, index }: { thought: Thought; index: number }) {
  const remove = useWrite({
    scope: RECORD_SCOPE,
    mutationFn: () => postJson(`/thoughts/${thought.id}/delete`, {}),
    success: '已删除',
  });

  function confirmAndRemove() {
    // 确认框留在动作之外：它不属于「一次写请求」，也不该被 busy 计入。
    if (window.confirm('删除这条想法？')) remove.mutate();
  }

  return (
    <li className="group relative flex gap-3 py-3.5">
      <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-2xs font-semibold text-primary">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{thought.content}</p>
        <p className="mt-1 text-2xs text-muted-foreground">
          {timeAgo(thought.createdAt)}
          {thought.entryTitle ? ` · 《${thought.entryTitle}》` : ''}
        </p>
      </div>
      <button
        type="button"
        onClick={confirmAndRemove}
        disabled={remove.isPending}
        className="opacity-100 transition-opacity hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
        aria-label="删除想法"
      >
        <Trash2 className="size-3.5" />
      </button>
    </li>
  );
}

export function ThoughtList({ thoughts, empty }: { thoughts: Thought[]; empty?: string }) {
  if (thoughts.length === 0) {
    return <p className="py-6 text-center text-xs text-muted-foreground">{empty ?? '还没有想法，看的时候随手记一句吧。'}</p>;
  }
  return (
    <ul className="divide-y divide-border/60">
      {thoughts.map((thought, index) => (
        <ThoughtItem key={thought.id} thought={thought} index={index} />
      ))}
    </ul>
  );
}
