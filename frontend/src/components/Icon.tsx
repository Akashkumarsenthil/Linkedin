export function Icon({ name, size = 20, className }: { name: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} className={className} aria-hidden="true">
      <use href={`/icons.svg#ic-${name}`} />
    </svg>
  )
}
