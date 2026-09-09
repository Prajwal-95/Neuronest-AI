import React from 'react'
import { motion } from 'framer-motion'
import { getReducedMotion } from './device'

/**
 * Generic card with subtle 3D hover tilt + lift.
 * Touch devices: press feedback instead.
 * Respects prefers-reduced-motion (static).
 */
export default function TiltCard({ children, className = '', as = 'div' }) {
  const reduced = getReducedMotion()

  if (reduced) {
    return <div className={className}>{children}</div>
  }

  return (
    <motion.div
      className={`neural-tilt ${className}`}
      whileHover={{ y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18 }}
    >
      {children}
    </motion.div>
  )
}