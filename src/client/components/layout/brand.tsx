import { Link } from 'react-router';

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-full transition-transform group-hover:-rotate-6">
        <svg viewBox="0 0 1000 1000" className="size-9" aria-hidden>
          {/* 颜色与几何都写死，与 public/favicon.svg 逐字对应（同为 1000 坐标系）：改图形要两边一起改，否则两处图标会长得不一样。 */}
          <rect width="1000" height="1000" rx="300" fill="#12544F" />
          <g fill="#8BBB92">
            <rect x="280" y="195" width="210" height="90" rx="45" />
            <rect x="280" y="368.3" width="440" height="90" rx="45" />
            <rect x="280" y="541.7" width="440" height="90" rx="45" />
            <rect x="280" y="715" width="210" height="90" rx="45" />
          </g>
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-lg font-semibold tracking-tight">Miru</span>
          <span className="block text-2xs text-muted-foreground">下一幕</span>
        </span>
      )}
    </Link>
  );
}
