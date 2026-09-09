import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAnimStore } from './animStore'
import { getReducedMotion } from './device'

/**
 * A soft, elegant particle burst at a given (x, y) screen position.
 * Triggered via the global animStore (triggerBurst).
 * Non-intrusive: small floating nodes that expand and fade.
 */
export default function SuccessBurst() {
  const burst = useAnimStore((s) => s.burst)
  const [particles, setParticles] = useState([])

  useEffect(() => {
    if (!burst || getReducedMotion()) return
    const count = 8
    const seed = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4
      const dist = 26 + Math.random() * 30
      return {
        id: `${burst.id}-${i}`,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist,
        size: 5 + Math.random() * 7,
        hue: i % 2 === 0 ? '#2bb3a3' : '#4fd1c5',
      }
    })
    setParticles(seed)
    const t = setTimeout(() => setParticles([]), 1200)
    return () => clearTimeout(t)
  }, [burst])

  return (
    <AnimatePresence>
      {burst && particles.length > 0 && (
        <div
          className="pointer-events-none fixed inset-0 z-50"
          aria-hidden="true"
          style={{ position: 'fixed' }}
        >
          {particles.map((p) => (
            <motion.span
              key={p.id}
              className="absolute rounded-full"
              style={{
                width: p.size,
                height: p.size,
                background: p.hue,
                boxShadow: `0 0 ${p.size}px ${p.hue}55`,
                left: burst.x,
                top: burst.y,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
              animate={{ x: p.dx, y: p.dy, opacity: 0, scale: 1.1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          ))}
        </div>
      )}
    </AnimatePresence>
  )
}
