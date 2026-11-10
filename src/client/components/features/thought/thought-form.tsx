import { THOUGHT_MAX_LENGTH } from '@shared/limits';
import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { postJson } from '@/lib/api-client';
import { RECORD_SCOPE, useWrite } from '@/lib/hooks/writes';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';

export function ThoughtForm({ entryId }: { entryId: string }) {
  const [content, setContent] = useState('');

  const save = useWrite<unknown, string>({
    // 想法挂在记录上，与记录写入共用串行队列，避免记录行被并发整行覆盖。
    scope: RECORD_SCOPE,
    // 想法只对整部作品，不绑某一集：请求里不带 episode。内容作为 mutation 变量传进来，不要在 mutationFn 里读 state：请求飞行中用户还能继续打字，回包时按当时 state 判断会把新打的字一起清掉。
    mutationFn: (text) => postJson('/thoughts', { entry_id: entryId, content: text }),
    success: '想法已记下',
    // 只有输入框还是刚提交的那段文字时才清空，避免吞掉飞行期间的新输入。
    onSuccess: (_data, sent) => setContent((current) => (current === sent ? '' : current)),
  });

  function submit(event: React.FormEvent) {
    event.preventDefault();
    // 空内容不算一次写入，拦住别在请求里报错。
    if (!content.trim()) return;
    save.mutate(content);
  }

  // 不自带卡片外壳：它嵌在宿主卡片（详情页「我的想法」）里，再套一层边框会变成双层卡片。
  return (
    <form onSubmit={submit}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <MessageSquarePlus className="size-4 text-primary" />
        记一个想法
      </div>
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        maxLength={THOUGHT_MAX_LENGTH}
        /* 上面那行「记一个想法」是独立文字，没和控件关联；placeholder 不算可访问名。 */
        aria-label="记一个想法"
        placeholder="看完这一部，你最想说的是…"
        className="mt-3 min-h-20 resize-y text-sm"
      />
      <div className="mt-3 flex items-center justify-end gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !content.trim()}>
          {save.isPending ? <Spinner /> : null}
          记下
        </Button>
      </div>
    </form>
  );
}
