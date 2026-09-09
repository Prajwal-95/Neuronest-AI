import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * "Today's Cognitive Journey" — a horizontal chain of activity nodes.
 * Completed nodes glow, upcoming ones stay dim. A connector line draws
 * itself between completed steps. Creates curiosity about what's next.
 *
 * step statuses: 'done' | 'current' | 'locked' | 'mystery'
 */
export default function CognitiveJourney({ steps }) {
  return (
    <div className="w-full" aria-label="Today's cognitive journey">
      <div className="flex items-center justify-between">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <React.Fragment key={step.id}>
              <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
                <motion.div
                  animate={
                    step.status === 'done'
                      ? { scale: [1, 1.15, 1] }
                      : step.status === 'current'
                      ? { scale: [1, 1.08, 1] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 1.6, repeat: step.status === 'current' ? Infinity : 0 }}
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shrink-0 border-2 ${
                    step.status === 'done'
                      ? 'bg-teal-500 border-teal-400 text-white nx-glow'
                      : step.status === 'current'
                      ? 'bg-navy-700 border-teal-500 text-white'
                      : step.status === 'mystery'
                      ? 'bg-navy-100 border-navy-200 text-navy-400'
                      : 'bg-navy-50 border-navy-100 text-navy-400'
                  }`}
                  aria-label={`${step.label}${step.status === 'done' ? ' completed' : ''}`}
                >
                  {step.status === 'done' ? '✓' : step.status === 'mystery' ? '?' : step.icon || i + 1}
                </motion.div>
                <span
                  className={`text-[11px] text-center leading-tight ${
                    step.status === 'done'
                      ? 'text-teal-700 font-semibold'
                      : step.status === 'current'
                      ? 'text-navy-700 font-semibold'
                      : 'text-navy-400'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line */}
              {!isLast && (
                <div className="flex-1 h-1 bg-navy-100 rounded-full overflow-hidden mx-1 mb-8 relative">
                  {steps[i + 1] && step.status === 'done' && (
                    <motion.div
                      className="absolute inset-y-0 left-0 bg-teal-500"
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 0.8, ease: 'easeInOut' }}
                    />
                  )}
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}
