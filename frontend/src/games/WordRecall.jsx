import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Play } from 'lucide-react'
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

// Ten levels. `count` = words to remember, `showMs` = how long they stay on
// screen, `options` = how many choices are offered (targets + distractors).
// `count` can never exceed `options`, or the player would be asked to select
// more words than are actually on screen.
const LEVEL_CONFIG = {
  1: { count: 3, showMs: 3000, options: 6 },
  2: { count: 4, showMs: 2500, options: 7 },
  3: { count: 5, showMs: 2500, options: 8 },
  4: { count: 6, showMs: 2000, options: 9 },
  5: { count: 7, showMs: 2000, options: 10 },
  6: { count: 8, showMs: 1800, options: 12 },
  7: { count: 9, showMs: 1800, options: 14 },
  8: { count: 10, showMs: 1600, options: 16 },
  9: { count: 11, showMs: 1600, options: 18 },
  10: { count: 12, showMs: 1500, options: 20 },
}

// Word pools grown to 20 DISTINCT entries each. Level 10 needs 12 targets plus
// 8 distractors drawn from the same pool, and the original 10-word pools could
// not supply that - they would have shown fewer choices than the level
// advertised. Every word is unique within its pool: a duplicate would let the
// player tap the same word twice while the counter still expected two
// different answers.
const WORD_POOLS = [
  ['apple', 'house', 'table', 'river', 'garden', 'window', 'pencil', 'bridge', 'chair', 'flower',
   'mirror', 'basket', 'candle', 'ladder', 'harbour', 'pillow', 'shovel', 'tunnel', 'violin', 'wallet'],
  ['morning', 'kettle', 'blanket', 'bottle', 'carpet', 'lantern', 'village', 'guitar', 'cushion', 'drawer',
   'engine', 'fabric', 'granary', 'hammer', 'island', 'jungle', 'locket', 'mantle', 'needle', 'orchard'],
  ['gentle', 'wisdom', 'family', 'simple', 'kindness', 'comfort', 'harmony', 'journey', 'spirit', 'bright',
   'calm', 'dream', 'energy', 'faith', 'grace', 'honest', 'ideal', 'joyful', 'keen', 'lively'],
  ['sunrise', 'pebble', 'breeze', 'harbor', 'meadow', 'feather', 'kindred', 'mellow', 'twilight', 'ripple',
   'shadow', 'thunder', 'willow', 'zephyr', 'coral', 'ember', 'frost', 'glimmer', 'horizon', 'lagoon'],
  ['promise', 'treasure', 'whisper', 'graceful', 'blossom', 'silence', 'courage', 'wonder', 'echo', 'fable',
   'glory', 'harvest', 'ivory', 'jubilee', 'kindle', 'legacy', 'marvel', 'nurture', 'origin', 'pilgrim'],
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
  const { tr } = useI18n()
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
    const adaptive = suggestDifficulty({
      accuracy,
      responseTime: elapsed / Math.max(finalSelection.length, 1),
      mistakes,
      currentDifficulty: difficulty,
      recentScores: recentScores.slice(-5),
    })
    const nextLevel = adaptive.recommended
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
        title={tr('games.words')}
        voiceInstruction={() => voiceService.speak('You will see a set of words. Remember them, then tap the ones you saw.')}
        onBack={() => navigate('/patient/games')}
      />
      <GameMeta level={difficulty}>
        {tr('games.rememberWords', { count: cfg.count })}
      </GameMeta>

      {phase === 'intro' && !anticipating && (
        <div className="card text-center py-12">
          <span className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white flex items-center justify-center nx-float">
            <Play size={28} aria-hidden="true" />
          </span>
          <p className="text-lg text-navy-700 mt-5 mb-6">{tr('games.seeWords')}</p>
          <button
            type="button"
            className="btn-primary !px-10 !py-5 !text-xl"
            onClick={() => {
              setAnticipating(true)
              voiceService.speak('Starting Word Recall. Level ' + difficulty + '.')
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
{phase === 'mem' && (
        <div className="card text-center py-10">
          <p className="text-navy-400 mb-6 text-lg">{tr('games.memoriseThese')}</p>
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
          <p className="text-navy-400 text-sm">{tr('games.rememberHint')}</p>
        </div>
      )}

      {phase === 'input' && (
        <div className="card py-8">
          <motion.p
            className="text-center text-lg font-semibold text-navy-700 mb-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {tr('games.whichWords')}
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
              {selected.length} {tr('games.selected')} — {targetWords.filter((t) => selected.includes(t)).length} / {cfg.count} {tr('games.found')}
            </motion.p>
          )}
        </div>
      )}

      {result && (
        <GameResult
          session={result.session}
          stats={[
            { label: tr('games.remembered'), value: `${result.correctCount} / ${cfg.count}` },
            { label: tr('games.mistakes'), value: result.session.mistakes },
            { label: tr('games.picks'), value: result.session.attempts },
            { label: tr('games.time'), value: `${responseTime.toFixed(0)}s` },
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
                ? tr('games.wordStronger')
                : tr('games.mindSharp'),
          }}
          onPlayAgain={startGame}
          onNextLevel={
            result.prevDifficulty < MAX_LEVEL
              ? () => {
                  const next = result.prevDifficulty + 1
                  localStorage.setItem('neuronest_word_level', String(next))
                  startGame(next)
                }
              : null
          }
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