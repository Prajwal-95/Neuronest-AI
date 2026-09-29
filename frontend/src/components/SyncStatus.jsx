import React from 'react'
import { Wifi, WifiOff, RefreshCw, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useOffline } from '../offline/OfflineContext'
import { useI18n } from '../services/i18n'

/**
 * Connection + synchronization status indicator.
 * Green: Online + synced. Amber: Offline/saving locally. Blue: syncing.
 * Human-friendly wording for elderly users — no technical jargon.
 */
export default function SyncStatus() {
  const { online, syncStatus, pendingCount, syncNow } = useOffline()
  const { tr } = useI18n()

  let tone = 'bg-teal-500/15 text-teal-300 border-teal-400/30'
  let icon = <Wifi size={20} aria-hidden="true" />
  let label = tr('common.synced')

  if (!online) {
    tone = 'bg-amber-400/15 text-amber-300 border-amber-400/30'
    icon = <WifiOff size={20} aria-hidden="true" />
    label = `${tr('common.offline')} — ${tr('common.savingLocally')}`
  } else if (syncStatus === 'pending') {
    tone = 'bg-amber-400/15 text-amber-300 border-amber-400/30'
    icon = <WifiOff size={20} aria-hidden="true" />
    label = `${tr('common.syncPending')}${pendingCount ? ` (${pendingCount})` : ''}`
  } else if (syncStatus === 'syncing') {
    tone = 'bg-blue-400/15 text-blue-300 border-blue-400/30'
    icon = <RefreshCw size={20} className="animate-spin" aria-hidden="true" />
    label = 'Syncing…'
  }

  return (
    <button
      type="button"
      onClick={syncNow}
      aria-label="Connection status. Click to sync now."
      className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs md:text-sm font-semibold transition-all hover:opacity-90 ${tone}`}
    >
      {icon}
      <AnimatePresence mode="wait">
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.2 }}
          className="hidden sm:inline"
        >
          {label}
        </motion.span>
      </AnimatePresence>
      {!online && (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
        </span>
      )}
      {online && syncStatus === 'synced' && (
        <CheckCircle2 size={14} className="opacity-70 hidden sm:inline" aria-hidden="true" />
      )}
    </button>
  )
}