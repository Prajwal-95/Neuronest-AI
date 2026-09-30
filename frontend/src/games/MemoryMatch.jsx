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

  // Every timer this component creates is registered here so a restart can
  // cancel the previous round's pending work. An untracked setTimeout from an
  // old round fires against the NEW board - clearing a fresh selection,
  // unshaking freshly dealt cards, or ending a preview that has only just
  // started. `later`/`every` are thin wrappers that self-remove on fire.
  const timeoutsRef = useRef(new Set())
  const intervalsRef = useRef(new Set())

  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timeoutsRef.current.delete(id)
      fn()
    }, ms)
    timeoutsRef.current.add(id)
    return id
  }

  const every = (fn, ms) => {
    const id = setInterval(fn, ms)
    intervalsRef.current.add(id)
    return id
  }

  const clearPendingTimers = () => {
    timeoutsRef.current.forEach((id) => clearTimeout(id))
    timeoutsRef.current.clear()
    intervalsRef.current.forEach((id) => clearInterval(id))
    intervalsRef.current.clear()
  }

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

  // Memorise phase: the whole board is dealt FACE-UP for `previewMs` before the
  // player may touch it. `countdown` feeds the "memorise, N seconds" prompt,
  // `isPreviewing` both forces every card face-up in the render (see the deck
  // map below) and gates handleFlip so a tap cannot skip the study time.
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [countdown, setCountdown] = useState(0)

  // Bumped on every startGame. React bails out of a re-render when a state
  // setter receives the value it already holds, so restarting *during* a
  // preview (isPreviewing is already true) would otherwise leave the effect
  // below un-re-run and the original preview would end early against the
  // freshly dealt board. Making the preview run id part of the dependency list
  // forces the old timers to be torn down and a full-length one to be armed.
  const [previewRun, setPreviewRun] = useState(0)

  const completed = matched.length === deck.length && deck.length > 0

  // Timer
  useEffect(() => {
    if (phase !== 'playing' || completed) return
    const id = setInterval(() => {
      if (startTime) setElapsed((Date.now() - startTime) / 1000)
    }, 200)
    return () => clearInterval(id)
  }, [phase, completed, startTime])

  // Memorise countdown. The effect body only runs AFTER React has committed the
  // render that dealt the deck, so the timer can never start against a partial
  // board. The cleanup tears the previous round's timers down, so a restart -
  // including one mid-preview - re-arms a full-length countdown instead of
  // letting a stale timeout unlock the new board early.
  useEffect(() => {
    if (!isPreviewing) return
    setCountdown(Math.ceil(previewMs / 1000))
    const tickId = every(() => {
      setCountdown((c) => Math.max(0, c - 1))
    }, 1000)
    // Ending the preview flips every unmatched card face-down at once: there is
    // nothing in `flipped`/`matched` yet (both are reset by startGame and taps
    // are ignored while previewing), so dropping `isPreviewing` alone puts the
    // entire board back down in a single render.
    const endId = later(() => {
      setFlipped([])
      setMismatchPair(null)
      setShakeId(null)
      setIsPreviewing(false)
      setStartTime(Date.now())
      voiceService.speak('Now find the matching pairs.')
    }, previewMs)
    // Re-running this effect (restart, level change, unmount) cancels the
    // previous preview's timers so they cannot act on the new board.
    return () => {
      clearInterval(tickId)
      intervalsRef.current.delete(tickId)
      clearTimeout(endId)
      timeoutsRef.current.delete(endId)
    }
    // `previewRun` re-keys the preview so a rapid restart re-arms it.
  }, [isPreviewing, previewMs, previewRun])

  useEffect(() => () => clearPendingTimers(), [])

  const startGame = (level) => {
    const lv = level || difficulty
    const lvlPairs = (LEVEL_CONFIG[lv] || LEVEL_CONFIG[1]).cards / 2
    if (level) setDifficulty(level)
    voiceService.speak(
      `Let's play Memory Match. Find the matching pairs of cards. Level ${lv}.`
    )
    // Cancel the previous round's mismatch/match delays and any preview that is
    // still running, so nothing from the old board can act on the new one.
    clearPendingTimers()
    setFlipped([])
    setMatched([])
    setMoves(0)
    setMistakes(0)
    setResult(null)
    setElapsed(0)
    setStartTime(null)
    setCountdown(0)
    setFeatured(false)
    setMismatchPair(null)
    setShakeId(null)
    setPhase('playing')
    setIsPreviewing(true)
    // Re-key the preview even when isPreviewing was already true, otherwise
    // React would skip the re-render and the stale countdown would carry over.
    setPreviewRun((n) => n + 1)
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
        // Registered so a restart mid-resolution cannot apply a stale match to
        // the freshly dealt deck.
        later(() => {
          setMatched((m) => [...m, a, b])
          setFlipped([])
          setFeatured(true)
          later(() => setFeatured(false), 600)
          voiceService.speak('Excellent match.')
          triggerBurst(lastClickRef.current.x, lastClickRef.current.y)
          setSceneEnergy((current) => Math.min(1, current + 0.1))
        }, 350)
      } else {
        setMistakes((x) => x + 1)
        const id = Date.now()
        setMismatchPair([a, b])
        setShakeId(id)
        // `lockRef` keeps a third card from being selected while the pair is
        // being resolved; the 700ms flip-back is registered so it cannot fire
        // against a board from a later round.
        later(() => {
          lockRef.current = false
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
              // THE preview fix: during the memorise window EVERY card must be
              // face-up. Without `isPreviewing ||` here the whole board rendered
              // face-down, because `flipped`/`matched` are both empty while
              // previewing - so the player was asked to memorise a grid of
              // card backs. Once the preview ends this falls back to
              // matched/selected only, which flips every unmatched card down
              // in the same render.
              const isFlipped = isPreviewing || isMatched || flipped.includes(i)
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