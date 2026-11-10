import type { Stats } from '@shared/types';
import { cn } from '@/lib/utils';
import { THEME_ICON, THEME_LABELS, THEME_ORDER, useTheme } from '@/lib/hooks/theme';
import { Separator } from '@/components/ui/separator';
import { Section } from '@/components/features/settings/settings-parts';

type AppearanceStats = Pick<Stats, 'total' | 'watching' | 'completed'>;

/** 主题状态来自 useTheme 的单一订阅源，切换后侧栏与顶栏的主题按钮会同时变。 */
export function AppearanceSection({ stats }: { stats: AppearanceStats }) {
  const { choice, setTheme } = useTheme();
  return (
    <Section title="外观" hint="深色模式会跟随系统，也可以手动固定。">
      <div className="flex flex-wrap gap-2">
        {THEME_ORDER.map((value) => {
          const Icon = THEME_ICON[value];
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              /* 选中态原本只体现在配色上，读屏听不出来；这里补上 aria-pressed。 */
              aria-pressed={choice === value}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                choice === value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/80 text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {THEME_LABELS[value]}
            </button>
          );
        })}
      </div>

      <Separator className="my-4" />

      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: '记录', value: stats.total },
          { label: '在看', value: stats.watching },
          { label: '看完', value: stats.completed },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-muted/60 px-2 py-2.5">
            {/* dt 必须在 dd 前面：dl 的语义要求先术语后描述，反过来读屏会读成「3 看完」。 */}
            <dt className="text-2xs text-muted-foreground">{item.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
