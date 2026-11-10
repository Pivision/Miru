import { Link } from 'react-router';
import { ArrowUpRight, CalendarDays, Film, Tv } from 'lucide-react';
import type { Entry, SessionUser, Subject } from '@shared/types';
import { LOGIN_PATH } from '@shared/routes';
import { subjectTitle } from '@shared/display';
import { fmtDate } from '@/lib/time-format';
import { Button } from '@/components/ui/button';
import { Cover } from '@/components/features/entry/cover-image';
import { QuickAdd } from '@/components/features/record/quick-add';
import { QuickTrack } from '@/components/features/record/record-panel';

/** 详情页 hero：通栏背景 + 海报 + 标题信息 + 行动行 + 记录条。 */
export function SubjectHero({
  subject,
  entry,
  user,
  path,
  cover,
}: {
  subject: Subject;
  entry: Entry | null;
  user: SessionUser | null;
  /** 当前详情页路径，用于登录回跳的 `?next=`。 */
  path: string;
  cover: string | null;
}) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* 沉浸式背景：海报放大铺满 hero，向下渐隐进页面底色。整层 pointer-events-none + aria-hidden，不挡交互。 */}
      {cover && (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <img
            src={cover}
            alt=""
            className="absolute inset-0 size-full scale-110 object-cover object-[center_30%] blur-lg saturate-150 [-webkit-mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.88)_40%,rgba(0,0,0,0.45)_70%,transparent_100%)] [mask-image:linear-gradient(to_bottom,black_0%,rgba(0,0,0,0.88)_40%,rgba(0,0,0,0.45)_70%,transparent_100%)]"
          />
          {/* 遮罩与 mask 一起收到底色。终点必须是 --background：用 --card 会在 hero 下半刷出一条更亮的色带。顶部这档 0.52：0.26 时深色海报上面包屑对比度会掉到 2:1 以下。 */}
          <div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--background)/0.52)_0%,hsl(var(--background)/0.62)_38%,hsl(var(--background)/0.78)_72%,hsl(var(--background))_100%)] dark:bg-[linear-gradient(to_bottom,hsl(var(--background)/0.6)_0%,hsl(var(--background)/0.68)_40%,hsl(var(--background)/0.88)_74%,hsl(var(--background))_100%)]" />
        </div>
      )}

      <div className="relative mx-auto w-full max-w-content px-4 pb-8 pt-5 lg:px-8 lg:pb-10 lg:pt-6">
        {/* 面包屑直接浮在背景上、不垫色块，靠抬高顶部遮罩 alpha 保证可读。不要再套 flex-col：只有一个子项，gap 永不生效。 */}
        <nav aria-label="面包屑" className="flex items-center gap-1.5 text-2xs leading-snug text-muted-foreground">
          <Link to="/discover" className="hover:text-foreground">
            发现
          </Link>
          {/* 分隔符纯装饰，aria-hidden 免得读屏念成斜杠。 */}
          <span aria-hidden>/</span>
          <span className="truncate text-foreground/80">{subjectTitle(subject)}</span>
        </nav>

        <div className="mt-4 grid gap-5 sm:grid-cols-[168px_minmax(0,1fr)] sm:gap-6">
          <div className="relative mx-auto w-[140px] sm:mx-0 sm:w-[168px]">
            {/* 海报不加投影：背景已是模糊海报，叠阴影会显脏，只留一圈极淡描边。 */}
            <Cover src={cover} alt={subjectTitle(subject)} className="aspect-[5/7] w-full ring-1 ring-foreground/5" />
          </div>

          <div className="min-w-0">
            {/* 响应式字号要连行高一起写：.sm:text-3xl 在产物里排在 .leading-tight 之后，会把行高顶成 1.2，所以要补 sm:leading-tight。 */}
            <h1 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl sm:leading-tight">
              {subjectTitle(subject)}
            </h1>
            {subject.nameCn && subject.name !== subject.nameCn && (
              <p className="mt-0.5 text-sm leading-snug text-muted-foreground">{subject.name}</p>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs leading-snug text-muted-foreground">
              {subject.date && (
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="size-3.5" /> {fmtDate(subject.date)}
                </span>
              )}
              {subject.platform && (
                <span className="inline-flex items-center gap-1">
                  <Tv className="size-3.5" /> {subject.platform}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Film className="size-3.5" /> {subject.eps > 0 ? `${subject.eps} 集` : '集数未知'}
              </span>
            </div>

            {subject.metaTags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {/* 只作展示不参与跳转。去重已在服务端归一化时做过；这里只按本页要显示的数量截断。 */}
                {subject.metaTags.slice(0, 8).map((tag) => (
                  <span key={tag} className="rounded-full bg-accent px-2 py-0.5 text-2xs leading-snug text-accent-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* 行动行不用 ml-auto：flex-wrap 换行后它会独占一行贴右、位置发飘，让 gap 分隔即可。 */}
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
              {!user && (
                <Button asChild size="sm">
                  <Link to={`${LOGIN_PATH}?next=${encodeURIComponent(path)}`}>登录后记录</Link>
                </Button>
              )}
              {user && !entry && <QuickAdd subject={subject} />}
              <a
                href={`https://bgm.tv/subject/${subject.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-2xs leading-snug text-muted-foreground hover:text-primary"
              >
                在 Bangumi 查看 <ArrowUpRight className="size-3" />
              </a>
            </div>

            {/* 状态、评分、起止日期、删除都住在这一条里：按钮并成一行，日期点开才是面板，不把 hero 顶高。 */}
            {user && entry && <QuickTrack subject={subject} entry={entry} />}
          </div>
        </div>
      </div>
    </section>
  );
}
