import type { ReactNode } from 'react';
import { useLocation } from 'react-router';
import { isAuthPath, SUBJECT_PREFIX } from '@shared/routes';
import { Brand } from '@/components/layout/brand';
import { MobileTabBar, Sidebar } from '@/components/layout/sidebar';
import { SearchBox, ThemeButton } from '@/components/layout/top-bar';

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isAuth = isAuthPath(location.pathname);
  // 详情页的 hero 背景要通栏铺满（背景图放在卡片外面），所以 main 在详情页不再提供
  // max-w-content 与左右/顶部内边距，改由页面自己给内容层套 1280px 容器。
  const isWide = location.pathname.startsWith(SUBJECT_PREFIX);

  if (isAuth) {
    return (
      <div className="relative flex min-h-dvh flex-col bg-background">
        <header className="flex items-center justify-between px-5 py-5 sm:px-8">
          <Brand />
          <ThemeButton />
        </header>
        <main className="flex flex-1 items-center justify-center px-4 pb-14 pt-2">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <Sidebar />
      {/* 滚动条占位统一交给 globals.css 里的 html 规则，这里不要再挂 scrollbarGutter。 */}
      <div className="flex min-h-dvh min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-border/60 bg-background/85 backdrop-blur-md">
          {/* 顶栏与正文共用同一套栅格：同样的左右内边距 + 同样的 max-w-content 上限 */}
          <div className="mx-auto flex w-full max-w-content items-center gap-3 px-4 py-3 lg:px-8">
            <div className="lg:hidden">
              <Brand compact />
            </div>
            <SearchBox />
            <div className="hidden sm:block">
              <ThemeButton compact />
            </div>
          </div>
        </header>
        {/*
          正文两侧留白比顶栏搜索条小（16 vs 32）：正文更贴窗口，搜索条往里收一档。
          正文仍有最大宽度，宽屏或页面缩小倍率后不会无限变宽、封面也不会被撑大；
          代价是视口够宽时正文会居中，与搜索条左缘错开。
        */}
        <main
          className={
            isWide
              ? 'w-full flex-1 pb-28 lg:pb-16'
              : 'mx-auto w-full max-w-content flex-1 px-4 pb-28 pt-6 lg:px-8 lg:pb-16 lg:pt-8'
          }
        >
          {children}
        </main>
        <footer className="hidden border-t border-border/60 px-4 py-4 text-2xs text-muted-foreground lg:block lg:px-8">
          Miru · 数据来自 Bangumi
        </footer>
      </div>
      <MobileTabBar />
    </div>
  );
}
