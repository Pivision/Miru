import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** 悬停放大统一用这一份：各写各的时候漂成了 scale-[1.03] 与 scale-105 两种。 */
export const COVER_ZOOM = 'transition-transform duration-500 group-hover:scale-[1.03]';

/** 封面图：失败或无地址时退化成首字色块。尺寸圆角由调用方给。 */
export function Cover({
  src,
  alt,
  className,
  rounded = 'rounded-xl',
  chips,
}: {
  src?: string | null;
  alt: string;
  className?: string;
  rounded?: string;
  chips?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  // failed 必须跟着 src 复位：切番时组件实例被复用，不复位的话上一张图挂了会让下一部也只剩首字块。
  useEffect(() => setFailed(false), [src]);
  if (!src || failed) {
    return (
      <div className={cn('relative', rounded, className)}>
        <div
          className="absolute inset-0 flex items-center justify-center bg-muted text-lg font-semibold text-primary/60"
          aria-hidden
        >
          {alt.slice(0, 1)}
        </div>
        {/* 角标照常挂：图挂了不该连评分一起没掉。 */}
        {chips}
      </div>
    );
  }
  return (
    <>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn('bg-muted object-cover', rounded, className)}
      />
      {chips}
    </>
  );
}
