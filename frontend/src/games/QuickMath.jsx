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

// Ten levels. `max` = the largest operand, `ops` = which operations appear,
// `rounds` = questions per session, `options` = how many choices are offered.
// Multiplication and division only appear once the player is well past the
// single-digit range, so the top levels genuinely change the KIND of
// arithmetic rather than just making the numbers bigger.
const LEVEL_CONFIG = {
  1: { max: 10, ops: ['+'], rounds: 5, options: 3 },
  2: { max: 15, ops: ['+'], rounds: 5, options: 3 },
  3: { max: 20, ops: ['+', '-'], rounds: 5, options: 3 },
  4: { max: 50, ops: ['+', '-'], rounds: 6, options: 4 },
  5: { max: 100, ops: ['+', '-'], rounds: 6, options: 4 },
  6: { max: 200, ops: ['+', '-'], rounds: 7, options: 4 },
  7: { max: 500, ops: ['+', '-'], rounds: 7, options: 4 },
  8: { max: 1000, ops: ['+', '-'], rounds: 8, options: 4 },
  9: { max: 12, ops: ['*'], rounds: 8, options: 4 },
  10: { max: 20, ops: ['*', '/'], rounds: 8, options: 4 },
}

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

function generateProblem(cfg) {
  const op = cfg.ops[Math.floor(Math.random() * cfg.ops.length)]
  let a, b, answer, text, spoken
  if (op === '+') {
    a = randInt(1, cfg.max); b = randInt(1, cfg.max); answer = a + b
    text = a + ' + ' + b; spoken = a + ' plus ' + b
  } else if (op === '-') {
    a = randInt(1, cfg.max); b = randInt(1, a); answer = a - b
    text = a + ' - ' + b; spoken = a + ' minus ' + b
  } else if (op === '*') {
    // `cfg.max` is the multiplication TABLE (largest factor), not the product,
    // so the answer stays in the same range as the other offered options
    // instead of dwarfing all three distractors.
    a = randInt(2, cfg.max); b = randInt(2, cfg.max); answer = a * b
    text = a + ' × ' + b; spoken = a + ' times ' + b
  } else {
    // Division must always be EXACT, otherwise no offered option is correct.
    // The divisor is picked first and the quotient multiplied back out, which
    // guarantees answer * b === a by construction.
    b = randInt(2, cfg.max); const q = randInt(2, cfg.max)
    a = b * q; answer = q
    text = a + ' ÷ ' + b; spoken = a + ' divided by ' + b
  }
  const opts = new Set([answer])
  let g = 0
  while (opts.size < cfg.options && g < 50) {
    g++
    const d = randInt(1, Math.max(3, Math.ceil(cfg.max / 5)))
    const c = Math.random() < 0.5 ? answer + d : answer - d
    if (c >= 0 && c !== answer) opts.add(c)
  }
  let f = 1
  while (opts.size < cfg.options) {
    if (!opts.has(answer + f)) opts.add(answer + f)
    else if (answer - f >= 0 && !opts.has(answer - f)) opts.add(answer - f)
    f++
  }
  const shuffled = [...opts].sort(() => Math.random() - 0.5)
  return { a, b, op, answer, text, spoken, options: shuffled }
}
export default function QuickMath() {
  const navigate = useNavigate()
  const { saveSession } = useOffline()
  const { tr } = useI18n()
  useSceneMode('game-math')
  const setSceneEnergy = useAnimStore((s) => s.setEnergy)
  const [difficulty, setDifficulty] = useState(() => Number(localStorage.getItem('neuronest_math_level')) || 1)
  const cfg = LEVEL_CONFIG[difficulty] || LEVEL_CONFIG[1]
  const [phase, setPhase] = useState('intro')
  const [problems, setProblems] = useState([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState(0)
  const [startTime, setStartTime] = useState(null)
  const [responseTime, setResponseTime] = useState(0)
  const [result, setResult] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [anticipating, setAnticipating] = useState(false)
  const currentProblem = problems[currentIdx] || null

  const startGame = () => {
    const probs = Array.from({ length: cfg.rounds }, () => generateProblem(cfg))
    setProblems(probs); setCurrentIdx(0); setCorrect(0); setWrong(0)
    setResult(null); setFeedback(null); setStartTime(Date.now()); setPhase('playing')
    voiceService.speak('Quick Math. Solve ' + cfg.rounds + ' simple problems.')
    setTimeout(() => { if (probs[0]) voiceService.speak('What is ' + probs[0].spoken + '?') }, 500)
  }

  const handleAnswer = (value) => {
    if (phase !== 'playing' || !currentProblem || feedback) return
    if (value === currentProblem.answer) {
      setCorrect((c) => c + 1); setFeedback('correct')
      setSceneEnergy((en) => Math.min(1, en + 0.1))
      voiceService.speak('Correct!')
    } else {
      setWrong((w) => w + 1); setFeedback('wrong')
      voiceService.speak('Not quite. The answer is ' + currentProblem.answer + '.')
    }
    setTimeout(() => {
      setFeedback(null)
      const next = currentIdx + 1
      if (next >= problems.length) {
        const totalCorrect = correct + (value === currentProblem.answer ? 1 : 0)
        finishGame(totalCorrect, next)
      } else {
        setCurrentIdx(next)
        setTimeout(() => voiceService.speak('What is ' + problems[next].spoken + '?'), 300)
      }
    }, 1500)
  }

  const finishGame = (totalCorrect, totalAnswered) => {
    const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0
    const accuracy = totalCorrect / Math.max(totalAnswered, 1)
    const recentScores = JSON.parse(localStorage.getItem('neuronest_recent_scores') || '[]')
    const session = buildSession({
      gameType: 'quick_math', difficulty, accuracy,
      responseTime: elapsed / Math.max(totalAnswered, 1),
      mistakes: wrong, attempts: totalAnswered, completed: true,
      offline: !navigator.onLine, recentScores: recentScores.slice(-5), clientId: makeClientId(),
    })
    const adaptive = suggestDifficulty({
      accuracy,
      responseTime: elapsed / Math.max(totalAnswered, 1),
      mistakes: wrong,
      currentDifficulty: difficulty,
      recentScores: recentScores.slice(-5),
    })
    const nextLevel = adaptive.recommended
    saveSession(session)
    localStorage.setItem('neuronest_recent_scores', JSON.stringify([...recentScores.slice(-9), session.score]))
    localStorage.setItem('neuronest_math_level', String(nextLevel))
    setDifficulty(nextLevel); setResult({ session, adaptive, prevDifficulty: difficulty }); setPhase('result'); setResponseTime(elapsed)
    voiceService.speak('Well done! Score ' + session.score + ' out of 100.')
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <GameHeader
        title={tr('games.math')}
        voiceInstruction={() => voiceService.speak('Quick Math. Solve simple addition and subtraction problems.')}
        onBack={() => navigate('/patient/games')}
      />
      <GameMeta level={difficulty}>
        {tr('games.problemsSolve', { count: cfg.rounds })}
      </GameMeta>

      {phase === 'intro' && !anticipating && (
        <div className="card text-center py-12">
          <span className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center text-3xl font-bold nx-float">+</span>
          <p className="text-lg text-navy-700 mt-5 mb-6">{tr('games.solveMath')}</p>
          <button
            type="button"
            className="btn-primary !px-10 !py-5 !text-xl"
            onClick={() => {
              setAnticipating(true)
              voiceService.speak('Starting Quick Math. Level ' + difficulty + '.')
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
{phase === 'playing' && currentProblem && (
        <div className="card text-center py-8">
          <div className="flex justify-center gap-2 mb-6">
            {problems.map((_, i) => (
              <motion.span
                key={i}
                className={'w-3 h-3 rounded-full ' + (i < currentIdx ? 'bg-teal-500' : i === currentIdx ? 'bg-navy-400 nx-glow' : 'bg-navy-100')}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.05 }}
              />
            ))}
          </div>
          <motion.div
            key={currentIdx}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 160, damping: 16 }}
            className="mb-8"
          >
            <p className="text-sm text-navy-400 mb-2">{tr('games.question')} {currentIdx + 1} / {problems.length}</p>
            <p className="text-6xl md:text-7xl font-bold text-navy-800 tracking-wide">{currentProblem.text} = ?</p>
          </motion.div>
          <div className="flex flex-wrap gap-4 justify-center">
            {currentProblem.options.map((opt) => (
              <motion.button
                key={opt}
                type="button"
                onClick={() => handleAnswer(opt)}
                disabled={!!feedback}
                whileTap={{ scale: 0.94 }}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15, type: 'spring', stiffness: 200, damping: 14 }}
                className={'w-24 h-24 md:w-28 md:h-28 rounded-2xl text-3xl md:text-4xl font-bold border-3 transition-all ' + (feedback && opt === currentProblem.answer ? 'bg-teal-100 border-teal-500 text-teal-700 nx-glow' : feedback ? 'bg-white border-navy-200 text-navy-400 opacity-50' : 'bg-white border-navy-300 text-navy-800 hover:border-teal-500 hover:bg-mind')}
              >
                {opt}
              </motion.button>
            ))}
          </div>
          {feedback && (
            <motion.p
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 12 }}
              className={'mt-6 text-lg font-semibold ' + (feedback === 'correct' ? 'text-teal-600' : 'text-amber-600')}
            >
              {feedback === 'correct' ? tr('games.correctMsg') : tr('games.wrongMsg', { answer: currentProblem.answer })}
            </motion.p>
          )}
        </div>
      )}

      {result && (
        <GameResult
          session={result.session}
          stats={[
            { label: tr('games.correct'), value: correct + ' / ' + result.session.attempts },
            { label: tr('games.mistakes'), value: result.session.mistakes },
            { label: tr('games.time'), value: responseTime.toFixed(0) + 's' },
            { label: tr('games.problems'), value: result.session.attempts },
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
                ? tr('games.numberSharp')
                : tr('games.mindSharp'),
          }}
          onPlayAgain={startGame}
          onNextLevel={
            result.prevDifficulty < MAX_LEVEL
              ? () => {
                  const next = result.prevDifficulty + 1
                  localStorage.setItem('neuronest_math_level', String(next))
                  startGame(next)
                }
              : null
          }
          onNext={() =>
            navigate('/patient/games', {
              state: { recommended: result.adaptive.recommended, gameType: 'quick_math', reason: result.adaptive.reason },
            })
          }
        />
      )}
    </div>
  )
}