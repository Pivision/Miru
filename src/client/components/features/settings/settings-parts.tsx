import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { SectionTitle } from '@/components/layout/page-header';

export function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card as="section">
      <SectionTitle size="md" className="mb-0">{title}</SectionTitle>
      {hint && <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{hint}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

/** 单个开关：只在设置页用，受控 + 外部保存按钮，点一下不会立刻落库。 */
export function SwitchRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-border/70 px-3 py-2.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-xs font-medium">
          {label}
        </label>
        <p id={hintId} className="mt-0.5 text-2xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hintId}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors disabled:opacity-50',
          checked ? 'border-primary bg-primary' : 'border-border bg-muted',
        )}
      >
        <span
          className={cn(
            'absolute top-1/2 size-3.5 -translate-y-1/2 rounded-full bg-background shadow-xs transition-all',
            checked ? 'left-[18px]' : 'left-[3px]',
          )}
        />
      </button>
    </div>
  );
}