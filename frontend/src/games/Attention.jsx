import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Volume2, Play } from 'lucide-react'
import { useOffline } from '../offline/OfflineContext'
import { voiceService } from '../services/voice'
import { buildSession, suggestDifficulty, MAX_LEVEL } from './gameEngine'
import { makeClientId } from '../offline/sessionQueue'
import GameResult from '../animation/GameResult'
import GameHeader, { GameMeta } from '../animation/GameHeader'
import GameStartSequence from '../animation/GameStartSequence'
import { useSceneMode } from '../animation/useSceneMode'
import { useAnimStore } from '../animation/animStore'
import { useI18n } from '../services/i18n'

// Level config: total objects, target count, distractor pool, time limit (s)
// Ten levels.
//
// `objects` tops out at 30. The column formula below yields at most 8 columns,
// so anything above 32 objects spills into a 5th row - and the board is
// deliberately held to FOUR rows or fewer, because that is what keeps each tile
// at a size an older adult can reliably tap. Difficulty therefore comes from
// MORE TARGETS and a LOWER TIME-PER-OBJECT, not from an ever-taller board.
//
// `timeLimit` declines gently rather than the steep 60 -> 35 drop the old five
// levels used: the board also grows (12 -> 30 objects), so what makes a level
// harder is the lower time-per-object. Every limit stays above 35s, the
// minimum that still lets an older adult find and tap every target.
const LEVEL_CONFIG = {
  1: { objects: 12, targets: 5, distractors: ['▲', '★', '■'], timeLimit: 60 },
  2: { objects: 14, targets: 6, distractors: ['▲', '★', '■', '◆'], timeLimit: 55 },
  3: { objects: 16, targets: 7, distractors: ['▲', '★', '○', '■'], timeLimit: 50 },
  4: { objects: 18, targets: 8, distractors: ['◉', '◍', '○', '▲', '★'], timeLimit: 47 },
  5: { objects: 20, targets: 9, distractors: ['◉', '◍', '◐', '○', '◎'], timeLimit: 45 },
  6: { objects: 22, targets: 10, distractors: ['◉', '◍', '◐', '○', '◎'], timeLimit: 43 },
  7: { objects: 24, targets: 11, distractors: ['◉', '◍', '◐', '○', '◎'], timeLimit: 41 },
  8: { objects: 26, targets: 12, distractors: ['◉', '◍', '◐', '○', '◎'], timeLimit: 39 },
  9: { objects: 28, targets: 13, distractors: ['◉', '◍', '◐', '○', '◎'], timeLimit: 37 },
  10: { objects: 30, targets: 14, distractors: ['◉', '◍', '◐', '○', '◎'], timeLimit: 36 },
}

// Columns for a board: at most 8, at least 4, growing so the grid never
// exceeds four rows (see the note above). The previous expression was
// `min(8, ceil(sqrt(objects)))`, which stacked the larger levels into 5-7 rows
// and shrank the tiles below a comfortable tap target.
function boardCols(objects) {
  return Math.min(8, Math.max(4, Math.ceil(objects / 4)))
}

