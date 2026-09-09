/**
 * Device capability detection and reduced-motion utilities.
 * Used to adapt 3D quality, particle counts, and animation intensity.
 */

// Module-level singletons (computed once)
let _tier = null
let _reducedMotion = null

function computeTier() {
  if (typeof navigator === 'undefined') return 'medium'
  const cores = navigator.hardwareConcurrency || 4
  const mem = navigator.deviceMemory || 4
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0

  // High: 8+ cores, 8GB+ RAM, not touch primary
  if (cores >= 8 && mem >= 8 && !isTouch) return 'high'
  // Low: <= 2 cores or <= 2GB
  if (cores <= 2 || mem <= 2) return 'low'
  return 'medium'
}

export function getPerfTier() {
  if (_tier === null) _tier = computeTier()
  return _tier
}

export function getReducedMotion() {
  if (_reducedMotion === null) {
    if (typeof window === 'undefined') {
      _reducedMotion = false
    } else {
      _reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }
  }
  return _reducedMotion
}

/** Number of particles based on tier */
export function getParticleCount() {
  const tier = getPerfTier()
  if (tier === 'high') return 120
  if (tier === 'medium') return 60
  return 30
}

/** Device pixel ratio cap based on tier */
export function getDpr() {
  const tier = getPerfTier()
  if (tier === 'high') return [1, 2]
  if (tier === 'medium') return [1, 1.5]
  return [1, 1]
}

/** True if we should skip heavy camera motion */
export function shouldAnimateCamera() {
  return !getReducedMotion() && getPerfTier() !== 'low'
}
