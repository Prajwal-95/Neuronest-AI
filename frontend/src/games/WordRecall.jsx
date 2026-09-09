import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
import { useOffline } from '../offline/OfflineContext'
import { voiceService } from '../services/voice'
import { buildSession } from './gameEngine'
import { makeClientId } from '../offline/sessionQueue'
import GameResult from '../animation/GameResult'
import GameHeader, { GameMeta } from '../animation/GameHeader'
import GameStartSequence from '../animation/GameStartSequence'
import { useSceneMode } from '../animation/useSceneMode'
import { useAnimStore } from '../animation/animStore'

const LEVEL_CONFIG = {
  1: { count: 3, showMs: 3000, options: 6 },
  2: { count: 4, showMs: 2500, options: 7 },
  3: { count: 5, showMs: 2500, options: 8 },
  4: { count: 6, showMs: 2000, options: 9 },
  5: { count: 7, showMs: 2000, options: 10 },
}

const WORD_POOLS = [
  ['apple', 'house', 'table', 'river', 'garden', 'window', 'pencil', 'bridge', 'chair', 'flower'],
  ['morning', 'candle', 'kettle', 'basket', 'blanket', 'bottle', 'carpet', 'lantern', 'village', 'guitar'],
  ['gentle', 'wisdom', 'memory', 'family', 'simple', 'kindness', 'comfort', 'harmony', 'journey', 'spirit'],
  ['sunrise', 'pebble', 'breeze', 'harbor', 'meadow', 'feather', 'shelter', 'lantern', 'kindred', 'mellow'],
  ['comfort', 'promise', 'shelter', 'treasure', 'whisper', 'graceful', 'blossom', 'silence', 'courage', 'wonder'],
]

