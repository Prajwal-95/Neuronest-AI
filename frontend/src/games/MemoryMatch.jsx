import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Volume2, Play } from 'lucide-react'
import { useOffline } from '../offline/OfflineContext'
import { useAuth } from '../auth/AuthContext'
import { voiceService } from '../services/voice'
import { buildSession, suggestDifficulty, MAX_LEVEL } from './gameEngine'
import { makeClientId } from '../offline/sessionQueue'
import MemoryCard from '../animation/MemoryCard'
import GameResult from '../animation/GameResult'
import GameStartSequence from '../animation/GameStartSequence'
import GameHeader, { GameMeta } from '../animation/GameHeader'
import { useSceneMode } from '../animation/useSceneMode'
import { useAnimStore } from '../animation/animStore'
import { useI18n } from '../services/i18n'

// Difficulty -> number of cards (Level 1: 6 cards/3 pairs ... Level 10: 48 cards/24 pairs)
// Every count divides evenly into a grid of at most 6 rows at 4-8 columns: a
// partial last row reads as a broken board, and a tall grid pushes the bottom
// row below the fold. `previewMs` is how long the whole board stays face-up
// for memorisation before the cards turn over. It grows with the number of
// cards, because more pairs take longer to encode; the previous build
// DECREASED it per level (1500 -> 700ms), handing the hardest level the least
// study time.
const LEVEL_CONFIG = {
  1: { cards: 6, previewMs: 3500 },
  2: { cards: 8, previewMs: 4000 },
  3: { cards: 12, previewMs: 4500 },
  4: { cards: 16, previewMs: 5000 },
  5: { cards: 20, previewMs: 6000 },
  6: { cards: 24, previewMs: 7000 },
  7: { cards: 30, previewMs: 7500 },
  8: { cards: 36, previewMs: 8500 },
  9: { cards: 40, previewMs: 9500 },
  10: { cards: 48, previewMs: 11000 },
}

// 24 distinct symbols so the top level can deal its full 24 pairs. The pool
// previously held only 10, which is what capped the old level 5 at 10 pairs -
// the new levels above 5 would have silently REPEATED cards without these,
// turning a matching task into a puzzle with unsolvable duplicates.
const SYMBOLS = [
  '🌸', '⭐', '🌙', '🍎', '🐦', '🔶', '🌳', '🎈', '🦋', '🌻',
  '🐟', '🎵', '🍀', '🌈', '⛅', '🐢', '🍉', '🎸', '🚀', '🌺',
  '🪁', '🧁', '🔑', '🪶',
]

