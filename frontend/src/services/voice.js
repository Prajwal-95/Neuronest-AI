/**
 * Voice guidance service using the browser-native SpeechSynthesis API.
 * Modular and fully controlled by the user (ON/OFF toggle in settings).
 */

// localStorage is a BROWSER-ONLY global. Reading it unguarded at module scope
// threw `ReferenceError: localStorage is not defined` the moment this file was
// imported anywhere outside a DOM (the test runner, SSR, a Node script), which
// took the whole module down and made the translation layer untestable. These
// two helpers fall back to defaults when storage is unavailable or blocked
// (private mode / third-party cookie rejection both throw on ACCESS, not just
// on read).
function readStore(key) {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStore(key, value) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, value)
  } catch {
    // Persistence is best-effort; never let a full/blocked store break speech.
  }
}

let enabled = readStore('neuronest_voice') !== 'off'

// Voice language is INDEPENDENT of the interface language. A user may want the
// screen in English but the spoken guidance in Hindi (or the reverse - a
// caregiver reading the screen while the patient listens in their own
// language). Defaults to the interface language on first run.
let voiceLang = readStore('neuronest_voice_lang') || 'en'

// Indian voices (any gender). Kept separate from FEMALE_VOICE_NAMES on purpose:
// if they shared a list, adding a Western female name like "Zira" would also
// make the Indian detector call Zira "Indian".
const INDIAN_VOICE_NAMES = [
  'neerja', 'asha', 'swara', 'shubha', 'lekha', 'nisha', 'pallavi', 'ananya',
  'meera', 'kavya', 'priya', 'divya', 'rhea', 'veena', 'gauri', 'lata',
  'sunita', 'kalpana', 'heera',
]

// Voices known to be female. This MUST include Western female voices too
// (Zira, Aria, Jenny, ...), not just Indian ones: on a machine with no Indian
// voice pack, Zira is the only female voice available, and a list of Indian
// names only would fail to recognise her and leave the app speaking in a male
// voice.
const FEMALE_VOICE_NAMES = [
  ...INDIAN_VOICE_NAMES,
  'zira', 'aria', 'jenny', 'samantha', 'hazel', 'susan', 'catherine', 'linda',
  'sonia', 'female', 'woman',
]

// Male / non-Indian voices we deprioritise when a better alternative exists.
// Only MALE voices belong here - listing a female voice (as an earlier version
// did with Zira and Jenny) works against the goal whenever that voice is the
// only female one installed.
const AVOID_VOICE_NAMES = [
  'david', 'mark', 'james', 'george', 'ravi', 'hemant', 'prabhat', 'matthew',
  'guy', 'alex', 'fred', 'thomas', 'carlos', 'google uk english',
  'google us english',
]

function isIndian(voice) {
  const tag = (voice.lang || '').toLowerCase()
  const name = (voice.name || '').toLowerCase()
  return (
    tag.includes('-in') ||
    name.includes('india') ||
    name.includes('indian') ||
    INDIAN_VOICE_NAMES.some((n) => name.includes(n))
  )
}

function isFemale(voice) {
  const name = (voice.name || '').toLowerCase()
  return FEMALE_VOICE_NAMES.some((n) => name.includes(n))
}

function isAvoided(voice) {
  const name = (voice.name || '').toLowerCase()
  return AVOID_VOICE_NAMES.some((n) => name.includes(n))
}

/**
 * Rank candidate voices for a language. Higher score = better match.
 *
 * Scoring is TIERED, not purely additive, and the gaps between tiers (thousands)
 * are far larger than any within-tier tiebreaker (tens). That is deliberate:
 * an earlier additive version applied a large "avoid" penalty to well-known
 * non-Indian voices. On a machine whose only installed voices are
 * David/Mark/Zira (all en-US), every voice fell to the same score and the
 * first entry - a MALE voice - won. Tiering makes "female beats male" and
 * "Indian beats foreign" unconditional, so no tiebreaker can invert them.
 *
 * Order of preference:
 *   1. Indian female   2. any female   3. any Indian   4. anything matching
 * A voice is never rejected outright: a poor match is better than silence.
 */
