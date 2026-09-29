import React, { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Play, RotateCcw, ChevronUp } from 'lucide-react'
import AnimatedNumber from './AnimatedNumber'
import ProgressRing from '../components/ProgressRing'
import { useAnimStore } from './animStore'
import { MAX_LEVEL } from '../games/gameEngine'

/**
 * Shared "Session complete" experience for all games.
 * - Animated performance score (count-up) + progress ring.
 * - Animated metric tiles.
 * - AI-style insight reveal.
 * - Difficulty level visualization.
 * - Triggers the global level-up overlay based on the adaptive result.
 */
export default function GameResult({
  session,
  stats,
  insight,
  levelUp,
  onPlayAgain,
  onNext,
  onNextLevel,
  nextLevelLabel = 'Next level',
  playAgainLabel = 'Play again',
  nextLabel = 'Next activity',
}) {
  const triggerLevelUp = useAnimStore((s) => s.triggerLevelUp)
  const setRecentScore = useAnimStore((s) => s.setRecentScore)
  const score = session?.score ?? 0

  useEffect(() => {
    setRecentScore(score)
    if (levelUp && levelUp.level) {
      const t = setTimeout(() => {
        triggerLevelUp(levelUp.level, levelUp.direction || 'up', levelUp.message || '')
      }, 1500)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      className="card mt-6 text-center overflow-hidden relative"
      role="status"
      aria-live="polite"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Decorative glare */}
      <div
        className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-teal-400 to-transparent"
        aria-hidden="true"
      />

      <motion.h2
        className="text-3xl font-bold text-teal-700 mt-4"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', stiffness: 140, damping: 12 }}
      >
        🎉 {playAgainLabel === 'Play again' ? 'Activity complete!' : 'Excellent work!'}
      </motion.h2>

      {/* Animated score with ring */}
      <div className="mt-6 flex flex-col items-center gap-3">
        <p className="text-sm text-navy-500 uppercase tracking-widest font-semibold">
          Performance score
        </p>
        <ProgressRing
          value={score}
          size={120}
          strokeWidth={8}
          label={
            <span className="text-4xl font-black text-navy-800">
              <AnimatedNumber target={score} />
            </span>
          }
        />
        <p className="text-sm text-navy-400">out of 100</p>
      </div>

      {/* Metric grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 my-7">
        {(stats || []).map((s, i) => (
          <motion.div
            key={s.label}
            className="rounded-2xl bg-gradient-to-br from-mind to-teal-50 border border-teal-100 p-4"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 + i * 0.1 }}
            whileHover={{ y: -2 }}
          >
            <p className="text-sm text-navy-500 font-medium">{s.label}</p>
            <p className="text-2xl font-bold text-navy-800 mt-1">{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Challenge level display */}
      {levelUp?.level && (
        <motion.div
          className="max-w-sm mx-auto mb-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <p className="text-xs font-bold text-navy-400 uppercase tracking-widest mb-2">
            Challenge Level
          </p>
          <div className="flex items-center justify-center gap-2">
            {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((d) => (
              <motion.span
                key={d}
                className={`h-3.5 rounded-full transition-all duration-300 ${
                  d <= levelUp.level
                    ? levelUp.direction === 'down' && d === levelUp.level
                      ? 'bg-amber-400 w-10'
                      : 'bg-teal-500 w-10'
                    : 'bg-navy-100 w-6'
                }`}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6 + d * 0.08 }}
              />
            ))}
            <span className="ml-1 font-bold text-navy-700 text-lg">{levelUp.level}</span>
          </div>
          {levelUp.message && (
            <motion.p
              className="mt-2 text-teal-700 font-semibold"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              {levelUp.message}
            </motion.p>
          )}
        </motion.div>
      )}

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

      <div className="flex flex-wrap gap-4 justify-center pb-3">
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={onPlayAgain}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.97 }}
        >
          <RotateCcw size={18} className="inline mr-1.5" aria-hidden="true" />
          {playAgainLabel}
        </motion.button>
        {onNextLevel && (
          <motion.button
            type="button"
            className="btn-secondary"
            onClick={onNextLevel}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
          >
            <ChevronUp size={18} className="inline mr-1.5" aria-hidden="true" />
            {nextLevelLabel}
          </motion.button>
        )}
        {onNext && (
          <motion.button
            type="button"
            className="btn-primary"
            onClick={onNext}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.97 }}
          >
            <Play size={18} className="inline mr-1.5" aria-hidden="true" />
            {nextLabel}
          </motion.button>
        )}
      </div>
    </motion.div>
  )
}
