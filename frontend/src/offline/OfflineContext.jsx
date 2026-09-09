import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../services/api'
import { useAnimStore } from '../animation/animStore'
import {
  getPendingSessions,
  markAllSynced,
  removeByClientId,
  saveSessionLocally,
  clearSynced,
} from './sessionQueue'

const OfflineContext = createContext(null)

export function OfflineProvider({ children }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [syncStatus, setSyncStatus] = useState('synced') // 'synced' | 'pending' | 'syncing' | 'error'
  const [pendingCount, setPendingCount] = useState(0)

  const refreshPending = useCallback(async () => {
    try {
      const pending = await getPendingSessions()
      setPendingCount(pending.length)
    } catch {
      setPendingCount(0)
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncStatus('pending')
      return { synced: 0, failed: 0 }
    }
    const pending = await getPendingSessions()
    if (!pending.length) {
      setSyncStatus('synced')
      setPendingCount(0)
      return { synced: 0, failed: 0 }
    }
    setSyncStatus('syncing')
    try {
      const payload = pending.map((p) => {
        const d = p.data || {}
        return {
          client_id: p.client_id,
          game_type: d.game_type,
          difficulty: d.difficulty,
          score: d.score,
          accuracy: d.accuracy,
          response_time: d.response_time,
          mistakes: d.mistakes,
          attempts: d.attempts,
          completed: d.completed,
          offline_created: true,
          created_at: d.created_at || p.created_at,
        }
      })
      const res = await api.post('/sync/sessions', { sessions: payload })
      if (res.synced && res.synced.length) {
        await markAllSynced()
        await clearSynced() // retention policy: remove synced after upload
        // Notify the animation layer for the "Progress synchronized" moment
        useAnimStore.getState().pulseSync()
      }
      // Client ids that were duplicates were rejected by server; remove them too
      const stillPending = await getPendingSessions()
      if (!stillPending.length) {
        setSyncStatus('synced')
      } else {
        setSyncStatus('pending')
      }
      await refreshPending()
      return { synced: res.synced?.length || 0, failed: res.failed || 0 }
    } catch (err) {
      setSyncStatus('error')
      await refreshPending()
      return { synced: 0, failed: pending.length }
    }
  }, [refreshPending])

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      syncNow()
    }
    const handleOffline = () => {
      setOnline(false)
      setSyncStatus('pending')
      refreshPending()
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    refreshPending()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [syncNow, refreshPending])

  const saveSession = useCallback(
    async (session, { onlineValue } = {}) => {
      const isOnline = onlineValue !== undefined ? onlineValue : navigator.onLine
      const record = await saveSessionLocally(session)
      await refreshPending()
      if (isOnline) {
        // Try immediate sync; if it fails, remains pending
        await syncNow()
      } else {
        setSyncStatus('pending')
      }
      return record
    },
    [syncNow, refreshPending]
  )

  return (
    <OfflineContext.Provider
      value={{
        online,
        syncStatus,
        pendingCount,
        syncNow,
        saveSession,
        refreshPending,
      }}
    >
      {children}
    </OfflineContext.Provider>
  )
}

export function useOffline() {
  return useContext(OfflineContext)
}