function scoreVoice(voice, lang) {
  const tag = (voice.lang || '').toLowerCase()
  // Must actually be speakable in the requested language.
  const base = tag === lang ? 100 : tag.split('-')[0] === lang.split('-')[0] ? 60 : 0
  if (base === 0) return -1

  const female = isFemale(voice)
  const indian = isIndian(voice)
  const tier = female && indian ? 10000 : female ? 5000 : indian ? 2500 : 0

  // Within-tier tiebreakers only. The avoid list can deprioritise a voice
  // among equals (e.g. prefer Neerja over Zira when both are female), but it
  // can never demote a female below a male.
  let bonus = base
  if (!isAvoided(voice)) bonus += 20
  if (!voice.localService) bonus += 5

  return tier + bonus
}

// Chrome/Edge populate `getVoices()` asynchronously: the first call right after
// page load returns an EMPTY array, and voices only appear once the
// `voiceschanged` event fires. Reading it once per `speak()` therefore usually
// missed every voice, so the "prefer a natural/female voice" logic below never
// ran and the browser fell back to whatever default voice it had - which for
// Hindi text could mean reading devanagari with an English voice, or not at all.
// We cache the list and refresh it on `voiceschanged`.
let cachedVoices = []

function loadVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return []
  const voices = window.speechSynthesis.getVoices()
  if (voices && voices.length) cachedVoices = voices
  return cachedVoices
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  loadVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
}

