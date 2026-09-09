/**
 * Voice guidance service using the browser-native SpeechSynthesis API.
 * Modular and fully controlled by the user (ON/OFF toggle in settings).
 */

let enabled = localStorage.getItem('neuronest_voice') !== 'off'

class VoiceService {
  setEnabled(value) {
    enabled = value
    localStorage.setItem('neuronest_voice', value ? 'on' : 'off')
    if (!value) {
      this.stop()
    }
    return enabled
  }

  isEnabled() {
    return enabled
  }

  supported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  speak(text) {
    if (!enabled) return
    if (!this.supported()) return
    try {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 0.95
      utterance.pitch = 1.0
      utterance.lang = localStorage.getItem('neuronest_lang') === 'hi' ? 'hi-IN' : 'en-IN'
      // Prefer a natural-sounding voice if available
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(
        (v) => v.lang === utterance.lang && /female|natural|neural/i.test(v.name)
      ) || voices.find((v) => v.lang === utterance.lang)
      if (preferred) utterance.voice = preferred
      window.speechSynthesis.speak(utterance)
    } catch (err) {
      // Speech synthesis is best-effort; fail silently rather than crash.
      console.warn('Voice synthesis unavailable:', err)
    }
  }

  stop() {
    if (this.supported()) {
      window.speechSynthesis.cancel()
    }
  }
}

export const voiceService = new VoiceService()