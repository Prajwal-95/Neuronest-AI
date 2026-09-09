import React, { useEffect, useRef, useState } from 'react'
import { getReducedMotion } from './device'

/**
 * Animates a number counting up from 0 to `target` on mount.
 * Falls back to instant display if reduced-motion is active.
 */
export default function AnimatedNumber({
  target,
  duration = 1200,
  suffix = '',
  prefix = '',
  decimals = 0,
  className = '',
}) {
  const [display, setDisplay] = useState(getReducedMotion() ? target : 0)
  const rafRef = useRef(null)
  const startRef = useRef(null)
  const reducedMotion = getReducedMotion()

  useEffect(() => {
    if (reducedMotion) {
      setDisplay(target)
      return
    }

    startRef.current = performance.now()
    const from = 0
    const to = target

    const animate = (now) => {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const current = from + (to - from) * eased
      setDisplay(current)

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration, reducedMotion])

  const rounded = Number(display).toFixed(decimals)
  return (
    <span className={className} aria-label={`${prefix}${target}${suffix}`}>
      {prefix}{rounded}{suffix}
    </span>
  )
}
