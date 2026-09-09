import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Volume2, Play } from 'lucide-react'
import { useOffline } from '../offline/OfflineContext'
import { voiceService } from '../services/voice'
import { buildSession } from './gameEngine'
import { makeClientId } from '../offline/sessionQueue'
import GameResult from '../animation/GameResult'
import GameHeader, { GameMeta } from '../animation/GameHeader'
import GameStartSequence from '../animation/GameStartSequence'
import { useSceneMode } from '../animation/useSceneMode'
import { useAnimStore } from '../animation/animStore'
import { getReducedMotion } from '../animation/device'

// Level -> sequence length (Level 1: 3 symbols ... Level 5: 7 symbols)
const LEVEL_LENGTH = { 1: 3, 2: 4, 3: 5, 4: 6, 5: 7 }

// Full set of every symbol the game uses. The tap options always show ALL of
// these, so the sequence (which is drawn from the per-level pool below) is
// always solvable.
const ALL_SYMBOLS = ['●', '▲', '★', '■', '◆', '♥', '✚', '☂']

// Level -> the symbols the watch sequence is drawn from. Higher levels
// introduce more distinct symbols to remember.
const LEVEL_POOL = {
  1: ['●', '▲', '★', '■'],
  2: ['●', '▲', '★', '■', '◆'],
  3: ['●', '▲', '★', '■', '◆', '♥'],
  4: ['●', '▲', '★', '■', '◆', '♥', '✚'],
  5: ['●', '▲', '★', '■', '◆', '♥', '✚', '☂'],
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function SequenceRecall() {
  const navigate = useNavigate()
  const { saveSession } = useOffline()
  useSceneMode('game-sequence')
  const setSceneEnergy = useAnimStore((s) => s.setEnergy)
  const [difficulty, setDifficulty] = useState(
    () => Number(localStorage.getItem('neuronest_sequence_level')) || 1
  )
  const seqLen = LEVEL_LENGTH[difficulty] || 3

  const [sequence, setSequence] = useState([])
  const [phase, setPhase] = useState('intro') // intro | watch | input | result
  const [picked, setPicked] = useState([])
  const [attempts, setAttempts] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [responseTime, setResponseTime] = useState(0)
  const [result, setResult] = useState(null)
  const [anticipating, setAnticipating] = useState(false)

  const startGame = () => {
    const pool = LEVEL_POOL[difficulty] || LEVEL_POOL[1]
    const seq = Array.from({ length: seqLen }, () => pool[Math.floor(Math.random() * pool.length)])
    setSequence(seq)
    setPicked([])
    setAttempts(0)
    setMistakes(0)
    setResult(null)
    setPhase('watch')
    voiceService.speak(
      `Watch the sequence carefully. It has ${seqLen} symbols. Remember them in order.`
    )
    // Show for 1.2s per symbol, then hide
    const showMs = 1200 * seqLen
    setTimeout(() => {
      setPhase('input')
      setStartTime(Date.now())
      voiceService.speak('Now reproduce the sequence in the same order.')
    }, showMs)
  }

  // Choice buttons stay stable during the input phase (useMemo).
  // All 8 symbols are always shown, shuffled, so the correct answers are
  // always on screen at every level.
  const choiceOptions = useMemo(
    () => (phase === 'input' ? shuffle(ALL_SYMBOLS) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase === 'input']
  )

  const handlePick = (sym) => {
    if (phase !== 'input') return
    setPicked((prev) => {
      const next = [...prev, sym]
      return next
    })
  }

  // Evaluate as we go
  useEffect(() => {
    if (phase !== 'input' || picked.length === 0) return
    const idx = picked.length - 1
    if (picked[idx] === sequence[idx]) {
      setSceneEnergy(0.6)
      if (picked.length === sequence.length) {
        // completed correct sequence
        finishGame(true)
      } else {
        voiceService.speak('Correct. Keep going.')
      }
    } else {
      setMistakes((m) => m + 1)
      setAttempts((a) => a + 1)
      // clear and restart the input from scratch
      setPicked([])
      voiceService.speak('That one was not the right symbol. Let us try again.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked])

  const expectedLen = sequence.length

  const finishGame = (completed) => {
    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0
    const totalInputs = expectedLen + mistakes // every correct position + every mistake
    const accuracy = expectedLen / Math.max(totalInputs, expectedLen)
    const recentScores = JSON.parse(localStorage.getItem('neuronest_recent_scores') || '[]')
    const session = buildSession({
      gameType: 'sequence_recall',
      difficulty,
      accuracy,
      responseTime: elapsed / Math.max(totalInputs, 1),
      mistakes,
      attempts: totalInputs,
      completed,
      offline: !navigator.onLine,
      recentScores: recentScores.slice(-5),
      clientId: makeClientId(),
    })
    // Completing a level always advances to the next one (capped at 5)
    const nextLevel = Math.min(5, difficulty + 1)
    const adaptive = {
      recommended: nextLevel,
      reason: `Level ${difficulty} completed — great job! The next round will be Level ${nextLevel}.`,
    }
    saveSession(session)
    localStorage.setItem(
      'neuronest_recent_scores',
      JSON.stringify([...recentScores.slice(-9), session.score])
    )
    localStorage.setItem('neuronest_sequence_level', String(nextLevel))
    setDifficulty(nextLevel)
    setResult({ session, adaptive, prevDifficulty: difficulty })
    setPhase('result')
    setResponseTime(elapsed)
    voiceService.speak(
      `Excellent work! You completed the sequence. Your score is ${session.score} out of 100.`
    )
  }
// ---------------- RENDER ----------------
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <GameHeader
        title="Sequence Recall"
        voiceInstruction={() => voiceService.speak('Watch the sequence, then reproduce it in the same order.')}
        onBack={() => navigate('/patient/games')}
      />
      <GameMeta level={difficulty}>
        Remember {seqLen} symbols in order
      </GameMeta>

      {phase === 'intro' && !anticipating && (
        <div className="card flex flex-col items-center gap-5 py-12">
          <Play size={56} className="text-teal-600 nx-float" aria-hidden="true" />
          <p className="text-lg text-center text-navy-700 max-w-md">
            Watch the symbols appear. Then tap the same symbols in the same order.
          </p>
          <button
            type="button"
            className="btn-primary !px-10 !py-5 !text-xl"
            onClick={() => {
              setAnticipating(true)
              voiceService.speak(`Starting Sequence Recall. Level ${difficulty}.`)
            }}
          >
            Start Level {difficulty}
          </button>
        </div>
      )}

      {phase === 'intro' && anticipating && (
        <div className="card">
          <GameStartSequence
            onDone={() => {
              setAnticipating(false)
              startGame()
            }}
          />
        </div>
      )}

      {phase === 'watch' && (
        <div className="card flex flex-col items-center gap-6 py-12">
          <p className="text-lg font-semibold text-navy-600">Remember this sequence…</p>
          <div className="flex gap-4 flex-wrap justify-center">
            {sequence.map((sym, i) => (
              <motion.span
                key={`${difficulty}-${i}`}
                initial={{ opacity: 0, scale: 0.5, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ delay: i * 1.2, type: 'spring', stiffness: 170, damping: 14 }}
                className="w-20 h-20 rounded-2xl bg-navy-700 text-white flex items-center justify-center text-4xl nx-glow"
                aria-hidden="true"
              >
                {sym}
              </motion.span>
            ))}
          </div>
          <p className="text-navy-400 text-sm">Watch carefully…</p>
        </div>
      )}

      {phase === 'input' && (
        <div className="card flex flex-col items-center gap-6 py-8">
          <p className="text-lg font-semibold text-navy-700" aria-live="polite">
            Tap the symbols in the same order — {picked.length} / {seqLen}
          </p>
          <div className="flex gap-3 flex-wrap justify-center min-h-16 items-center">
            {picked.map((sym, i) => (
              <motion.span
                key={`${sym}-${i}`}
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 14 }}
                className="w-14 h-14 rounded-xl bg-teal-100 text-teal-700 flex items-center justify-center text-3xl"
              >
                {sym}
              </motion.span>
            ))}
          </div>
          <p className="text-lg font-semibold text-navy-600">Which symbol came next?</p>
          <div className="flex gap-3 flex-wrap justify-center max-w-xl">
            {choiceOptions.map((sym, i) => (
              <motion.button
                key={`${sym}-${i}`}
                type="button"
                onClick={() => handlePick(sym)}
                aria-label={`Choose symbol ${sym}`}
                whileTap={{ scale: 0.92 }}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 240, damping: 16 }}
                className="w-16 h-16 md:w-20 md:h-20 rounded-2xl bg-white border-2 border-navy-200 hover:border-teal-500 text-3xl md:text-4xl flex items-center justify-center transition-colors"
              >
                {sym}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {result && (
        <GameResult
          session={result.session}
          stats={[
            { label: 'Accuracy', value: `${Math.round(result.session.accuracy * 100)}%` },
            { label: 'Mistakes', value: result.session.mistakes },
            { label: 'Symbols', value: seqLen },
            { label: 'Time', value: `${responseTime.toFixed(0)}s` },
          ]}
          insight={{ title: 'AI recommendation', text: result.adaptive.reason }}
          levelUp={{
            level: result.adaptive.recommended,
            direction:
              result.adaptive.recommended > result.prevDifficulty
                ? 'up'
                : result.adaptive.recommended < result.prevDifficulty
                ? 'down'
                : 'same',
            message:
              result.adaptive.recommended > result.prevDifficulty
                ? 'Your sequence memory is getting stronger.'
                : 'Every round keeps your mind sharp.',
          }}
          onPlayAgain={startGame}
          onNext={() =>
            navigate('/patient/games', {
              state: {
                recommended: result.adaptive.recommended,
                gameType: 'sequence_recall',
                reason: result.adaptive.reason,
              },
            })
          }
        />
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-mind p-4">
      <p className="text-sm text-navy-500 font-medium">{label}</p>
      <p className="text-3xl font-bold text-navy-800">{value}</p>
    </div>
  )
}