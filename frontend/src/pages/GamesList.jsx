import React, { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Grid3x3, ListOrdered, Crosshair, Calculator, BookOpen, Sparkles, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'
import ActivityPortal from '../animation/ActivityPortal'
import PreGameCheckin from '../components/PreGameCheckin'
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
    gradientClass: 'memory',
    levelKey: 'neuronest_memory_level',
    duration: '2-4 min',
  },
  {
    type: 'sequence_recall',
    nameKey: 'games.sequence',
    descKey: 'games.sequenceDesc',
    route: '/patient/games/sequence',
    icon: ListOrdered,
    gradientClass: 'sequence',
    levelKey: 'neuronest_sequence_level',
    duration: '2-3 min',
  },
  {
    type: 'attention',
    nameKey: 'games.attention',
    descKey: 'games.attentionDesc',
    route: '/patient/games/attention',
    icon: Crosshair,
    gradientClass: 'attention',
    levelKey: 'neuronest_attention_level',
    duration: '2-4 min',
  },
  {
    type: 'quick_math',
    nameKey: 'games.math',
    descKey: 'games.mathDesc',
    route: '/patient/games/math',
    icon: Calculator,
    gradientClass: 'math',
    levelKey: 'neuronest_math_level',
    duration: '2-4 min',
  },
  {
    type: 'word_recall',
    nameKey: 'games.words',
    descKey: 'games.wordsDesc',
    route: '/patient/games/words',
    icon: BookOpen,
    gradientClass: 'words',
    levelKey: 'neuronest_word_level',
    duration: '2-3 min',
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

  // --- Pre-game wellbeing check-in ---
  // The patient taps a game, answers 4 short caring questions (tap-only, no
  // typing), and only then enters the game. The answers are stored locally and
  // shown to the caregiver alongside the performance data - they are context,
  // never a clinical judgement.
  const [checkinFor, setCheckinFor] = useState(null)

  const onPickGame = (game) => {
    setEnergy(0.6)
    setCheckinFor(game)
  }

  const finishCheckin = (answers) => {
    try {
      localStorage.setItem('neuronest_last_checkin', JSON.stringify({
        at: new Date().toISOString(),
        game: checkinFor?.type,
        answers,
      }))
    } catch {
      // Storage unavailable (private mode) - the game must still start.
    }
    startGame(checkinFor)
  }

  if (checkinFor) {
    return (
      <div className="flex flex-col gap-4">
        <PreGameCheckin onDone={finishCheckin} onSkip={() => finishCheckin({})} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <motion.header
        className="flex flex-col gap-1"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-3xl font-bold text-navy-800">{tr('games.title')}</h1>
        <p className="text-navy-500 mt-0.5">
          Pick an activity. Each session adapts to your pace.
        </p>
        {voiceNote && <p className="text-teal-700 font-medium mt-1" role="status">{voiceNote}</p>}
      </motion.header>

      {recommendation && (
        <motion.section
          className="card flex flex-col gap-3 border-teal-200 bg-gradient-to-br from-mind to-teal-50 shadow-glow-teal"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, x: -14 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45 }}
        >
          <p className="flex items-center gap-2 font-semibold text-teal-800 text-lg">
            <Sparkles size={20} aria-hidden="true" /> {tr('home.recommended')}
          </p>
          {recommendation.level && (
            <span className="badge-teal self-start">
              {tr('games.level')} {recommendation.level}
            </span>
          )}
          <p className="text-navy-700">{recommendation.reason}</p>
          <button
            type="button"
            className="btn-primary mt-1 self-start"
            onClick={() => {
              const target = GAMES.find((g) => g.type === recommendation.gameType) || GAMES[0]
              // Route through the check-in like every other entry point.
              onPickGame(target)
            }}
          >
            {tr('games.start')} {recommendation.level
              ? `${tr('games.level')} ${recommendation.level}`
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
            delay={i * 0.07}
            onStart={onPickGame}
          />
        ))}
      </section>
    </div>
  )
}