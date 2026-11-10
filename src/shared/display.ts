import type { Entry, Subject, SubjectImages, Work } from './types';

/** 作品展示名：中文名优先，没有退回原名。搜索与排序要用原名，所以两个字段不能合并；展示一律走这里。 */
export function displayTitle(work: Pick<Work, 'title' | 'titleCn'>): string {
  return work.titleCn || work.title;
}

/** 上游条目展示名：同上，字段换成 name / nameCn。不能复用 displayTitle：硬套要在调用处手工拼对象，更容易漏。 */
export function subjectTitle(subject: Pick<Subject, 'name' | 'nameCn'>): string {
  return subject.nameCn || subject.name;
}

/** 总集数唯一口径：上游 eps 优先，缺失退回实际分集条数。Subject.eps（实时）与 Work.totalEps（写库快照）新鲜度不同，两边取数都走这里。 */
export function totalEpisodes(eps: number, fallback = 0): number {
  return eps > 0 ? eps : fallback;
}

/** 「已看 / 总集」文案，集数未知显示 ?。三处卡片共用。 */
export function episodeProgressText(progress: number, totalEps: number): string {
  const total = totalEpisodes(totalEps);
  return `${progress} / ${total > 0 ? total : '?'} 集`;
}

/** 是否看完：服务端的自动完成与客户端的 +1 禁用态共用。集数未知（0）时永远算没看完。 */
export function isFinished(entry: Pick<Entry, 'progress' | 'totalEps'>): boolean {
  return entry.totalEps > 0 && entry.progress >= entry.totalEps;
}

/** 封面取图：唯一兜底链，顺序 large → common → medium → grid → small。 */
export function pickCover(images: SubjectImages | null | undefined): string {
  if (!images) return '';
  return images.large || images.common || images.medium || images.grid || images.small || '';
}