class VoiceService {
  setEnabled(value) {
    enabled = value
    writeStore('neuronest_voice', value ? 'on' : 'off')
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

  /** Voice language for spoken guidance ('en' or 'hi'), independent of the UI. */
  getVoiceLang() {
    return voiceLang
  }

  setVoiceLang(value) {
    voiceLang = value === 'hi' ? 'hi' : 'en'
    writeStore('neuronest_voice_lang', voiceLang)
    return voiceLang
  }

  /**
   * Best available voice for a language code, or null if none is loaded.
   * Prefers an Indian female voice; see scoreVoice() for the ranking.
   */
  voiceFor(lang) {
    const voices = loadVoices()
    if (!voices.length) return null
    let best = null
    let bestScore = -1
    for (const v of voices) {
      const s = scoreVoice(v, lang)
      if (s > bestScore) {
        bestScore = s
        best = v
      }
    }
    return bestScore > 0 ? best : null
  }

  /**
   * All voices the browser/OS currently exposes, annotated so Settings can
   * show the user exactly what is available and whether an Indian female voice
   * is present. Voice lists load asynchronously, so callers should re-read
   * after the `voiceschanged` event.
   */
  listVoices() {
    return loadVoices().map((v) => ({
      name: v.name,
      lang: v.lang,
      localService: v.localService,
      isIndian: isIndian(v),
      isFemale: isFemale(v),
      recommended: isIndian(v) && isFemale(v),
    }))
  }

  /** Name of the voice the user pinned by hand, or null. */
  getManualVoice() {
    return readStore('neuronest_voice_name') || null
  }

  /** Pin a specific installed voice by name (null = automatic best match). */
  setManualVoice(name) {
    if (name) writeStore('neuronest_voice_name', name)
    else {
      try {
        if (typeof localStorage !== 'undefined') localStorage.removeItem('neuronest_voice_name')
      } catch {
        // Best-effort; see writeStore.
      }
    }
    return this.getManualVoice()
  }

  /**
   * The manually pinned voice, but only if it can actually speak the current
   * language. Guards against a stale pick (e.g. the user uninstalled it).
   */
  manualVoiceFor(lang) {
    const pinned = this.getManualVoice()
    if (!pinned) return null
    return loadVoices().find((v) => v.name === pinned) || null
  }

  /** The BCP-47 tag to speak in, derived from the chosen voice language. */
  getSpokenLang() {
    return voiceLang === 'hi' ? 'hi-IN' : 'en-IN'
  }

  /**
   * Speak text, translating it into the chosen VOICE language first.
   *
   * The Web Speech API only chooses *which voice* reads the string - it never
   * translates. Every game passed hard-coded English sentences, so selecting
   * Hindi in Settings gave a Hindi voice reading English words aloud. The text
   * has to be translated here, before it reaches the utterance.
   *
   * Falls back to the original English whenever there is no known translation,
   * so an unrecognised string is still spoken rather than dropped.
   */
  speak(text) {
    if (!enabled) return
    if (!this.supported()) return
    if (!text) return
    try {
      const spoken = toSpokenLanguage(String(text), voiceLang)
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(spoken)
      // Tuned for a MID-AGE Indian woman: calm, sweet and caring.
      // The Web Speech API exposes no age or gender control, so "mid-age" has
      // to be shaped with pitch and rate. pitch 1.03 sits just above neutral so
      // it reads as an adult woman rather than a child (1.2+) or a man (<1.0),
      // and rate 0.88 is unhurried, which is what makes it read as caring
      // rather than clipped. A previous value of pitch 1.15 sounded too young.
      utterance.rate = 0.88
      utterance.pitch = 1.03
      utterance.volume = 1.0
      const spokenLang = this.getSpokenLang()
      utterance.lang = spokenLang
      const preferred = this.manualVoiceFor(spokenLang) || this.voiceFor(spokenLang)
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

/**
 * Spoken-text translation.
 *
 * The Web Speech API picks a VOICE but never translates TEXT. Games speak
 * hard-coded English sentences, so choosing "Hindi" in Settings produced a
 * Hindi voice reading English words aloud. This module translates the English
 * strings into natural Hindi before they are handed to the utterance.
 *
 * Two layers, applied in order:
 *   1. EXACT PHRASES - whole sentences spoken by the games.
 *   2. DYNAMIC PATTERNS - sentences built from numbers ("...score is 82 out of
 *      100"), rendered from a template.
 *
 * Anything unmatched is returned unchanged, so a new string is still spoken in
 * English rather than silently dropped.
 */

// Whole sentences, keyed by the exact English source text.
const EXACT_HI = {
  'Correct.': 'सही।',
  'Correct!': 'सही!',
  'Correct. Keep going.': 'सही। आगे बढ़ते रहिए।',
  'Excellent match.': 'बहुत बढ़िया जोड़ी।',
  'Now find the matching pairs.': 'अब मिलती जोड़ियाँ ढूँढिए।',
  'That was not the right symbol. Let us try again.': 'यह सही चिह्न नहीं था। फिर से कोशिश करते हैं।',
  'Now reproduce the sequence in the same order.': 'अब उसी क्रम में क्रम दोहराइए।',
  'Find the matching pairs of cards.': 'कार्डों की मिलती जोड़ियाँ ढूँढिए।',
  'Quick Math. Solve simple addition and subtraction problems.':
    'त्वरित गणित। सरल जोड़ और घटाव के प्रश्न हल कीजिए।',
  'You will see a set of words. Remember them, then tap the ones you saw.':
    'आप कुछ शब्द देखेंगे। उन्हें याद रखिए, फिर जो देखा हो उन्हें दबाइए।',
  'Watch the sequence, then reproduce it in the same order.':
    'क्रम को ध्यापूर्वक देखिए, फिर उसी क्रम में दोहराइए।',
  'Voice guidance is now on.': 'ध्वनि मार्गदर्शन अब चालू है।',
  'I will now speak in English.': 'मैं अब अंग्रेज़ी में बात करूँगी।',
  'अब मैं हिन्दी में बात करूँगी।': 'अब मैं हिन्दी में बात करूँगी।',
}

// Shape names used by the Attention instruction ("Tap every filled circle").
const SHAPE_HI = {
  'filled circle': 'भरा हुआ वृत्त',
  triangle: 'त्रिभुज',
  square: 'वर्ग',
  star: 'तारा',
  diamond: 'हीरा',
  heart: 'हृदय',
  'plus sign': 'धन चिह्न',
  umbrella: 'छाता',
}

// Game titles as they appear in "Starting <Game>. Level N."
const GAME_NAME_HI = {
  'Attention Focus': 'ध्यान केंद्रित',
  'Memory Match': 'स्मृति मिलान',
  'Quick Math': 'त्वरित गणित',
  'Sequence Recall': 'क्रम याद',
  'Word Recall': 'शब्द याद',
}

// Hindi numerals for 0-99. Anything >= 100 is left as digits, because the only
// larger figure the games ever say is "100" (always spoken as the literal
// "में से 100"), so a full 0-999 converter would be dead weight.
// A stub that stopped at 10 silently left "82" and "12" as bare digits inside
// an otherwise-Hindi sentence, which is exactly the mixed-language problem this
// whole translation layer exists to prevent.
const ONES_HI = [
  'शून्य', 'एक', 'दो', 'तीन', 'चार', 'पांच', 'छह', 'सात', 'आठ', 'नौ',
]
const TEENS_HI = [
  'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस',
]
const TENS_HI = [
  null, null, 'बीस', 'तीस', 'चालीस', 'पचास', 'साठ', 'सत्तर', 'अस्सी', 'नब्बे',
]

function hindiNumber(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return String(n)
  if (Number.isInteger(v) && v >= 0 && v <= 9) return ONES_HI[v]
  if (Number.isInteger(v) && v >= 10 && v <= 19) return TEENS_HI[v - 10]
  if (Number.isInteger(v) && v >= 20 && v <= 99) {
    const tens = TENS_HI[Math.floor(v / 10)]
    const ones = v % 10
    // "82" -> "अस्सी दो"; round tens need no trailing unit.
    return ones === 0 ? tens : `${tens} ${ONES_HI[ones]}`
  }
  return String(n)
}

// Sentences assembled from numbers. Each entry is [RegExp, template] where
// `$1`, `$2`... are already-localised fragments.
const PATTERNS_HI = [
  [
    /^Starting (.+?)\. Level (\d+)\.$/,
    (_m, game, lvl) => `${GAME_NAME_HI[game] || game} शुरू हो रहा है। स्तर ${hindiNumber(lvl)}।`,
  ],
  [
    /^Great focus! You found (\d+) out of (\d+) targets\. Your score is (\d+) out of 100\.$/,
    (_m, found, total, score) =>
      `बहुत बढ़िया! आपने ${hindiNumber(found)} में से ${hindiNumber(total)} निशाने ढूँढे। आपका स्कोर ${hindiNumber(score)} में से 100 है।`,
  ],
  [
    /^Excellent work! You matched (\d+) out of (\d+) pairs\. Your score is (\d+) out of 100\.$/,
    (_m, m, t, score) =>
      `शानदार काम! आपने ${hindiNumber(t)} में से ${hindiNumber(m)} जोड़ियाँ मिलाईं। आपका स्कोर ${hindiNumber(score)} में से 100 है।`,
  ],
  [
    /^Excellent work! You completed the sequence\. Your score is (\d+) out of 100\.$/,
    (_m, score) =>
      `शानदार! आपने पूरा क्रम याद रखा। आपका स्कोर ${hindiNumber(score)} में से 100 है।`,
  ],
  [
    /^Let's play Memory Match\. Find the matching pairs of cards\. Level (\d+)\.$/,
    (_m, lvl) =>
      `चलिए मेमोरी मैच खेलते हैं। कार्डों की मिलती जोड़ियाँ ढूँढिए। स्तर ${hindiNumber(lvl)}।`,
  ],
  [
    /^Tap every (.+?) on the screen\. You have (\d+) seconds\.$/,
    (_m, shape, secs) =>
      `स्क्रीन पर मिलने वाले हर ${SHAPE_HI[shape] || shape} को दबाइए। आपके पास ${hindiNumber(secs)} सेकंड हैं।`,
  ],
  [
    /^That was not (.+?)\. Keep looking\.$/,
    (_m, shape) => `यह ${SHAPE_HI[shape] || shape} नहीं था। ढूँढते रहिए।`,
  ],
  [
    /^Watch the sequence carefully\. It has (\d+) symbols\. Remember them in order\.$/,
    (_m, n) =>
      `क्रम को ध्यान से देखिए। इसमें ${hindiNumber(n)} चिह्न हैं। उन्हें क्रम में याद रखिए।`,
  ],
  [
    /^Word Recall\. Remember these (\d+) words carefully\.$/,
    (_m, n) => `शब्द याद करना। इन ${hindiNumber(n)} शब्दों को ध्यान से याद कीजिए।`,
  ],
  [
    /^Quick Math\. Solve (\d+) simple problems\.$/,
    (_m, n) => `त्वरित गणित। ${hindiNumber(n)} सरल प्रश्न हल कीजिए।`,
  ],
  [
    /^Not quite\. The answer is (\d+)\.$/,
    (_m, a) => `ठीक नहीं। उत्तर है ${hindiNumber(a)}।`,
  ],
  [
    /^Well done! You remembered (\d+) words\.$/,
    (_m, n) => `बहुत अच्छा! आपने ${hindiNumber(n)} शब्द याद रखे।`,
  ],
  [
    /^Well done! Score (\d+) out of 100\.$/,
    (_m, s) => `शानदार! स्कोर ${hindiNumber(s)} में से 100।`,
  ],
  // Math operands. QuickMath builds questions as "What is 7 plus 3?", which the
  // Web Speech API reads poorly as bare digits, so the word form is translated.
  [
    /^What is (\d+) plus (\d+)\?$/,
    (_m, a, b) => `${hindiNumber(a)} जोड़िए ${hindiNumber(b)} कितना होता है?`,
  ],
  [
    /^What is (\d+) minus (\d+)\?$/,
    (_m, a, b) => `${hindiNumber(a)} में से ${hindiNumber(b)} निकालिए कितना होता है?`,
  ],
  [
    /^What is (\d+) times (\d+)\?$/,
    (_m, a, b) => `${hindiNumber(a)} का ${hindiNumber(b)} गुना कितना होता है?`,
  ],
  [
    /^What is (\d+) divided by (\d+)\?$/,
    (_m, a, b) => `${hindiNumber(a)} को ${hindiNumber(b)} से भाग दीजिए कितना होता है?`,
  ],
  [
    /^Which words did you see\? Tap each one you remember\.$/,
    () => 'आपने कौन से शब्द देखे? आपको याद आने वाले शब्दों को दबाइए।',
  ],
  [
    /^No, (.+?) was not in the list\.$/,
    (_m, w) => `नहीं, ${w} सूची में नहीं था।`,
  ],
]

// Word Recall reads the target words aloud as a bare comma-separated list
// ("apple, house, table"). Map the pool to Hindi so the recalled words match
// what was actually shown, otherwise the spoken word can never be recognised.
const WORDS_HI = {
  apple: 'सेब', house: 'घर', table: 'मेज़', river: 'नदी', garden: 'बगीचा',
  window: 'खिड़की', pencil: 'पेंसिल', bridge: 'पुल', chair: 'कुर्सी', flower: 'फूल',
  morning: 'सुबह', candle: 'मोमबत्ती', kettle: 'केतली', basket: 'टोकरी',
  blanket: 'कंबल', bottle: 'बोतल', carpet: 'कालीन', lantern: 'लालटेन',
  village: 'गाँव', guitar: 'गिटार',
  gentle: 'कोमल', wisdom: 'बुद्धि', memory: 'स्मृति', family: 'परिवार',
  simple: 'सरल', kindness: 'दयालुता', comfort: 'सुकून', harmony: 'सामंदस्य',
  journey: 'यात्रा', spirit: 'आत्मा',
  sunrise: 'सूर्योदय', pebble: 'कंकड़', breeze: 'हवा', harbor: 'बंदरगाह',
  meadow: 'घास का मैदान', feather: 'पंख', shelter: 'आश्रय', kindred: 'अपनेपन',
  mellow: 'कोमलता', promise: 'वादा', treasure: 'खजाना', whisper: 'फुसफुसाहट',
  graceful: 'सुंदरता', blossom: 'फूल', silence: 'सन्नाटा', courage: 'साहस',
  wonder: 'विस्मय',
}

/**
 * Translate an English game string into Hindi.
 * Returns the input untouched when nothing matches or `lang` is not Hindi.
 */
export function toSpokenLanguage(text, lang) {
  if (lang !== 'hi') return text
  if (!text) return text
  // Already Devanagari: nothing to do, and re-running the table would be wrong.
  if (/[\u0900-\u097F]/.test(text)) return text

  const exact = EXACT_HI[text]
  if (exact) return exact

  for (const [re, render] of PATTERNS_HI) {
    const m = text.match(re)
    if (m) return render(...m)
  }

  // A bare word or comma-separated word list (Word Recall): translate each
  // token so the spoken word matches the word that was shown on screen.
  if (/^[A-Za-z]+(,\s*[A-Za-z]+)*$/.test(text)) {
    return text
      .split(',')
      .map((w) => {
        const key = w.trim().toLowerCase()
        return WORDS_HI[key] || w.trim()
      })
      .join(', ')
  }

  return text
}

export const voiceService = new VoiceService()