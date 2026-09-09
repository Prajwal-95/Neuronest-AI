import React from 'react'
import { Wifi, WifiOff, RefreshCw } from 'lucide-react'
import { useOffline } from '../offline/OfflineContext'
import { useI18n } from '../services/i18n'

/**
 * Connection + synchronization status indicator.
 * Green: Online + synced. Orange: Offline/saving locally. Blue: syncing.
 */
export default function SyncStatus() {
  const { online, syncStatus, pendingCount, syncNow } = useOffline()
  const { tr } = useI18n()

  let tone = 'bg-teal-50 text-teal-700 border-teal-200'
  let icon = <Wifi size={22} aria-hidden="true" />
  let label = tr('common.synced')

  if (!online) {
    tone = 'bg-amber-50 text-amber-700 border-amber-300'
    icon = <WifiOff size={22} aria-hidden="true" />
    label = `${tr('common.offline')} — ${tr('common.savingLocally')}`
  } else if (syncStatus === 'pending') {
    tone = 'bg-amber-50 text-amber-700 border-amber-300'
    icon = <WifiOff size={22} aria-hidden="true" />
    label = `${tr('common.syncPending')}${pendingCount ? ` (${pendingCount})` : ''}`
  } else if (syncStatus === 'syncing') {
    tone = 'bg-blue-50 text-blue-700 border-blue-200'
    icon = <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
    label = 'Syncing…'
  }

  return (
    <button
      type="button"
      onClick={() => syncNow()}
      aria-label="Connection status. Click to sync now."
      className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${tone} hover:opacity-90 transition-opacity`}
    >
      {icon}
      <span>{label}</span>
      {!online && (
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
      )}
    </button>
  )
}