import { useEffect, useState } from 'react'

/**
 * Animated number that counts up to `value` over `duration` ms.
 */
export function CountUp({
  value,
  duration = 1200,
  suffix = '',
  prefix = '',
}: {
  value: number | null | undefined
  duration?: number
  suffix?: string
  prefix?: string
}) {
  const [display, setDisplay] = useState<number>(0)

  useEffect(() => {
    if (value == null) return
    const to = value
    // Snapshot starting point synchronously via functional update below.
    const start = performance.now()
    let rafId = 0
    let done = false

    setDisplay(prev => {
      const from = prev
      const tick = () => {
        if (done) return
        const p = Math.min(1, (performance.now() - start) / duration)
        const eased = 1 - Math.pow(1 - p, 3)
        setDisplay(Math.round(from + (to - from) * eased))
        if (p < 1) rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      return from
    })

    // Belt-and-suspenders: guarantee we land exactly on the target
    // regardless of strict-mode remounts or rAF drops.
    const settle = window.setTimeout(() => {
      done = true
      cancelAnimationFrame(rafId)
      setDisplay(to)
    }, duration + 80)

    return () => {
      // Don't cancel the settle — if our rAF loop is killed mid-flight
      // the settle is what gets us to the final number.
      void settle
    }
  }, [value, duration])

  if (value == null) return <span className="countup-skel" />
  return (
    <span className="countup">
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </span>
  )
}