const TARGET = '●'
const TARGET_LABEL = 'filled circle'

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Attention() {
  const navigate = useNavigate()
  const { saveSession } = useOffline()
  const { tr } = useI18n()
  useSceneMode('game-attention')
  const triggerBurst = useAnimStore((s) => s.triggerBurst)
  const setSceneEnergy = useAnimStore((s) => s.setEnergy)
  const [difficulty, setDifficulty] = useState(
    () => Number(localStorage.getItem('neuronest_attention_level')) || 1
  )
  const cfg = LEVEL_CONFIG[difficulty] || LEVEL_CONFIG[1]

  const board = useMemo(() => {
    const items = []
    for (let i = 0; i < cfg.targets; i++) {
      items.push({ id: `t${i}`, symbol: TARGET, isTarget: true })
    }
    const distractorPool = cfg.distractors.filter((d) => d !== TARGET)
    for (let i = 0; i < cfg.objects - cfg.targets; i++) {
      items.push({
        id: `d${i}`,
        symbol: distractorPool[i % distractorPool.length],
        isTarget: false,
      })
    }
    return shuffle(items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [difficulty])

  const [phase, setPhase] = useState('intro')
  const [selected, setSelected] = useState([]) // ids selected
  const [correct, setCorrect] = useState([]) // matched target ids
  const [wrongSelections, setWrongSelections] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [timeLeft, setTimeLeft] = useState(cfg.timeLimit)
  const [result, setResult] = useState(null)
  const [anticipating, setAnticipating] = useState(false)
  const doneRef = useRef(false)

  const allTargetsFound = correct.length === cfg.targets

  // Countdown
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      setTimeLeft((t) => t - 1)
    }, 1000)
    return () => clearInterval(id)
  }, [phase])

  const startGame = () => {
    setSelected([])
    setCorrect([])
    setWrongSelections(0)
    setResult(null)
    setTimeLeft(cfg.timeLimit)
    setStartTime(Date.now())
    setPhase('playing')
    doneRef.current = false
    voiceService.speak(
      `Tap every ${TARGET_LABEL} on the screen. You have ${cfg.timeLimit} seconds.`
    )
  }

  const finishGame = (completed) => {
    if (doneRef.current) return
    doneRef.current = true
    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0
    const missed = cfg.targets - correct.length
    const correctCount = correct.length
    const totalTaps = correctCount + wrongSelections
    const accuracy = correctCount / Math.max(totalTaps + missed, 1)
    const recentScores = JSON.parse(localStorage.getItem('neuronest_recent_scores') || '[]')
    const session = buildSession({
      gameType: 'attention',
      difficulty,
      accuracy,
      responseTime: elapsed / Math.max(totalTaps || 1, 1),
      mistakes: wrongSelections,
      attempts: totalTaps,
      completed,
      offline: !navigator.onLine,
      recentScores: recentScores.slice(-5),
      clientId: makeClientId(),
    })
    // Use the adaptive engine to determine the next difficulty
    const adaptive = suggestDifficulty({
      accuracy,
      responseTime: elapsed / Math.max(totalTaps || 1, 1),
      mistakes: wrongSelections,
      currentDifficulty: difficulty,
      recentScores: recentScores.slice(-5),
    })
    const nextLevel = adaptive.recommended
    saveSession(session)
    localStorage.setItem(
      'neuronest_recent_scores',
      JSON.stringify([...recentScores.slice(-9), session.score])
    )
    localStorage.setItem('neuronest_attention_level', String(nextLevel))
    setDifficulty(nextLevel)
    setResult({ session, adaptive, missed, correctCount, prevDifficulty: difficulty })
    setPhase('result')
    voiceService.speak(
      `Great focus! You found ${correctCount} out of ${cfg.targets} targets. Your score is ${session.score} out of 100.`
    )
  }

  useEffect(() => {
    if (phase !== 'playing') return
    if (allTargetsFound) {
      finishGame(true)
    } else if (timeLeft <= 0) {
      finishGame(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTargetsFound, timeLeft, phase])

  const handleTap = (item, e) => {
    if (phase !== 'playing') return
    if (selected.includes(item.id)) return
    setSelected((s) => [...s, item.id])
    if (item.isTarget) {
      setCorrect((c) => [...c, item.id])
      setSceneEnergy((en) => Math.min(1, en + 0.1))
      if (e && e.clientX) triggerBurst(e.clientX, e.clientY)
      voiceService.speak('Correct.')
    } else {
      setWrongSelections((w) => w + 1)
      voiceService.speak('That was not a circle. Keep looking.')
    }
  }
// ---------------- RENDER ----------------
  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <GameHeader
        title="Attention Focus"
        voiceInstruction={() => voiceService.speak(`Tap every ${TARGET_LABEL} on the screen.`)}
        onBack={() => navigate('/patient/games')}
      />
      <GameMeta level={difficulty}>
        Find {cfg.targets} {TARGET_LABEL}s
      </GameMeta>

      {phase === 'intro' && !anticipating && (
        <div className="card flex flex-col items-center gap-5 py-12">
          <Play size={56} className="text-teal-600 nx-float" aria-hidden="true" />
          <div className="flex items-center gap-3">
            <span className="w-16 h-16 rounded-2xl bg-navy-700 text-white flex items-center justify-center text-4xl nx-glow">{TARGET}</span>
            <p className="text-lg text-navy-700 max-w-sm">
              {tr('games.tapTarget', { target: TARGET_LABEL })}
            </p>
          </div>
          <button
            type="button"
            className="btn-primary !px-10 !py-5 !text-xl"
            onClick={() => {
              setAnticipating(true)
              voiceService.speak(`Starting Attention Focus. Level ${difficulty}.`)
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
            <span aria-live="polite">{tr('games.found')}: {correct.length} / {cfg.targets}</span>
            <span>{tr('games.wrongTaps')}: {wrongSelections}</span>
            <span className={timeLeft <= 10 ? 'text-red-600' : ''}>
              {tr('games.timeLeft')}: {timeLeft}s
            </span>
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${boardCols(cfg.objects)}, minmax(0,1fr))` }}
            role="group"
            aria-label="Attention symbol grid"
          >
            {board.map((item, i) => {
              const isDone = selected.includes(item.id)
              const isTarget = item.isTarget
              return (
                <motion.button
                  key={item.id}
                  type="button"
                  onClick={(e) => handleTap(item, e)}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{
                    opacity: 1,
                    scale: isDone && isTarget ? [1, 1.12, 1] : 1,
                  }}
                  transition={{ delay: (i % 12) * 0.02, duration: isDone && isTarget ? 0.35 : 0.2 }}
                  whileTap={{ scale: 0.92 }}
                  aria-label={`Symbol ${i + 1}${isDone && isTarget ? ', found' : ''}${isDone && !isTarget ? ', not a target' : ''}`}
                  className={`aspect-square relative rounded-xl text-3xl md:text-4xl flex items-center justify-center border-2 transition-all min-h-[56px] ${
                    phase && isDone
                      ? isTarget
                        ? 'bg-teal-100 border-teal-500 nx-glow'
                        : 'bg-red-50 border-red-300 opacity-60'
                      : isTarget
                      ? 'bg-white border-navy-200 hover:border-teal-500 nx-attention-target'
                      : 'bg-white border-navy-200 hover:border-navy-300'
                  }`}
                >
                  {isTarget && !isDone && (
                    <motion.span
                      className="absolute inset-0 rounded-xl"
                      style={{ boxShadow: '0 0 0 3px rgba(43,179,163,0.18)' }}
                      animate={{ opacity: [0.25, 0.6, 0.25], scale: [0.98, 1.04, 0.98] }}
                      transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      aria-hidden="true"
                    />
                  )}
                  {item.symbol}
                </motion.button>
              )
            })}
          </div>

          {/* Progress bar */}
          <div className="mt-6 mb-2 flex justify-between text-sm font-medium text-navy-500">
            <span>{tr('games.targetsRemaining')}: {cfg.targets - correct.length}</span>
            <span>{Math.round((correct.length / cfg.targets) * 100)}%</span>
          </div>
          <div className="h-3 bg-navy-100 rounded-full overflow-hidden w-full">
            <div
              className="h-full bg-teal-500 rounded-full transition-all"
              style={{ width: `${(correct.length / cfg.targets) * 100}%` }}
            />
          </div>
        </>
      )}

      {result && (
        <GameResult
          session={result.session}
          stats={[
            { label: tr('games.found'), value: `${result.correctCount} / ${cfg.targets}` },
            { label: tr('games.wrongTaps'), value: result.session.mistakes },
            { label: tr('games.missed'), value: result.missed },
            { label: tr('games.timeLeft'), value: `${Math.max(0, timeLeft)}s` },
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
                ? tr('games.focusStronger')
                : result.adaptive.recommended < result.prevDifficulty
                ? tr('games.focusEasier')
                : tr('games.focusGreat'),
          }}
          onPlayAgain={startGame}
          onNextLevel={
            result.prevDifficulty < MAX_LEVEL
              ? () => {
                  const next = result.prevDifficulty + 1
                  localStorage.setItem('neuronest_attention_level', String(next))
                  startGame(next)
                }
              : null
          }
          onNext={() =>
            navigate('/patient/games', {
              state: {
                recommended: result.adaptive.recommended,
                gameType: 'attention',
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