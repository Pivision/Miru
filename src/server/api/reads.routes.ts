/** 读接口：页面首屏数据都从这里取。取数在 ../data/read-models，这里只做「解析查询串 → 调它 → 包成 JSON」。登录要求只有两档：匿名可读（/session、/home、/discover、/subject/:id）与 withUser 必须登录（/library、/settings）。 */
import { Hono } from 'hono';
import type { HonoEnv } from '../env';
import { loadDiscover, loadHome, loadLibrary, loadSettings, loadSubject } from '../data/read-models';
import { readLibraryFilters } from '@shared/library-filters';
import { bangumiFail, fail, ok, withUser } from './support';
import { positiveInt } from './params';

export const readsApi = new Hono<HonoEnv>();

/** 当前登录用户。必须走 ok(c, data)：前端 getJson 只返回 payload.data，少这一层会让 useSession 永远拿到 undefined，侧栏账号卡片与登录守卫一起空转。 */
readsApi.get('/session', async (c) => ok(c, { user: await c.get('loadUser')() }));

readsApi.get('/home', async (c) => {
  const data = await loadHome(c.env, c.get('db'), await c.get('loadUser')());
  return ok(c, data);
});

readsApi.get('/library', (c) =>
  withUser(c, async (user) => {
    const filters = readLibraryFilters(new URL(c.req.url).searchParams);
    const data = await loadLibrary(c.get('db'), user, filters);
    return ok(c, data);
  }),
);

readsApi.get('/discover', async (c) => {
  // 搜索与放送表是两条不相干的上游，失败语义也不同：放送表挂了只让区块空掉，搜索挂了必须报给用户。混在一个出口里，上游抖一下就会把「只是没搜到」变成整页 502。
  try {
    const data = await loadDiscover(c.env, c.get('db'), await c.get('loadUser')(), new URL(c.req.url).searchParams);
    return ok(c, data);
  } catch (error) {
    return bangumiFail(c, error);
  }
});

readsApi.get('/subject/:id', async (c) => {
  const id = positiveInt(c.req.param('id'));
  if (id === null) return fail(c, '条目不存在', 404);
  const data = await loadSubject(c.env, c.get('db'), await c.get('loadUser')(), id);
  if (!data) return fail(c, '条目不存在', 404);
  // 上游挂了也给 200：页面要能显示「暂时取不到」并保留重试按钮。
  return ok(c, data);
});

readsApi.get('/settings', (c) =>
  withUser(c, async (user) => {
    const data = await loadSettings(c.get('db'), user);
    return ok(c, data);
  }),
);
