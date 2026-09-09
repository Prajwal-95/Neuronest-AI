import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Volume2, Play } from 'lucide-react'
import { useOffline } from '../offline/OfflineContext'
import { useAuth } from '../auth/AuthContext'
import { voiceService } from '../services/voice'
import { buildSession, suggestDifficulty } from './gameEngine'
import { makeClientId } from '../offline/sessionQueue'
import MemoryCard from '../animation/MemoryCard'
import GameResult from '../animation/GameResult'
import GameStartSequence from '../animation/GameStartSequence'
import GameHeader, { GameMeta } from '../animation/GameHeader'
import { useSceneMode } from '../animation/useSceneMode'
import { useAnimStore } from '../animation/animStore'
import { useI18n } from '../services/i18n'

// Difficulty -> number of cards (Level 1: 6 cards/3 pairs ... Level 5: 20 cards/10 pairs)
const LEVEL_CONFIG = {
  1: { cards: 6, revealMs: 1500 },
  2: { cards: 8, revealMs: 1300 },
  3: { cards: 12, revealMs: 1100 },
  4: { cards: 16, revealMs: 900 },
  5: { cards: 20, revealMs: 700 },
}

const SYMBOLS = ['🌸', '⭐', '🌙', '🍎', '🐦', '🔶', '🌳', '🎈', '🦋', '🌻']

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function MemoryMatch() {
  const navigate = useNavigate()
  const { saveSession } = useOffline()
  const { tr } = useI18n()
  useSceneMode('game-memory')
  const triggerBurst = useAnimStore((s) => s.triggerBurst)
  const setSceneEnergy = useAnimStore((s) => s.setEnergy)
  const [difficulty, setDifficulty] = useState(
    () => Number(localStorage.getItem('neuronest_memory_level')) || 1
  )
  const { cards, revealMs } = LEVEL_CONFIG[difficulty] || LEVEL_CONFIG[1]
  const pairs = cards / 2

  const deck = useMemo(() => {
    const symbols = SYMBOLS.slice(0, pairs)
    return shuffle([...symbols, ...symbols])
  }, [pairs])

  const [flipped, setFlipped] = useState([])
  const [matched, setMatched] = useState([])
  const [moves, setMoves] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [phase, setPhase] = useState('intro')
  const [result, setResult] = useState(null)
  const [featured, setFeatured] = useState(false)
  const [anticipating, setAnticipating] = useState(false)
  const [shakeId, setShakeId] = useState(null)
  const [mismatchPair, setMismatchPair] = useState(null)
  const lockRef = useRef(false)
  const lastClickRef = useRef({ x: 0, y: 0 })

  const completed = matched.length === deck.length && deck.length > 0

  // Timer
  useEffect(() => {
    if (phase !== 'playing' || completed) return
    const id = setInterval(() => {
      if (startTime) setElapsed((Date.now() - startTime) / 1000)
    }, 200)
    return () => clearInterval(id)
  }, [phase, completed, startTime])

  const startGame = () => {
    voiceService.speak(
      `Let's play Memory Match. Find the matching pairs of cards. Level ${difficulty}.`
    )
    setFlipped([])
    setMatched([])
    setMoves(0)
    setMistakes(0)
    setResult(null)
    setElapsed(0)
    setStartTime(Date.now())
    setPhase('playing')
    lockRef.current = true // lock during initial reveal
    setTimeout(() => {
      lockRef.current = false
    }, revealMs)
  }

  const handleFlip = (i, e) => {
    if (phase !== 'playing') return
    if (lockRef.current) return
    if (flipped.includes(i) || matched.includes(i)) return
    if (e && e.clientX) lastClickRef.current = { x: e.clientX, y: e.clientY }
    setSceneEnergy(0.55)
    if (flipped.length === 2) {
      setFlipped([i])
      return
    }
    const next = [...flipped, i]
    setFlipped(next)
    if (next.length === 2) {
      setMoves((m) => m + 1)
      const [a, b] = next
      if (deck[a] === deck[b]) {
        setTimeout(() => {
          setMatched((m) => [...m, a, b])
          setFlipped([])
          setFeatured(true)
          setTimeout(() => setFeatured(false), 600)
          voiceService.speak('Excellent match.')
          triggerBurst(lastClickRef.current.x, lastClickRef.current.y)
          setSceneEnergy((current) => Math.min(1, current + 0.1))
        }, 350)
      } else {
        setMistakes((x) => x + 1)
        const id = Date.now()
        setMismatchPair([a, b])
        setShakeId(id)
        setTimeout(() => {
          setFlipped([])
          setMismatchPair(null)
          setShakeId(null)
        }, 700)
      }
    }
  }
// Completion
  useEffect(() => {
    if (completed && phase === 'playing' && !result) {
      const finalElapsed = startTime ? (Date.now() - startTime) / 1000 : 0
      const movesUsed = moves
      const finalAccuracy = movesUsed > 0 ? pairs / Math.max(movesUsed, pairs) : 1
      const recentScores = JSON.parse(localStorage.getItem('neuronest_recent_scores') || '[]')
      const session = buildSession({
        gameType: 'memory_match',
        difficulty,
        accuracy: finalAccuracy,
        responseTime: finalElapsed / Math.max(movesUsed, 1),
        mistakes,
        attempts: movesUsed,
        completed: true,
        offline: !navigator.onLine,
        recentScores: recentScores.slice(-5),
        clientId: makeClientId(),
      })
      // Use the adaptive engine to determine the next difficulty
      const adaptive = suggestDifficulty({
        accuracy: finalAccuracy,
        responseTime: finalElapsed / Math.max(movesUsed, 1),
        mistakes,
        currentDifficulty: difficulty,
        recentScores: recentScores.slice(-5),
      })
      const nextLevel = adaptive.recommended
      saveSession(session)
      localStorage.setItem(
        'neuronest_recent_scores',
        JSON.stringify([...recentScores.slice(-9), session.score])
      )
      localStorage.setItem('neuronest_memory_level', String(nextLevel))
      setDifficulty(nextLevel)
      setResult({ session, adaptive, prevDifficulty: difficulty })
      voiceService.speak(
        `Excellent work! You matched ${pairs} out of ${pairs} pairs. Your score is ${session.score} out of 100.`
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completed, result])

  const gridCols = difficulty <= 2 ? 4 : difficulty === 3 ? 4 : difficulty === 4 ? 4 : 5
// ---------------- RENDER ----------------
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <GameHeader
        title={tr('games.memory')}
        voiceInstruction={() => voiceService.speak('Find the matching pairs of cards.')}
        onBack={() => navigate('/patient/games')}
      />
      <GameMeta level={difficulty}>
        {tr('games.pairsFind', { pairs })}
      </GameMeta>

      {phase === 'intro' && !anticipating && (
        <div className="card flex flex-col items-center gap-5 py-12">
          <Play size={56} className="text-teal-600 nx-float" aria-hidden="true" />
          <p className="text-lg text-center text-navy-700 max-w-md">
            {tr('games.cardsBrief')}
          </p>
          <button
            type="button"
            className="btn-primary !px-10 !py-5 !text-xl"
            onClick={() => {
              setAnticipating(true)
              voiceService.speak(`Starting Memory Match. Level ${difficulty}.`)
            }}
          >
            {tr('games.startLevel')} {difficulty}
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

      {phase === 'playing' && (
        <>
          <div className="flex flex-wrap gap-4 justify-between items-center mb-4 text-lg font-semibold text-navy-700">
            <span aria-live="polite">{tr('games.moves')}: {moves}</span>
            <span>{tr('games.pairs')}: {matched.length / 2} / {pairs}</span>
            <span>{tr('games.mistakes')}: {mistakes}</span>
            <span>{tr('games.time')}: {elapsed.toFixed(0)}s</span>
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${gridCols}, minmax(0,1fr))` }}
            role="group"
            aria-label="Memory match card grid"
          >
            {deck.map((symbol, i) => {
              const isMatched = matched.includes(i)
              const isFlipped = isMatched || flipped.includes(i)
              const inMismatch = mismatchPair && mismatchPair.includes(i)
              return (
                <MemoryCard
                  key={`${difficulty}-${i}`}
                  symbol={symbol}
                  isFlipped={isFlipped}
                  isMatched={isMatched}
                  shakeKey={inMismatch ? shakeId : null}
                  onFlip={(e) => handleFlip(i, e)}
                  disabled={phase !== 'playing' || lockRef.current}
                  ariaLabel={`Card ${i + 1}${isMatched ? ', matched' : ''}`}
                />
              )
            })}
          </div>

          {featured && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-teal-700 font-semibold mt-4 text-xl"
            >
              ✨ {tr('games.pairMatched')}
            </motion.p>
          )}
        </>
      )}

      {result && (
        <GameResult
          session={result.session}
          stats={[
            { label: tr('games.accuracy'), value: `${Math.round(result.session.accuracy * 100)}%` },
            { label: tr('games.moves'), value: result.session.attempts },
            { label: tr('games.pairs'), value: pairs },
            { label: tr('games.mistakes'), value: result.session.mistakes },
          ]}
          insight={{ title: tr('games.aiRecommendation'), text: result.adaptive.reason }}
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
                ? tr('games.memoryStronger')
                : tr('games.mindSharp'),
          }}
          onPlayAgain={startGame}
          onNext={() =>
            navigate('/patient/games', {
              state: {
                recommended: result.adaptive.recommended,
                gameType: 'memory_match',
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