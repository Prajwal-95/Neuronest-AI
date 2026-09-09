import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2, CloudUpload } from 'lucide-react'
import { useAnimStore } from './animStore'

/**
 * Shows a brief "Progress synchronized" toast whenever a pending offline
 * session batch is successfully synced (triggered by the offline layer).
 */
export default function SyncToast() {
  const syncPulse = useAnimStore((s) => s.syncPulse)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (syncPulse === 0) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 2600)
    return () => clearTimeout(t)
  }, [syncPulse])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50"
          initial={{ opacity: 0, y: 24, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 180, damping: 16 }}
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-3 bg-navy-800 text-white rounded-2xl px-5 py-3 shadow-2xl border border-teal-400/30">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 12 }}
            >
              <CheckCircle2 size={22} className="text-teal-400" aria-hidden="true" />
            </motion.span>
            <div>
              <p className="font-semibold">Progress synchronized</p>
              <p className="text-xs text-navy-200 flex items-center gap-1">
                <CloudUpload size={12} aria-hidden="true" /> Your sessions are safe
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}