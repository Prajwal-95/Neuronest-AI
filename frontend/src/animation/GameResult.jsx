import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import { useAnimStore } from './animStore'

/**
 * Shared "Session complete" experience for all games.
 * - Animated performance score (count-up).
 * - Animated metric tiles.
 * - An AI-style insight reveal (node -> connection -> card).
 * - Triggers the global level-up overlay based on the adaptive result.
 *
 * stats: [{ label, value }] for the metric grid.
 * insight: { title, text }
 * levelUp: { level, direction, message }
 * onPlayAgain / onNext
 */
export default function GameResult({
  session,
  stats,
  insight,
  levelUp,
  onPlayAgain,
  onNext,
  playAgainLabel = 'Play again',
  nextLabel = 'Next activity',
}) {
  const triggerLevelUp = useAnimStore((s) => s.triggerLevelUp)
  const setRecentScore = useAnimStore((s) => s.setRecentScore)
  const score = session?.score ?? 0

  // Notify the global store and trigger the level-up overlay once.
  useEffect(() => {
    setRecentScore(score)
    if (levelUp && levelUp.level) {
      // Small delay so the completion reveal lands first
      const t = setTimeout(() => {
        triggerLevelUp(levelUp.level, levelUp.direction || 'up', levelUp.message || '')
      }, 1500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="card mt-6 text-center overflow-hidden"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.h2
        className="text-3xl font-bold text-teal-700 mt-2"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 140, damping: 12 }}
      >
        🎉 Activity complete!
      </motion.h2>

      {/* Animated score */}
      <div className="mt-6">
        <p className="text-sm text-navy-500 uppercase tracking-widest font-semibold">Performance score</p>
        <p className="text-6xl font-black text-navy-800 mt-1">
          <AnimatedNumber target={score} />
        </p>
        <p className="text-sm text-navy-400">out of 100</p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-7">
        {(stats || []).map((s, i) => (
          <motion.div
            key={s.label}
            className="rounded-2xl bg-mind p-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.1 }}
          >
            <p className="text-sm text-navy-500 font-medium">{s.label}</p>
            <p className="text-2xl font-bold text-navy-800 mt-1">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* AI insight reveal */}
      {insight && (
        <div className="max-w-2xl mx-auto mb-6 text-left">
          <motion.div
            className="rounded-2xl border border-teal-200 bg-mind p-4 flex items-start gap-3"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            <span className="mt-0.5 text-teal-600 shrink-0">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-bold text-teal-700 uppercase tracking-widest mb-1">
                {insight.title || 'AI recommendation'}
              </p>
              <p className="text-navy-700">{insight.text}</p>
            </div>
          </motion.div>
        </div>
      )}

      <div className="flex flex-wrap gap-4 justify-center pb-2">
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={onPlayAgain}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          {playAgainLabel}
        </motion.button>
        {onNext && (
          <motion.button
            type="button"
            className="btn-primary"
            onClick={onNext}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
          >
            {nextLabel}
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
