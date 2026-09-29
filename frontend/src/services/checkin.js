/**
 * Pre-game wellbeing check-in.
 *
 * Four short multiple-choice questions asked before a cognitive session, in
 * the tone of a caring family member rather than a clinician. Every question
 * offers four tap-able options - there is no typing anywhere, because the
 * audience is older adults and typing is both slow and error-prone for them.
 *
 * The answers are NOT a medical assessment. They are a lightweight mood and
 * readiness signal used to (a) let the patient be heard, and (b) give the
 * caregiver context alongside the performance numbers. Anything concerning is
 * routed to a human, never to an automatic clinical judgement.
 */

export const WELLBEING_QUESTIONS = [
  {
    id: 'mood',
    emoji: '😊',
    question: 'How are you feeling today?',
    options: [
      { value: 'great', label: 'Very good', emoji: '😄' },
      { value: 'good', label: 'Good', emoji: '🙂' },
      { value: 'okay', label: 'Okay', emoji: '😐' },
      { value: 'low', label: 'Not so good', emoji: '😔' },
    ],
  },
  {
    id: 'sleep',
    emoji: '😴',
    question: 'How did you sleep last night?',
    options: [
      { value: 'well', label: 'Well', emoji: '😴' },
      { value: 'okay', label: 'Just okay', emoji: '😌' },
      { value: 'poorly', label: 'Not well', emoji: '😣' },
      { value: 'none', label: 'Not at all', emoji: '😫' },
    ],
  },
  {
    id: 'energy',
    emoji: '⚡',
    question: 'How is your energy right now?',
    options: [
      { value: 'high', label: 'Full of energy', emoji: '⚡' },
      { value: 'okay', label: 'Okay', emoji: '🙂' },
      { value: 'low', label: 'Tired', emoji: '🥱' },
      { value: 'verylow', label: 'Very tired', emoji: '😴' },
    ],
  },
  {
    id: 'readiness',
    emoji: '🧠',
    question: 'Do you feel ready to play a game?',
    options: [
      { value: 'yes', label: 'Yes, let us go', emoji: '🎯' },
      { value: 'slowly', label: 'A little slowly', emoji: '🐢' },
      { value: 'unsure', label: 'Not sure', emoji: '🤔' },
      { value: 'no', label: 'Maybe later', emoji: '🙏' },
    ],
  },
]

// Weights used to derive a simple 0-100 readiness score. Deliberately coarse:
// this is a prompt for a human conversation, not a validated instrument.
const READINESS_WEIGHTS = {
  mood: { great: 100, good: 78, okay: 55, low: 30 },
  sleep: { well: 100, okay: 72, poorly: 42, none: 25 },
  energy: { high: 100, okay: 70, low: 42, verylow: 25 },
  readiness: { yes: 100, slowly: 70, unsure: 50, no: 30 },
}

/** Thresholds for how concerned the caregiver should be. */
export const CONCERN_LEVELS = { OK: 'ok', WATCH: 'watch', HIGH: 'high' }

export function scoreCheckin(answers) {
  let total = 0
  let answered = 0
  for (const q of WELLBEING_QUESTIONS) {
    const value = answers?.[q.id]
    const w = READINESS_WEIGHTS[q.id]
    if (value != null && w && w[value] != null) {
      total += w[value]
      answered++;
    }
  }
  const score = answered ? Math.round(total / answered) : null
  let level = CONCERN_LEVELS.OK
  if (score != null && score < 45) level = CONCERN_LEVELS.HIGH
  else if (score != null && score < 65) level = CONCERN_LEVELS.WATCH
  return { score, level, answered }
}

/**
 * A short, human, caring message shown to the patient after they answer.
 * Deliberately warm and never clinical or alarming.
 */
export function checkinMessage(answers, name) {
  const { level } = scoreCheckin(answers)
  const who = name ? `, ${name}` : ''
  if (level === CONCERN_LEVELS.HIGH) {
    return `Thank you for telling me${who}. You seem to be having a hard day. We can play something very easy, or we can stop and rest. Whatever you prefer.`
  }
  if (level === CONCERN_LEVELS.WATCH) {
    return `Thank you for answering${who}. We will take it slowly today and start with something gentle.`
  }
  return `Lovely to hear${who}. Let's start gently and see how you feel as we go. You can stop at any time.`
}

/** One-line summary for the caregiver's day view. */
export function caregiverNote(answers) {
  const { score, level } = scoreCheckin(answers)
  if (score == null) return 'No check-in recorded'
  if (level === CONCERN_LEVELS.HIGH) return 'Check-in: reported a hard day'
  if (level === CONCERN_LEVELS.WATCH) return 'Check-in: reported low energy'
  return 'Check-in: feeling well'
}
