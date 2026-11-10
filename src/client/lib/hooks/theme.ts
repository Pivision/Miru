import { Laptop, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useSyncExternalStore } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';

/** 三档文案只此一份：顶栏与设置页共用。 */
export const THEME_LABELS: Record<ThemeChoice, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};
export const THEME_ORDER: ThemeChoice[] = ['light', 'dark', 'system'];
/* 系统档用 Laptop，与「跟随系统」语义一致。 */
export const THEME_ICON: Record<ThemeChoice, LucideIcon> = { light: Sun, dark: Moon, system: Laptop };

const KEY = 'miru-theme';

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedTheme(): ThemeChoice {
  const value = window.localStorage.getItem(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  const dark = choice === 'dark' || (choice === 'system' && systemTheme() === 'dark');
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
}

/* 首屏防闪白在 public/theme-boot.js（index.html 同步加载），纯 SPA 无内联脚本所以 CSP 不用 nonce，也不需要 getServerSnapshot。 */

/* 模块级共享状态：任一处 setTheme 都广播给全部订阅者。 */
let current: ThemeChoice = 'system';
let started = false;
const listeners = new Set<() => void>();

/* HMR 会重新求值本模块、started 跟着重置，不先摘掉旧监听回调会层层累积。 */
let dispose: (() => void) | null = null;

function emit() {
  for (const listener of listeners) listener();
}

function readAndApply() {
  current = storedTheme();
  applyTheme(current);
  emit();
}

function start() {
  if (started) return;
  started = true;

  // 首屏脚本已挂过类名，这里只读状态。
  current = storedTheme();
  applyTheme(current);

  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onMediaChange = () => {
    if (current === 'system') {
      applyTheme('system');
      emit();
    }
  };
  media.addEventListener('change', onMediaChange);

  // 别的标签页改了主题，这边同步。
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) readAndApply();
  };
  window.addEventListener('storage', onStorage);

  dispose = () => {
    media.removeEventListener('change', onMediaChange);
    window.removeEventListener('storage', onStorage);
    started = false;
    dispose = null;
  };
}

if (import.meta.hot) {
  // 模块被替换前摘掉旧监听，新模块会重新 start。
  import.meta.hot.dispose(() => dispose?.());
}

function subscribe(listener: () => void) {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    // 订阅者清零就摘掉监听：否则组件全卸载后仍白跑 applyTheme，HMR 后旧闭包也一直挂着。start() 会重新装上。
    if (listeners.size === 0) dispose?.();
  };
}

/** 必须是纯函数：React 在 render 期反复调用它比对快照。 */
function getSnapshot(): ThemeChoice {
  return current;
}

export function setTheme(next: ThemeChoice) {
  current = next;
  if (next === 'system') window.localStorage.removeItem(KEY);
  else window.localStorage.setItem(KEY, next);
  applyTheme(next);
  emit();
}

/** 当前主题选择 + 切换函数。首帧防闪白已由 theme-boot.js 提前挂 .dark。 */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, getSnapshot);
  return { choice, setTheme };
}