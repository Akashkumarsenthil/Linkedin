import type { CSSProperties } from 'react'

export function Icon({ name, size = 20, className, style }: { name: string; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} className={className} style={style} aria-hidden="true">
      <use href={`/icons.svg#ic-${name}`} />
    </svg>
  )
}
