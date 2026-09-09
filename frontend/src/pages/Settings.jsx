import React, { useState } from 'react'
import { Volume2, Type, Palette, Globe } from 'lucide-react'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'

const FONT_SIZES = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' },
]

export default function Settings() {
  const { lang, setLang, tr } = useI18n()
  const [fontSize, setFontSize] = useState(
    () => localStorage.getItem('neuronest_font') || 'medium'
  )
  const [highContrast, setHighContrast] = useState(
    () => localStorage.getItem('neuronest_contrast') === 'on'
  )
  const [voice, setVoice] = useState(() => voiceService.isEnabled())

  const applyFont = (value) => {
    setFontSize(value)
    localStorage.setItem('neuronest_font', value)
    document.body.classList.remove('font-small', 'font-medium', 'font-large', 'font-xlarge')
    document.body.classList.add(`font-${value}`)
  }

  const applyContrast = (value) => {
    setHighContrast(value)
    localStorage.setItem('neuronest_contrast', value ? 'on' : 'off')
    document.body.classList.toggle('high-contrast', value)
  }

  const applyVoice = (value) => {
    setVoice(value)
    voiceService.setEnabled(value)
    if (value) voiceService.speak('Voice guidance is now on.')
  }

  const applyLang = (value) => {
    setLang(value)
    localStorage.setItem('neuronest_lang', value)
    if (value === 'hi') voiceService.speak('भाषा हिंदी में बदल दी गई है')
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold text-navy-800">{tr('settings.title')}</h1>
        <p className="text-navy-600 mt-1">
          Make NeuroNest comfortable for you. Changes apply instantly.
        </p>
      </header>

      {/* Voice guidance */}
      <section className="card">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <Volume2 size={20} className="text-teal-600" aria-hidden="true" /> {tr('settings.voice')}
        </h2>
        <div className="flex gap-3">
          {[
            { value: true, label: tr('settings.voiceOn') },
            { value: false, label: tr('settings.voiceOff') },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => applyVoice(opt.value)}
              aria-pressed={voice === opt.value}
              className={`flex-1 rounded-xl border-2 py-3 font-semibold transition-colors ${
                voice === opt.value
                  ? 'border-teal-500 bg-mind text-teal-800'
                  : 'border-navy-100 text-navy-600 hover:border-teal-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Text size */}
      <section className="card">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <Type size={20} className="text-teal-600" aria-hidden="true" /> {tr('settings.fontSize')}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {FONT_SIZES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => applyFont(opt.value)}
              aria-pressed={fontSize === opt.value}
              className={`rounded-xl border-2 py-3 font-semibold transition-colors ${
                fontSize === opt.value
                  ? 'border-teal-500 bg-mind text-teal-800'
                  : 'border-navy-100 text-navy-600 hover:border-teal-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* High contrast */}
      <section className="card">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <Palette size={20} className="text-teal-600" aria-hidden="true" /> {tr('settings.highContrast')}
        </h2>
        <div className="flex gap-3">
          {[
            { value: true, label: 'On' },
            { value: false, label: 'Off' },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => applyContrast(opt.value)}
              aria-pressed={highContrast === opt.value}
              className={`flex-1 rounded-xl border-2 py-3 font-semibold transition-colors ${
                highContrast === opt.value
                  ? 'border-teal-500 bg-mind text-teal-800'
                  : 'border-navy-100 text-navy-600 hover:border-teal-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Language */}
      <section className="card">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <Globe size={20} className="text-teal-600" aria-hidden="true" /> {tr('settings.language')}
        </h2>
        <div className="flex gap-3">
          {[
            { value: 'en', label: 'English' },
            { value: 'hi', label: 'हिन्दी (Hindi)' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => applyLang(opt.value)}
              aria-pressed={lang === opt.value}
              className={`flex-1 rounded-xl border-2 py-3 font-semibold transition-colors ${
                lang === opt.value
                  ? 'border-teal-500 bg-mind text-teal-800'
                  : 'border-navy-100 text-navy-600 hover:border-teal-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <p className="text-xs text-navy-400 text-center">{tr('disclaimer')}</p>
    </div>
  )
}