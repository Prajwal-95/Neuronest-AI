import React, { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAnimStore } from './animStore'
import { getReducedMotion } from './device'

/**
 * Premium 1-2s level-up / level-down sequence.
 * Reads from the global animStore (triggered on game completion).
 * Shows "LEVEL N" with a brief narrative and a calm reveal.
 */
export default function LevelUpOverlay() {
  const levelUp = useAnimStore((s) => s.levelUp)
  const clearLevelUp = useAnimStore((s) => s.clearLevelUp)
  const reduced = getReducedMotion()

  useEffect(() => {
    if (!levelUp) return
    const t = setTimeout(clearLevelUp, 2000)
    return () => clearTimeout(t)
  }, [levelUp, clearLevelUp])

  if (!levelUp) return null

  const isUp = levelUp.direction !== 'down'
  const isSame = levelUp.direction === 'same'

  // Reduced motion: simple static card, no big animation
  if (reduced) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/70 backdrop-blur-sm"
        role="status"
        aria-live="polite"
      >
        <div className="card text-center px-10 py-8">
          <p className="text-sm font-semibold text-teal-600 uppercase tracking-widest">
            {isUp ? 'Level up' : 'One step at a time'}
          </p>
          <p className="mt-2 text-4xl font-bold text-navy-800">Level {levelUp.level}</p>
          {levelUp.message && <p className="mt-2 text-navy-600">{levelUp.message}</p>}
        </div>
      </div>
    )
  }

  return (
    <AnimatePresence>
      <motion.div
        key={levelUp.seq}
        className="fixed inset-0 z-50 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        role="status"
        aria-live="polite"
      >
        {/* Dimmed backdrop */}
        <motion.div
          className="absolute inset-0 bg-navy-900/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4 }}
        />

        {/* Core burst that expands */}
        <motion.div
          className="relative"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.15, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 120, damping: 18 }}
        >
          <motion.div
            className="absolute inset-0 -m-10 rounded-full"
            style={{
              background: isUp
                ? 'radial-gradient(circle, rgba(43,179,163,0.35) 0%, transparent 70%)'
                : 'radial-gradient(circle, rgba(120,130,220,0.3) 0%, transparent 70%)',
            }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1.6, opacity: 1 }}
            transition={{ duration: 1.4, ease: 'easeOut' }}
          />

          <div className="card relative text-center px-12 py-9 overflow-hidden rounded-3xl shadow-2xl">
            <motion.p
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="text-xs font-bold text-teal-600 uppercase tracking-[0.25em]"
            >
              {isSame ? 'Steady progress' : isUp ? 'New challenge unlocked' : 'One step at a time'}
            </motion.p>

            <div className="flex items-baseline justify-center gap-2 mt-2">
              <motion.span
                className="text-6xl font-black text-navy-800"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.35, type: 'spring', stiffness: 160, damping: 14 }}
              >
                {levelUp.level}
              </motion.span>
              <span className="text-2xl font-bold text-navy-500">LEVEL</span>
            </div>

            {levelUp.message && (
              <motion.p
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="mt-3 text-navy-600 max-w-xs"
              >
                {levelUp.message}
              </motion.p>
            )}

            <motion.div
              className="mt-5 h-1.5 w-full bg-navy-100 rounded-full overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <motion.div
                className={`h-full ${isUp ? 'bg-teal-500' : 'bg-violet-400'}`}
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1, ease: 'easeInOut', delay: 0.55 }}
              />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
