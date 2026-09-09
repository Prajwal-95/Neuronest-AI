import React, { useRef } from 'react'
import { motion } from 'framer-motion'
import { getReducedMotion } from './device'

/**
 * Real 3D memory card with CSS perspective.
 * - Hover lifts + tilts toward cursor (desktop only)
 * - Click performs a physical-feeling spring flip (rotateY)
 * - Match: glow + subtle rise
 * - Mismatch: soft shake (handled by parent via shakeKey)
 */
export default function MemoryCard({
  symbol,
  isFlipped,
  isMatched,
  onFlip,
  disabled,
  ariaLabel,
  shakeKey = null,
}) {
  const cardRef = useRef(null)
  const reduced = getReducedMotion()

  const handlePointerMove = (e) => {
    if (reduced || isFlipped || disabled || !cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width - 0.5
    const py = (e.clientY - rect.top) / rect.height - 0.5
    cardRef.current.style.setProperty('--tilt-x', `${px * 12}deg`)
    cardRef.current.style.setProperty('--tilt-y', `${-py * 9}deg`)
  }

  const handlePointerLeave = () => {
    if (!cardRef.current) return
    cardRef.current.style.setProperty('--tilt-x', '0deg')
    cardRef.current.style.setProperty('--tilt-y', '0deg')
  }

  // Concrete fallback for reduced motion
  if (reduced) {
    return (
      <button
        type="button"
        onClick={onFlip}
        disabled={disabled || isFlipped || isMatched}
        aria-label={ariaLabel}
        aria-pressed={isFlipped}
        className={`aspect-square min-h-[60px] rounded-xl border-2 text-4xl md:text-5xl flex items-center justify-center transition-colors ${
          isMatched
            ? 'bg-teal-100 border-teal-500 text-teal-700'
            : isFlipped
            ? 'bg-white border-navy-300 text-navy-800'
            : 'bg-navy-700 border-navy-700 text-white'
        }`}
      >
        {isFlipped || isMatched ? symbol : '❓'}
      </button>
    )
  }

  return (
    <motion.div
      animate={isMatched ? { y: -6, scale: 1.04 } : shakeKey ? { x: [0, -4, 4, -4, 4, 0] } : { y: 0 }}
      transition={isMatched ? { type: 'spring', stiffness: 200, damping: 15 } : { duration: 0.35 }}
    >
      <div
        className="flip-card"
        style={{
          perspective: 900,
          transform: 'rotateX(var(--tilt-y, 0deg)) rotateY(var(--tilt-x, 0deg))',
        }}
        ref={cardRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <button
          type="button"
          onClick={(e) => onFlip(e)}
          disabled={disabled || isFlipped || isMatched}
          aria-label={ariaLabel}
          aria-pressed={isFlipped}
          className={`flip-inner aspect-square min-h-[60px] w-full rounded-xl ${isFlipped || isMatched ? 'flipped' : ''}`}
        >
          {/* Front face: hidden card back */}
          <span className="flip-face rounded-xl border-2 border-navy-700 bg-gradient-to-br from-navy-700 to-navy-600 text-white text-3xl md:text-4xl shadow-lg">
            ❓
          </span>
          {/* Back face: symbol */}
          <span
            className={`flip-face flip-back rounded-xl border-2 text-4xl md:text-5xl ${
              isMatched
                ? 'bg-teal-100 border-teal-500 text-teal-700 nx-glow'
                : 'bg-white border-navy-300 text-navy-800'
            }`}
          >
            {symbol}
          </span>
        </button>
      </div>
    </motion.div>
  )
}