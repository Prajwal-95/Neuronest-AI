import React, { useState } from 'react'
import { motion } from 'framer-motion'
import { Heart, ArrowRight, Check } from 'lucide-react'
import {
  WELLBEING_QUESTIONS, checkinMessage, scoreCheckin, CONCERN_LEVELS,
} from '../services/checkin'
import { voiceService } from '../services/voice'
import { useAuth } from '../auth/AuthContext'

/**
 * Pre-game wellbeing check-in: 4 caring questions, 4 tap-able options each.
 * No typing anywhere. Answers are advisory context for the caregiver, never a
 * clinical judgement.
 */
export default function PreGameCheckin({ onDone, onSkip }) {
  const { user } = useAuth()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [done, setDone] = useState(false)

  const q = WELLBEING_QUESTIONS[step]

  const choose = (value) => {
    const next = { ...answers, [q.id]: value }
    setAnswers(next)
    voiceService.speak(q.options.find((o) => o.value === value)?.label || '')
    if (step + 1 < WELLBEING_QUESTIONS.length) {
      setStep((s) => s + 1)
    } else {
      setDone(true)
    }
  }

  const message = checkinMessage(answers, user?.name?.split(' ')[0])

  if (done) {
    return (
      <motion.div
        className="card text-center flex flex-col items-center gap-5"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <span
          className={`w-20 h-20 rounded-3xl flex items-center justify-center ${
            scoreCheckin(answers).level === CONCERN_LEVELS.HIGH
              ? 'bg-amber-50 text-amber-600'
              : 'bg-teal-50 text-teal-600'
          }`}
        >
          <Heart size={38} aria-hidden="true" />
        </span>
        <p className="text-xl text-navy-700 leading-relaxed max-w-lg">{message}</p>
        <button
          type="button"
          onClick={() => onDone(answers)}
          className="glass-btn glass-btn-primary"
        >
          <span className="inline-flex items-center gap-2">
            <Check size={18} aria-hidden="true" />
            Let us begin
          </span>
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="card flex flex-col gap-5"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      key={q.id}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-teal-600 uppercase tracking-[0.18em]">
          Before we start
        </p>
        <p className="text-sm text-navy-400 font-semibold">
          {step + 1} of {WELLBEING_QUESTIONS.length}
        </p>
      </div>

      {/* Progress dots */}
      <div className="flex gap-1.5" aria-hidden="true">
        {WELLBEING_QUESTIONS.map((item, i) => (
          <span
            key={item.id}
            className={`h-1.5 rounded-full flex-1 transition-colors ${
              i <= step ? 'bg-teal-500' : 'bg-navy-100'
            }`}
          />
        ))}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-4xl" aria-hidden="true">{q.emoji}</span>
        <h2 className="text-2xl font-bold text-navy-800">{q.question}</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {q.options.map((opt) => {
          const selected = answers[q.id] === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => choose(opt.value)}
              aria-pressed={selected}
              className={`flex items-center gap-3 rounded-2xl border-2 px-5 py-4 text-left
                font-semibold transition-all active:scale-[0.98]
                ${
                  selected
                    ? 'border-teal-500 bg-mind text-teal-800'
                    : 'border-navy-100 bg-white text-navy-700 hover:border-teal-400'
                }`}
            >
              <span className="text-2xl" aria-hidden="true">{opt.emoji}</span>
              <span className="text-lg">{opt.label}</span>
            </button>
          )
        })}
      </div>

      {onSkip && (
        <button
          type="button"
          onClick={() => onSkip(answers)}
          className="glass-btn glass-btn-info self-start"
        >
          <span className="inline-flex items-center gap-2">
            <ArrowRight size={18} aria-hidden="true" />
            Skip and start playing
          </span>
        </button>
      )}
    </motion.div>
  )
}
