import React from 'react'
import { ArrowLeft, Volume2 } from 'lucide-react'
import { motion } from 'framer-motion'

/**
 * Consistent game page header: Back, animated title, level badge,
 * and voice instructions button.
 */
export default function GameHeader({ title, level, voiceInstruction, onBack }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <button
        type="button"
        onClick={onBack}
        className="btn-secondary !px-4 !py-2 flex items-center gap-2"
      >
        <ArrowLeft size={20} aria-hidden="true" /> Back
      </button>
      <motion.h1
        className="text-2xl font-bold text-navy-800 text-center"
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {title}
      </motion.h1>
      <button
        type="button"
        aria-label="Replay instructions"
        onClick={voiceInstruction}
        className="btn-secondary !px-4 !py-2 flex items-center gap-2"
      >
        <Volume2 size={20} aria-hidden="true" /> Instructions
      </button>
    </div>
  )
}

/**
 * Level + description line with a subtle animated badge.
 */
export function GameMeta({ level, children }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-700 bg-mind rounded-full px-3 py-1">
        <span className="w-2 h-2 rounded-full bg-teal-500 nx-glow" aria-hidden="true" />
        LEVEL {level}
      </span>
      <p className="text-navy-600">{children}</p>
    </div>
  )
}