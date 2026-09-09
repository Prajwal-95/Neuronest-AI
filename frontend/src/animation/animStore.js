import { create } from 'zustand'

/**
 * Central animation / game-state store.
 * Connects game completion, level changes, sync events
 * to the visual layer (3D scene, overlays, particles).
 *
 * States:
 *   sceneMode: 'ambient' | 'home' | 'game-memory' | 'game-sequence' |
 *              'game-attention' | 'game-math' | 'game-words' | 'caregiver' | 'analytics'
 *   energy: 0..1 — how "energetic" the environment should be
 *   levelUp: { seq, level, direction, message } | null
 *   burst: { id, x, y } | null — DOM success burst position
 *   syncPulse: number — increments on sync
 *   recentScore: number — latest game score (0-100)
 */
export const useAnimStore = create((set, get) => ({
  sceneMode: 'ambient',
  energy: 0.5,
  levelUp: null,
  burst: null,
  syncPulse: 0,
  recentScore: 0,
  _levelSeq: 0,

  setSceneMode: (mode) => set({ sceneMode: mode }),

  setEnergy: (energy) =>
    set((s) => {
      const next = typeof energy === 'function' ? energy(s.energy) : energy
      return { energy: Math.max(0, Math.min(1, next)) }
    }),

  triggerLevelUp: (level, direction = 'up', message = '') => {
    const seq = get()._levelSeq + 1
    set({
      _levelSeq: seq,
      levelUp: { seq, level, direction, message },
      energy: direction === 'up' ? Math.min(1, get().energy + 0.15) : Math.max(0, get().energy - 0.1),
    })
  },

  clearLevelUp: () => set({ levelUp: null }),

  triggerBurst: (x, y) => {
    const id = Date.now() + Math.random()
    set({ burst: { id, x, y } })
    // Auto-clear after animation
    setTimeout(() => {
      const current = get().burst
      if (current && current.id === id) set({ burst: null })
    }, 1200)
  },

  pulseSync: () => set((s) => ({ syncPulse: s.syncPulse + 1 })),

  setRecentScore: (score) => set({ recentScore: score }),
}))
