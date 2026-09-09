import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getReducedMotion } from './device'

/**
 * Anticipation sequence when starting an activity: a calm 3-2-1
 * with the environment "preparing". Then "BEGIN". 2.4s total.
 * Renders children (the actual game) only after the sequence completes.
 */
export default function GameStartSequence({ onDone, children }) {
  const [count, setCount] = useState(3)
  const [showBegin, setShowBegin] = useState(false)
  const [started, setStarted] = useState(false)
  const reduced = getReducedMotion()

  useEffect(() => {
    if (reduced) {
      setStarted(true)
      onDone && onDone()
      return
    }
    const steps = [
      setTimeout(() => setCount(2), 800),
      setTimeout(() => setCount(1), 1600),
      setTimeout(() => {
        setShowBegin(true)
        setTimeout(() => {
          setStarted(true)
          onDone && onDone()
        }, 700)
      }, 2400),
    ]
    return () => steps.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (started) return <>{children}</>

  return (
    <div className="flex flex-col items-center justify-center py-20" aria-live="polite">
      <p className="text-navy-500 mb-8 text-lg tracking-wide uppercase">
        Preparing your cognitive activity
      </p>
      <div className="relative w-28 h-28 flex items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ border: '3px solid var(--nx-teal)' }}
          initial={{ scale: 0.4, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 0 }}
          transition={{ duration: 0.8, repeat: Infinity }}
        />
        {showBegin ? (
          <motion.span
            key="begin"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 180, damping: 14 }}
            className="text-5xl font-black text-teal-600"
          >
            GO
          </motion.span>
        ) : (
          <AnimatePresence mode="wait">
            <motion.span
              key={count}
              initial={{ scale: 1.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="text-5xl font-black text-navy-800"
            >
              {count}
            </motion.span>
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
