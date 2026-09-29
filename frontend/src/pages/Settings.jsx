import React, { useEffect, useState } from 'react'
import { Volume2, Type, Palette, Globe, MessageCircle, Sun, Moon } from 'lucide-react'
import { useI18n } from '../services/i18n'
import { voiceService } from '../services/voice'
import { getTheme, setTheme } from '../services/theme'

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
  const [theme, setThemeState] = useState(() => getTheme())
  const [highContrast, setHighContrast] = useState(
    () => localStorage.getItem('neuronest_contrast') === 'on'
  )
  const [voice, setVoice] = useState(() => voiceService.isEnabled())
  const [voiceLang, setVoiceLang] = useState(() => voiceService.getVoiceLang())
  // Installed voices are loaded asynchronously by the browser, so re-read them
  // once the `voiceschanged` event has fired.
  const [voices, setVoices] = useState(() => voiceService.listVoices())
  const [pinnedVoice, setPinnedVoice] = useState(() => voiceService.getManualVoice())

  useEffect(() => {
    if (!voiceService.supported()) return
    const refresh = () => setVoices(voiceService.listVoices())
    refresh()
    window.speechSynthesis.addEventListener?.('voiceschanged', refresh)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', refresh)
  }, [])

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

  // Spoken guidance language, chosen independently of the interface language.
  const applyVoiceLang = (value) => {
    setVoiceLang(voiceService.setVoiceLang(value))
    voiceService.speak(
      value === 'hi'
        ? 'अब मैं हिन्दी में बात करूँगी।'
        : 'I will now speak in English.'
    )
  }

  const applyPinnedVoice = (name) => {
    setPinnedVoice(voiceService.setManualVoice(name || null))
    previewVoice()
  }

  const previewVoice = () => {
    voiceService.speak(
      voiceLang === 'hi'
        ? 'नमस्ते, मैं आपकी मदद के लिए यहाँ हूँ। कृपया बताइए कि आप कैसा महसूस कर रहे हैं।'
        : 'Hello. I am here to help you. Please tell me how you are feeling today.'
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-teal-600 font-semibold text-sm uppercase tracking-[0.2em]">
          Personalize
        </p>
        <h1 className="text-3xl font-bold text-navy-800">{tr('settings.title')}</h1>
        <p className="text-navy-500 mt-0.5">
          Make NeuroNest comfortable for you. Changes apply instantly.
        </p>
      </header>

      {/* Voice guidance */}
      <section className="card-hover">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-mind to-teal-50 text-teal-700 flex items-center justify-center">
            <Volume2 size={18} aria-hidden="true" />
          </span>
          {tr('settings.voice')}
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

      {/* Spoken guidance language (independent of the interface language) */}
      <section className="card-hover">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-1">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-mind to-teal-50 text-teal-700 flex items-center justify-center">
            <MessageCircle size={18} aria-hidden="true" />
          </span>
          Spoken language
        </h2>
        <p className="text-sm text-navy-500 mb-4 ml-11">
          The language used for voice guidance. This can be different from the
          screen language.
        </p>
        <div className="flex gap-3">
          {[
            { value: 'en', label: 'English' },
            { value: 'hi', label: 'हिन्दी (Hindi)' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => applyVoiceLang(opt.value)}
              aria-pressed={voiceLang === opt.value}
              className={`flex-1 rounded-xl border-2 py-3 font-semibold transition-colors ${
                voiceLang === opt.value
                  ? 'border-teal-500 bg-mind text-teal-800'
                  : 'border-navy-100 text-navy-600 hover:border-teal-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={previewVoice}
          disabled={!voice}
          className="btn-secondary w-full mt-3"
        >
          <Volume2 size={18} className="inline mr-1.5" aria-hidden="true" />
          Preview voice
        </button>
        {!voice && (
          <p className="text-xs text-navy-400 mt-2 text-center">
            Turn voice guidance on above to preview.
          </p>
        )}

        {/* Installed voice picker */}
        <div className="mt-5 pt-4 border-t border-navy-50">
          <label
            htmlFor="voice-picker"
            className="block text-sm font-semibold text-navy-700 mb-1"
          >
            Voice
          </label>
          <p className="text-xs text-navy-500 mb-2">
            We use a calm Indian female voice when one is installed. Choose
            yourself to override.
          </p>
          <select
            id="voice-picker"
            value={pinnedVoice || ''}
            onChange={(e) => applyPinnedVoice(e.target.value)}
            className="w-full rounded-xl border-2 border-navy-100 bg-white px-3 py-2.5 text-navy-800"
          >
            <option value="">Automatic (best available)</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} — {v.lang}
                {v.recommended ? ' ★ recommended' : ''}
              </option>
            ))}
          </select>

          {!voiceService.supported() ? (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
              This browser does not support speech. Voice guidance is unavailable.
            </p>
          ) : voices.length === 0 ? (
            <p className="text-xs text-navy-400 mt-2">
              Loading installed voices… (this can take a moment)
            </p>
          ) : (
            <>
              {voiceLang === 'hi' && !voices.some((v) => v.lang.toLowerCase().startsWith('hi')) && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                  <strong>No Hindi voice is installed on this device.</strong>{' '}
                  Hindi text will be read by an English voice, which sounds
                  wrong. Install one from Windows → Settings → Time &amp; language
                  → Language → add “Hindi” → Language pack → Speech.
                </p>
              )}
              {!voices.some((v) => v.recommended) && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 mt-3">
                  <strong>No Indian female voice is installed on this device.</strong>{' '}
                  NeuroNest is using the closest available voice, so the accent
                  will not be Indian. Install an Indian English or Hindi voice
                  pack on Windows to get the intended voice.
                </p>
              )}
              <p className="text-xs text-navy-400 mt-2">
                {voices.length} voice{voices.length === 1 ? '' : 's'} installed ·
                delivery tuned to a calm, mid-age pace.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Appearance: light / dark */}
      <section className="card-hover">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-mind to-teal-50 text-teal-700 flex items-center justify-center">
            <Palette size={18} aria-hidden="true" />
          </span>
          Appearance
        </h2>
        <div className="flex gap-3">
          {[
            { value: 'light', label: 'Light', Icon: Sun },
            { value: 'dark', label: 'Dark', Icon: Moon },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setThemeState(setTheme(opt.value))}
              aria-pressed={theme === opt.value}
              className={`flex-1 flex flex-col items-center gap-2 rounded-xl border-2 py-3 font-semibold transition-colors ${
                theme === opt.value
                  ? 'border-teal-500 bg-mind text-teal-800'
                  : 'border-navy-100 text-navy-600 hover:border-teal-300'
              }`}
            >
              <opt.Icon size={20} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      {/* Text size */}
      <section className="card-hover">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-mind to-teal-50 text-teal-700 flex items-center justify-center">
            <Type size={18} aria-hidden="true" />
          </span>
          {tr('settings.fontSize')}
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
      <section className="card-hover">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-mind to-teal-50 text-teal-700 flex items-center justify-center">
            <Palette size={18} aria-hidden="true" />
          </span>
          {tr('settings.highContrast')}
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
      <section className="card-hover">
        <h2 className="flex items-center gap-2 font-semibold text-navy-800 mb-4">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-mind to-teal-50 text-teal-700 flex items-center justify-center">
            <Globe size={18} aria-hidden="true" />
          </span>
          {tr('settings.language')}
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