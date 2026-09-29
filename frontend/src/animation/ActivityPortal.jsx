import React from 'react'
import { motion } from 'framer-motion'
import { ChevronRight, Clock, TrendingUp } from 'lucide-react'
import { getReducedMotion } from './device'
import { useI18n } from '../services/i18n'

/**
 * A premium \"activity portal\" card — the interactive entry point to a game.
 * Each game has a distinct visual identity with gradient header,
 * animated icon, difficulty indicator, and progress.
 */
export default function ActivityPortal({
  game,
  name,
  description,
  onStart,
  icon: Icon,
  delay = 0,
}) {
  const reduced = getReducedMotion()
  const { tr } = useI18n()
  const level = game.level ?? 1
  const graded = `game-gradient-${game.gradientClass || 'memory'}`

  return (
    <motion.button
      type="button"
      onClick={() => onStart(game)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={reduced ? {} : { y: -8, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      className="card group text-left overflow-hidden !p-0 neural-tilt hover:shadow-card-hover"
      aria-label={`${name}. ${description}. Level ${level}. Start.`}
    >
      {/* Header with distinct gradient + floating icon */}
      <div className={`${graded} text-white p-6 flex items-center gap-4 relative overflow-hidden`}>
        {/* Decorative circles */}
        <motion.span
          aria-hidden="true"
          className="absolute -right-8 -top-8 w-28 h-28 rounded-full bg-white/10"
          animate={reduced ? {} : { scale: [1, 1.2, 1], rotate: [0, 10, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          aria-hidden="true"
          className="absolute -bottom-10 -left-6 w-24 h-24 rounded-full bg-white/5"
          animate={reduced ? {} : { scale: [1, 1.15, 1] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
        />

        <motion.span
          className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0"
          animate={reduced ? {} : { y: [0, -4, 0] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <Icon size={30} aria-hidden="true" />
        </motion.span>
        <div>
          <h2 className="text-xl font-bold leading-tight">{name}</h2>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1 text-white/90 text-sm font-semibold">
              <TrendingUp size={14} aria-hidden="true" /> {tr('games.level')} {level}
            </span>
            <span className="inline-flex items-center gap-1 text-white/80 text-sm">
              <Clock size={14} aria-hidden="true" /> {game.duration || '3-5 min'}
            </span>
          </div>
        </div>
      </div>

      <div className="p-5">
        <p className="text-navy-600 mb-4 leading-relaxed">{description}</p>

        {/* Difficulty dots */}
        <div className="flex items-center gap-1.5 mb-4" aria-label={`${tr('games.level')} ${level} / 5`}>
          {[1, 2, 3, 4, 5].map((d) => (
            <span
              key={d}
              className={`h-2 rounded-full transition-all duration-300 ${
                d <= level ? 'bg-teal-500 w-6' : 'bg-navy-100 w-3'
              }`}
              aria-hidden="true"
            />
          ))}
          <span className="ml-2 text-xs font-medium text-navy-400">
            {tr('games.level')} {level}/5
          </span>
        </div>

        <span className="inline-flex items-center gap-2 text-teal-600 font-bold text-lg group-hover:text-teal-700 transition-colors">
          {tr('games.play')} now
          <ChevronRight
            size={20}
            className="group-hover:translate-x-1.5 transition-transform"
            aria-hidden="true"
          />
        </span>
      </div>
    </motion.button>
  )
}