function pickWords(count, pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
export default function WordRecall() {
  const navigate = useNavigate()
  const { saveSession } = useOffline()
  useSceneMode('game-words')
  const setSceneEnergy = useAnimStore((s) => s.setEnergy)
  const [difficulty, setDifficulty] = useState(() => Number(localStorage.getItem('neuronest_word_level')) || 1)
  const cfg = LEVEL_CONFIG[difficulty] || LEVEL_CONFIG[1]

  const [phase, setPhase] = useState('intro')
  const [targetWords, setTargetWords] = useState([])
  const [options, setOptions] = useState([])
  const [selected, setSelected] = useState([])
  const [startTime, setStartTime] = useState(null)
  const [responseTime, setResponseTime] = useState(0)
  const [mistakes, setMistakes] = useState(0)
  const [result, setResult] = useState(null)
  const [anticipating, setAnticipating] = useState(false)

  const startGame = () => {
    const pool = WORD_POOLS[Math.floor(Math.random() * WORD_POOLS.length)]
    const targets = pickWords(cfg.count, pool)
    const distractors = pool.filter((w) => !targets.includes(w))
    const extra = pickWords(Math.max(cfg.options - cfg.count, 0), distractors)
    const allOpts = shuffle([...targets, ...extra])
    setTargetWords(targets)
    setOptions(allOpts)
    setSelected([])
    setMistakes(0)
    setResult(null)
    setStartTime(Date.now())
    setPhase('mem')
    voiceService.speak('Word Recall. Remember these ' + cfg.count + ' words carefully.')
    setTimeout(() => voiceService.speak(targets.join(', ')), 800)
    setTimeout(() => {
      setPhase('input')
      setTimeout(() => voiceService.speak('Which words did you see? Tap each one you remember.'), 300)
    }, cfg.showMs)
  }

  const handleTap = (word) => {
    if (phase !== 'input') return
    if (selected.includes(word)) return
    const next = [...selected, word]
    setSelected(next)
    if (targetWords.includes(word)) {
      voiceService.speak(word)
      setSceneEnergy((en) => Math.min(1, en + 0.08))
    } else {
      setMistakes((m) => m + 1)
      voiceService.speak('No, ' + word + ' was not in the list.')
    }
    const foundAll = targetWords.every((t) => next.includes(t))
    if (foundAll || next.length >= cfg.options) {
      finishGame(next)
    }
  }

  const finishGame = (finalSelection) => {
    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0
    const found = targetWords.filter((t) => finalSelection.includes(t)).length
    const accuracy = found / Math.max(targetWords.length, 1)
    const recentScores = JSON.parse(localStorage.getItem('neuronest_recent_scores') || '[]')
    const session = buildSession({
      gameType: 'word_recall',
      difficulty,
      accuracy,
      responseTime: elapsed / Math.max(finalSelection.length, 1),
      mistakes,
      attempts: finalSelection.length,
      completed: true,
      offline: !navigator.onLine,
      recentScores: recentScores.slice(-5),
      clientId: makeClientId(),
    })
    const nextLevel = Math.min(5, difficulty + 1)
    const adaptive = {
      recommended: nextLevel,
      reason: 'Level ' + difficulty + ' completed - great job! The next round will be Level ' + nextLevel + '.',
    }
    saveSession(session)
    localStorage.setItem('neuronest_recent_scores', JSON.stringify([...recentScores.slice(-9), session.score]))
    localStorage.setItem('neuronest_word_level', String(nextLevel))
    setDifficulty(nextLevel)
    setResult({ session, adaptive, prevDifficulty: difficulty, correctCount: found })
    setPhase('result')
    setResponseTime(elapsed)
    voiceService.speak('Well done! You remembered ' + found + ' words.')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <GameHeader
        title="Word Recall"
        voiceInstruction={() => voiceService.speak('You will see a set of words. Remember them, then tap the ones you saw.')}
        onBack={() => navigate('/patient/games')}
      />
      <GameMeta level={difficulty}>
        Remember {cfg.count} words then pick them out
      </GameMeta>

      {phase === 'intro' && !anticipating && (
        <div className="card text-center py-12">
          <span className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center nx-float">
            <Play size={28} aria-hidden="true" />
          </span>
          <p className="text-lg text-navy-700 mt-5 mb-6">You will see a set of words. Remember them, then tap the ones you saw.</p>
          <button
            type="button"
            className="btn-primary !px-10 !py-5 !text-xl"
            onClick={() => {
              setAnticipating(true)
              voiceService.speak('Starting Word Recall. Level ' + difficulty + '.')
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
{phase === 'mem' && (
        <div className="card text-center py-10">
          <p className="text-navy-400 mb-6 text-lg">Memorise these words:</p>
          <div className="flex flex-wrap gap-4 justify-center mb-6">
            {targetWords.map((w, i) => (
              <motion.span
                key={w}
                initial={{ opacity: 0, y: 10, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ delay: i * 0.2, type: 'spring', stiffness: 180, damping: 15 }}
                className="px-6 py-3 rounded-2xl bg-navy-700 text-white text-2xl font-semibold nx-glow"
              >
                {w}
              </motion.span>
            ))}
          </div>
          <p className="text-navy-400 text-sm">Remember these words…</p>
        </div>
      )}

      {phase === 'input' && (
        <div className="card py-8">
          <motion.p
            className="text-center text-lg font-semibold text-navy-700 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            Which words did you see? Tap each one you remember.
          </motion.p>
          <div className="flex flex-wrap gap-3 justify-center">
            {options.map((w, idx) => {
              const chosen = selected.includes(w)
              const isTarget = targetWords.includes(w)
              return (
                <motion.button
                  key={w}
                  type="button"
                  onClick={() => handleTap(w)}
                  disabled={chosen}
                  whileTap={{ scale: 0.95 }}
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05, type: 'spring', stiffness: 180, damping: 14 }}
                  className={'px-5 py-3 rounded-xl text-xl font-semibold border-2 transition-all ' + (chosen ? (isTarget ? 'bg-teal-100 border-teal-500 text-teal-700 ' + (isTarget ? 'nx-glow' : '') : 'bg-red-50 border-red-300 text-red-600') : 'bg-white border-navy-200 text-navy-800 hover:border-teal-400')}
                  aria-pressed={chosen}
                >
                  {w}
                </motion.button>
              )
            })}
          </div>
          {selected.length > 0 && (
            <motion.p
              className="text-center text-sm text-navy-500 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {selected.length} selected - {targetWords.filter((t) => selected.includes(t)).length} / {cfg.count} found
            </motion.p>
          )}
        </div>
      )}

      {result && (
        <GameResult
          session={result.session}
          stats={[
            { label: 'Remembered', value: `${result.correctCount} / ${cfg.count}` },
            { label: 'Mistakes', value: result.session.mistakes },
            { label: 'Picks', value: result.session.attempts },
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
                ? 'Your word memory is growing stronger.'
                : 'Every round keeps your mind sharp.',
          }}
          onPlayAgain={startGame}
          onNext={() =>
            navigate('/patient/games', {
              state: { recommended: result.adaptive.recommended, gameType: 'word_recall', reason: result.adaptive.reason },
            })
          }
        />
      )}
    </div>
  )
}