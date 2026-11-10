/** 想法（短评）的增删。 */
import { THOUGHT_MAX_LENGTH } from '@shared/limits';
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { addThought, deleteThought } from '../data/thoughts';
import { fail, ok, withUser } from './support';
import { readBody } from './params';

export const thoughtsApi = new Hono<HonoEnv>();

thoughtsApi.post('/thoughts', (c) =>
  withUser(c, async (user) => {
    const body = await readBody(c);
    const entryId = String(body.entry_id ?? '');
    const content = String(body.content ?? '').trim();
    if (!entryId) return fail(c, '缺少记录', 400);
    if (!content) return fail(c, '写点什么再保存吧', 400);
    if (content.length > THOUGHT_MAX_LENGTH) return fail(c, `想法太长了（最多 ${THOUGHT_MAX_LENGTH} 字）`, 400);
    // 想法只对整部作品，不绑某一集：请求里就算带了 episode 也忽略。
    const thought = await addThought(c.get('db'), user.id, entryId, content);
    if (!thought) return fail(c, '找不到这条记录', 404);
    return ok(c, { thought });
  }),
);

thoughtsApi.post('/thoughts/:id/delete', (c) =>
  withUser(c, async (user) => {
    // 与记录删除同理：0 行要如实回 404，否则前端弹「已删除」但列表没变。
    const changes = await deleteThought(c.get('db'), user.id, c.req.param('id'));
    if (changes === 0) return fail(c, '找不到这条想法', 404);
    return ok(c, {});
  }),
);
