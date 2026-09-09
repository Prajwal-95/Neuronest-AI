import React from 'react'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'

/**
 * A single "activity portal" card — the interactive entry point to a game.
 * Combines an animated gradient header with 3D tilt on hover and
 * touch-friendly press feedback. Each game has a distinct visual identity.
 */
export default function ActivityPortal({
  game,
  name,
  description,
  onStart,
  gradient,
  icon: Icon,
  delay = 0,
}) {
  return (
    <motion.button
      type="button"
      onClick={() => onStart(game)}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -6 }}
      whileTap={{ scale: 0.97 }}
      className="card group text-left overflow-hidden !p-0 neural-tilt"
      aria-label={`${name}. ${description}. Start.`}
    >
      {/* Header with distinct gradient + floating icon */}
      <div className={`bg-gradient-to-br ${gradient} text-white p-6 flex items-center gap-4 relative overflow-hidden`}>
        <motion.span
          aria-hidden="true"
          className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10"
          animate={{ scale: [1, 1.15, 1], rotate: [0, 8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <span className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 nx-float">
          <Icon size={30} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-bold leading-tight">{name}</h2>
          <p className="text-white/80 text-sm mt-0.5">Level {game.level ?? 1}</p>
        </div>
      </div>

      <div className="p-5">
        <p className="text-navy-600 mb-4">{description}</p>
        <span className="inline-flex items-center gap-1 text-teal-600 font-semibold">
          Play
          <ChevronRight
            size={18}
            className="group-hover:translate-x-1 transition-transform"
            aria-hidden="true"
          />
        </span>
      </div>
    </motion.button>
  )
}
