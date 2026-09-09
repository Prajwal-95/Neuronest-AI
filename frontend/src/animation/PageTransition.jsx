import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLocation } from 'react-router-dom'
import { getReducedMotion } from './device'

/**
 * Cinematic page transition wrapper for the Outlet region.
 * Uses a subtle spatial move + blur + scale rather than a plain fade.
 * Respects prefers-reduced-motion.
 */
export default function PageTransition({ children }) {
  const location = useLocation()
  const reduced = getReducedMotion()

  if (reduced) {
    // Reduced motion: simple opacity only
    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, scale: 0.985, filter: 'blur(6px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 1.01, filter: 'blur(4px)' }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