/** Deal `pairs` matched pairs, shuffled. Every symbol appears exactly twice. */
function buildDeck(pairs) {
  const symbols = SYMBOLS.slice(0, pairs)
  return shuffle([...symbols, ...symbols])
}

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
  const { cards, previewMs } = LEVEL_CONFIG[difficulty] || LEVEL_CONFIG[1]
  const pairs = cards / 2

  // The deck is state, not a useMemo on `pairs`: starting a new round must
  // RE-SHUFFLE the board. Deriving it from `pairs` alone would replay the
  // identical layout every round, so the player would be memorising positions
  // instead of re-learning the pairs.
  const [deck, setDeck] = useState(() => buildDeck(pairs))
  const setDeckFor = (p) => setDeck(buildDeck(p))

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

  // Memorise phase: the board is dealt face-up for `previewMs` before the
  // player may touch it. `countdown` feeds the "memorise, N seconds" prompt and
  // `isPreviewing` gates handleFlip so a tap cannot skip the study time.
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const tickRef = useRef(null)
  const endRef = useRef(null)

  const completed = matched.length === deck.length && deck.length > 0

  // Timer
  useEffect(() => {
    if (phase !== 'playing' || completed) return
    const id = setInterval(() => {
      if (startTime) setElapsed((Date.now() - startTime) / 1000)
    }, 200)
    return () => clearInterval(id)
  }, [phase, completed, startTime])

  // Memorise countdown. Both timers are cleared on unmount and whenever the
  // level changes, so a stale timeout can't unlock the board after the player
  // has already restarted at a different level.
  useEffect(() => {
    if (!isPreviewing) return
    setCountdown(Math.ceil(previewMs / 1000))
    tickRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    endRef.current = setTimeout(() => {
      setIsPreviewing(false)
      setStartTime(Date.now())
      voiceService.speak('Now find the matching pairs.')
    }, previewMs)
    return () => {
      clearInterval(tickRef.current)
      clearTimeout(endRef.current)
    }
  }, [isPreviewing, previewMs])

  useEffect(
    () => () => {
      clearInterval(tickRef.current)
      clearTimeout(endRef.current)
    },
    []
  )

  const startGame = (level) => {
    const lv = level || difficulty
    const lvlPairs = (LEVEL_CONFIG[lv] || LEVEL_CONFIG[1]).cards / 2
    if (level) setDifficulty(level)
    voiceService.speak(
      `Let's play Memory Match. Find the matching pairs of cards. Level ${lv}.`
    )
    setFlipped([])
    setMatched([])
    setMoves(0)
    setMistakes(0)
    setResult(null)
    setElapsed(0)
    setStartTime(null)
    setPhase('playing')
    setIsPreviewing(true)
    lockRef.current = false
    setDeckFor(lvlPairs)
  }

  const handleFlip = (i, e) => {
    if (phase !== 'playing') return
    // The board is face-up for study; taps during that window are ignored.
    if (isPreviewing) return
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

  // Columns chosen so every level fills its last row completely (no ragged
  // partial row, which reads as a broken board) and never exceeds 6 rows: a
  // taller grid pushes the bottom row below the fold. Prefers 4 rows, then 5,
  // then 6, and takes the first count in 4..8 that divides `cards` evenly.
  const gridCols = (() => {
    for (const maxRows of [4, 5, 6]) {
      for (const c of [4, 5, 6, 8]) {
        if (cards % c === 0) {
          const rows = cards / c
          if (rows >= 2 && rows <= maxRows) return c
        }
      }
    }
    for (const c of [3, 4]) if (cards % c === 0) return c
    return 4
  })()

  // Board sizing. Two constraints, because a visual memory task is unplayable
  // unless the WHOLE board is on screen at once:
  //   1. A px cap, so cards never balloon to fill the `max-w-4xl` container.
  //   2. A viewport-height cap, so the board also fits on a short 1366x768
  //      laptop and when the accessibility font-size setting is turned up.
  // The cap is expressed in px / vh (not rem) precisely so the font-size
  // setting cannot push rows off-screen. This matters much more now that the
  // top level deals 40 cards instead of 20.
  const CARD_PX = 112
  const GRID_GAP = 10
  const boardRows = Math.ceil(cards / gridCols)
  const boardRatio = gridCols / boardRows
  const boardMaxWidth =
    `min(${gridCols * CARD_PX + (gridCols - 1) * GRID_GAP}px, ` +
    `max(280px, calc((100vh - 320px) * ${boardRatio.toFixed(3)})))`

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
          {isPreviewing && (
            <p
              className="text-center text-teal-700 font-semibold mb-4 text-lg"
              role="status"
              aria-live="assertive"
            >
              {tr('games.memorise', { seconds: countdown })}
            </p>
          )}
          <div className="flex flex-wrap gap-4 justify-between items-center mb-4 text-lg font-semibold text-navy-700">
            <span aria-live="polite">{tr('games.moves')}: {moves}</span>
            <span>{tr('games.pairs')}: {matched.length / 2} / {pairs}</span>
            <span>{tr('games.mistakes')}: {mistakes}</span>
            <span>{tr('games.time')}: {elapsed.toFixed(0)}s</span>
          </div>

          <div
            className="grid gap-2.5 mx-auto"
            style={{
              gridTemplateColumns: `repeat(${gridCols}, minmax(0,1fr))`,
              maxWidth: boardMaxWidth,
            }}
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
          onPlayAgain={() => startGame()}
          onNextLevel={
            result.prevDifficulty < MAX_LEVEL
              ? () => {
                  const next = result.prevDifficulty + 1
                  localStorage.setItem('neuronest_memory_level', String(next))
                  startGame(next)
                }
              : null
          }
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