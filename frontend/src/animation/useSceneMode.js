import { useEffect } from 'react'
import { useAnimStore } from './animStore'

/**
 * Set the global scene mode when a page mounts.
 * Automatically resets to 'ambient' on unmount.
 *
 * Usage:
 *   useSceneMode('home')      // PatientHome
 *   useSceneMode('game-memory') // MemoryMatch
 *   useSceneMode('caregiver')  // CaregiverHome
 */
export function useSceneMode(mode) {
  const setSceneMode = useAnimStore((s) => s.setSceneMode)
  const setEnergy = useAnimStore((s) => s.setEnergy)
  
  useEffect(() => {
    setSceneMode(mode)
    return () => setSceneMode('ambient')
  }, [mode, setSceneMode])

  // Return setEnergy so pages can dynamically adjust it
  return setEnergy
}
