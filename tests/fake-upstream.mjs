/** 离线假上游：把 Bangumi 的四个端点按真实响应形状喂回来。没有它，断网时「记录」「发现页」只能整体 skip——那正是最核心的写入链路，而 skip 看起来和全绿几乎一样。不引入依赖、不进产物；只保留 normalize.ts 会读的键，字段用上游的蛇形写法。 */
import { createServer } from 'node:http';

/** 芙莉莲：28 集，够覆盖「进度越界钳制」与「看满自动完成」两条分支。 */
export const SUBJECT = {
  id: 400602,
  name: '葬送のフリーレン',
  name_cn: '葬送的芙莉莲',
  date: '2023-09-29',
  eps: 28,
  platform: 'TV',
  summary: '勇者一行打倒魔王之后的故事。',
  score: 8.9,
  votes: 12000,
  rating: { count: { 1: 10, 2: 20, 3: 30, 4: 40, 5: 50, 6: 60, 7: 70, 8: 80, 9: 90, 10: 100 } },
  meta_tags: ['TV', '日本'],
  infobox: [{ key: '中文名', value: '葬送的芙莉莲' }],
  images: { large: 'https://bgmimg.anibt.net/r/400/a.jpg' },
};

/** 第二部：只在验「排序真的按 key 排」时需要。书名升序是白箱在前、评分降序是芙莉莲在前，两条 key 首条正好相反，单条记录分不出方向。 */
export const SECOND = {
  ...SUBJECT,
  id: 400603,
  name: 'SHIROBAKO',
  name_cn: '白箱',
  eps: 24,
  infobox: [{ key: '中文名', value: '白箱' }],
};

const SEARCH = { data: [SUBJECT], total: 1 };

/** 放送表：固定七天，每天同一部，保证「今日放送」非空。 */
const CALENDAR = [1, 2, 3, 4, 5, 6, 7].map((id) => ({
  weekday: { id, cn: `星期${id}` },
  items: [{ id: SUBJECT.id, name: SUBJECT.name, name_cn: SUBJECT.name_cn, images: SUBJECT.images }],
}));

/** 分集：id 从 900001 起，避开服务端占位集的 id: index + 1，否则分不出真分集与兜底占位。 */
const EPISODES = {
  data: Array.from({ length: 28 }, (_, i) => ({
    id: 900001 + i,
    sort: i + 1,
    ep: i + 1,
    name: `第${i + 1}话`,
    name_cn: `第${i + 1}话`,
    airdate: '2023-09-29',
  })),
};

function handler(req, res) {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (url.pathname === `/v0/subjects/${SUBJECT.id}`) return send(200, SUBJECT);
  if (url.pathname === `/v0/subjects/${SECOND.id}`) return send(200, SECOND);
  // 参数错误探针：bangumiFail 有「400/404 原样透传」分支，旧实现下 HTTP 层把 400 折成 502，这条分支永远到不了。留个探针钉住它。
  if (url.pathname === '/v0/subjects/400001') return send(400, { title: 'Bad Request' });
  if (url.pathname === '/v0/search/subjects') return send(200, SEARCH);
  if (url.pathname === '/calendar') return send(200, CALENDAR);
  if (url.pathname === '/v0/episodes') return send(200, EPISODES);
  return send(404, { title: 'Not Found', description: `假上游没有 ${url.pathname} 这个端点` });
}

/** 起一个假上游，返回 base 地址与关闭句柄。 */
export function startFakeUpstream(port) {
  const server = createServer(handler);
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
