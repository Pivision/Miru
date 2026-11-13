/** 侧栏与移动端底栏：同一组导航条目，只视觉不同。每条都显式写 end：只有首页需要精确匹配，写全了类型才一致。 */
import { NavLink } from 'react-router';
import { Bookmark, Compass, Home, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Brand } from '@/components/layout/brand';
import { UserCard } from '@/components/layout/user-card';
import { ThemeButton } from '@/components/layout/top-bar';

const NAV = [
  { to: '/', label: '首页', icon: Home, end: true },
  { to: '/library', label: '书架', icon: Bookmark, end: false },
  { to: '/discover', label: '发现', icon: Compass, end: false },
];

/** 侧栏与底栏共用的条目：NAV 再加「设置」。 */
const NAV_WITH_SETTINGS = [...NAV, { to: '/settings', label: '设置', icon: Settings, end: false }];

/** 侧栏 NavLink 样式，条目间共用一份。 */
function sidebarLinkClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
    isActive && 'bg-card text-foreground shadow-xs',
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border/70 bg-card/80 px-4 py-5 lg:flex">
      <div className="px-2">
        <Brand />
      </div>
      {/* 侧栏与底栏是两个导航地标，各给一个名字好让读屏区分。 */}
      <nav aria-label="主导航" className="flex flex-col gap-1">
        {NAV_WITH_SETTINGS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={sidebarLinkClass}>
            <item.icon className="size-4.5" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3">
        <UserCard />
        <ThemeButton />
      </div>
    </aside>
  );
}

/** 移动端底栏：与侧栏是同一组条目，窄屏时替代侧栏。 */
export function MobileTabBar() {
  return (
    <nav
      aria-label="底部导航"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {NAV_WITH_SETTINGS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 whitespace-nowrap py-2.5 text-2xs font-medium text-muted-foreground transition-colors',
                isActive && 'text-primary',
              )
            }
          >
            <item.icon className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
