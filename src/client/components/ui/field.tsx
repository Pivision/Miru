import type { ComponentProps, ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * 一个字段：Label + Input。`hint` 是 Label 里的浅色补充（例如「（没有就留空）」），
 * `footer` 是输入框下方的说明文字，其余属性原样透传给 Input（type / autoComplete / required / minLength / placeholder…）。
 *
 * 登录注册页、设置页的资料与密码表单共用这一份，改内边距或标签样式只改这里。
 */
export function Field({
  id,
  label,
  hint,
  footer,
  ...input
}: {
  id: string;
  label: string;
  hint?: string;
  footer?: ReactNode;
} & ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {hint ? <span className="font-normal text-muted-foreground">{hint}</span> : null}
      </Label>
      {/* footer 说明的是这个输入框本身（例如「邮箱不可修改」），要挂到 input 上读屏才听得到，
          只放在旁边当普通文本就只有看得见的人知道。 */}
      <Input id={id} aria-describedby={footer ? `${id}-footer` : undefined} {...input} />
      {footer ? (
        <p id={`${id}-footer`} className="text-2xs text-muted-foreground">
          {footer}
        </p>
      ) : null}
    </div>
  );
}
