import React, { useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { voiceService } from '../services/voice'
import { useI18n } from '../services/i18n'

/**
 * Accessible voice guidance toggle button.
 * Visible in the header for quick access.
 */
export default function VoiceToggle({ compact = false }) {
  const { tr } = useI18n()
  const [enabled, setEnabled] = useState(() => voiceService.isEnabled())

  const toggle = () => {
    const next = !enabled
    setEnabled(next)
    voiceService.setEnabled(next)
    if (next && voiceService.supported()) {
      voiceService.speak(tr('settings.voiceOn'))
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={enabled ? tr('settings.voiceOff') : tr('settings.voiceOn')}
      aria-pressed={enabled}
      title={enabled ? tr('settings.voiceOff') : tr('settings.voiceOn')}
      className={`btn-icon transition-colors ${
        enabled
          ? 'bg-teal-50 text-teal-600 hover:bg-teal-100'
          : 'text-navy-400 hover:bg-navy-50'
      }`}
    >
      {enabled ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
    </button>
  )
}