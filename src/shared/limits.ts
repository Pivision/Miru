/** 全站共用的量级上限：同一条上限被前后端各用一次，各写一遍就会漂开。 */

/** 想法字数上限。 */
export const THOUGHT_MAX_LENGTH = 2000;

/** 列表每页条数，服务端分页与前端文案共用。 */
export const PAGE_SIZE = 24;

/** 页号上限：再大就是上游不接受的 offset 量级。 */
export const MAX_PAGE = 10_000;

/** 昵称长度上限：服务端超长报 400 与输入框 maxLength 必须是同一个数，否则用户填完才被拒。 */
export const NAME_MAX_LENGTH = 24;

/** 密码长度下限：Better Auth 的 minPasswordLength、服务端校验与三个表单的 minLength 都引用这一条。 */
export const PASSWORD_MIN_LENGTH = 8;

/** 搜索词长度上限：更长既不会命中更多，还会撑大缓存 key。 */
export const QUERY_MAX_LENGTH = 80;
