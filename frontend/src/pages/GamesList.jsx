import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Grid3x3, ListOrdered, Crosshair, Calculator, BookOpen, Sparkles, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'
import ActivityPortal from '../animation/ActivityPortal'
import { useAnimStore } from '../animation/animStore'

const LEVEL_KEYS = {
  memory_match: 'neuronest_memory_level',
  sequence_recall: 'neuronest_sequence_level',
  attention: 'neuronest_attention_level',
  quick_math: 'neuronest_math_level',
  word_recall: 'neuronest_word_level',
}

const GAMES = [
  {
    type: 'memory_match',
    nameKey: 'games.memory',
    descKey: 'games.memoryDesc',
    route: '/patient/games/memory',
    icon: Grid3x3,
    color: 'from-teal-500 to-teal-600',
  },
  {
    type: 'sequence_recall',
    nameKey: 'games.sequence',
    descKey: 'games.sequenceDesc',
    route: '/patient/games/sequence',
    icon: ListOrdered,
    color: 'from-navy-600 to-navy-700',
  },
  {
    type: 'attention',
    nameKey: 'games.attention',
    descKey: 'games.attentionDesc',
    route: '/patient/games/attention',
    icon: Crosshair,
    color: 'from-amber-500 to-orange-600',
  },
  {
    type: 'quick_math',
    nameKey: 'games.math',
    descKey: 'games.mathDesc',
    route: '/patient/games/math',
    icon: Calculator,
    color: 'from-rose-500 to-pink-600',
  },
  {
    type: 'word_recall',
    nameKey: 'games.words',
    descKey: 'games.wordsDesc',
    route: '/patient/games/words',
    icon: BookOpen,
    color: 'from-violet-500 to-purple-600',
  },
]

function gameLevel(type) {
  const key = LEVEL_KEYS[type]
  return (key && Number(localStorage.getItem(key))) || 1
}

export default function GamesList() {
  const { tr } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const [voiceNote, setVoiceNote] = useState('')
  const setEnergy = useAnimStore((s) => s.setEnergy)

  // Came from a game's "Next activity" — highlight the adaptive recommendation
  const recommendation = location.state?.recommended
    ? {
        gameType: location.state.gameType,
        level: location.state.recommended,
        reason: location.state.reason,
      }
    : null

  const startGame = (game) => {
    setEnergy(0.6)
    voiceService.speak(`Starting ${tr(game.nameKey)}. Listen carefully for instructions.`)
    navigate(game.route)
  }

  return (
    <div className="flex flex-col gap-5">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-navy-800">{tr('games.title')}</h1>
        <p className="text-navy-600 mt-1">
          Pick an activity. Each session adapts to your pace.
        </p>
        {voiceNote && <p className="text-teal-700 font-medium mt-1" role="status">{voiceNote}</p>}
      </motion.header>

      {recommendation && (
        <motion.section
          className="card flex flex-col gap-2 border-teal-300 bg-mind"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
        >
          <p className="flex items-center gap-2 font-semibold text-teal-800">
            <Sparkles size={20} aria-hidden="true" /> Recommended next activity
          </p>
          <p className="text-navy-700">{recommendation.reason}</p>
          <button
            type="button"
            className="btn-primary mt-1 self-start"
            onClick={() => {
              const target = GAMES.find((g) => g.type === recommendation.gameType) || GAMES[0]
              startGame(target)
            }}
          >
            {tr('games.start')} {recommendation.level
              ? `Level ${recommendation.level}`
              : tr(GAMES.find((g) => g.type === recommendation.gameType)?.nameKey || GAMES[0].nameKey)}
            <ChevronRight size={18} className="inline" aria-hidden="true" />
          </button>
        </motion.section>
      )}

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" aria-label="Available games">
        {GAMES.map((game, i) => (
          <ActivityPortal
            key={game.type}
            game={{ ...game, level: gameLevel(game.type) }}
            name={tr(game.nameKey)}
            description={tr(game.descKey)}
            icon={game.icon}
            gradient={game.color}
            delay={i * 0.07}
            onStart={startGame}
          />
        ))}
      </section>
    </div>
  )
}