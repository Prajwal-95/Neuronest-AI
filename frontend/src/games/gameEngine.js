/**
 * Shared game-session architecture.
 *
 * Every game produces a standardized session record:
 * {
 *   game_type, difficulty, score, accuracy, response_time, mistakes,
 *   attempts, completed, timestamp, offline
 * }
 *
 * The performance score is computed from real gameplay metrics using the
 * same weighted formula used on the backend (accuracy, response efficiency,
 * consistency, completion, improvement).
 */

export const GAME_TYPES = {
  memory_match: 'memory_match',
  sequence_recall: 'sequence_recall',
  attention: 'attention',
  quick_math: 'quick_math',
  word_recall: 'word_recall',
}

// Difficulty bounds. Ten levels per game. The backend engine uses the same
// numbers (app/ml/adaptive_engine.py) - the two MUST stay in sync or a session
// raises a level locally and lowers it again once synced.
export const MIN_LEVEL = 1
export const MAX_LEVEL = 10

// Expected response time base (seconds) per difficulty — used for
// response-efficiency scoring.
const EXPECTED_RESPONSE = {
  1: 4.0, 2: 5.0, 3: 6.0, 4: 7.0, 5: 8.0,
  6: 9.0, 7: 10.0, 8: 11.0, 9: 12.0, 10: 13.0,
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

/**
 * Compute a 0-100 performance score from raw gameplay metrics.
 * Same formula as backend: Accuracy*0.45 + ResponseEfficiency*0.20 +
 * Consistency*0.15 + Completion*0.10 + Improvement*0.10.
 */
export function computeScore({
  accuracy,       // 0..1
  avgResponseTime, // seconds
  mistakes,
  attempts,
  completed,
  difficulty,
  recentScores = [],
}) {
  const acc = clamp01(accuracy)

  const expected = EXPECTED_RESPONSE[difficulty] || 6.0
  let respEff = expected / Math.max(avgResponseTime, 0.1)
  respEff = clamp01(respEff)

  // Consistency: inverse coefficient-of-variation of recent scores
  let consistency = 0.5
  if (recentScores.length >= 2) {
    const mean = recentScores.reduce((a, b) => a + b, 0) / recentScores.length
    const variance =
      recentScores.reduce((a, s) => a + (s - mean) * (s - mean), 0) /
      recentScores.length
    const std = Math.sqrt(variance)
    const cv = mean > 0 ? std / mean : 1
    consistency = clamp01(1 - cv)
  }

  const completion = completed ? 1 : 0

  let improvement = 0
  if (recentScores.length >= 2) {
    const first = recentScores[0]
    const last = recentScores[recentScores.length - 1]
    if (last > first) improvement = 0.5
    improvement = clamp01(improvement + (last - first) / 50)
  }

  const raw =
    acc * 0.45 +
    respEff * 0.2 +
    consistency * 0.15 +
    completion * 0.1 +
    improvement * 0.1

  return Math.round(clamp01(raw) * 100)
}

/**
 * Build the standardized session record from metrics +
 * performance calculation.
 */
export function buildSession({
  gameType,
  difficulty,
  accuracy,
  responseTime,
  mistakes,
  attempts,
  completed = true,
  offline = false,
  recentScores = [],
  clientId = null,
  timestamp = new Date().toISOString(),
}) {
  const score = computeScore({
    accuracy,
    avgResponseTime: responseTime,
    mistakes,
    attempts,
    completed,
    difficulty,
    recentScores,
  })
  return {
    game_type: gameType,
    difficulty,
    score,
    accuracy: Math.round(accuracy * 100) / 100,
    response_time: Math.round(responseTime * 100) / 100,
    mistakes,
    attempts,
    completed,
    timestamp,
    offline,
    client_id: clientId,
  }
}

/**
 * Adaptive difficulty suggestion using the same deterministic rules as the
 * backend engine (kept client-side for instant offline recommendations).
 *
 * The thresholds and the hysteresis window below MUST stay in sync with
 * `app/ml/adaptive_engine.py`. They previously drifted in two ways that made
 * the same session raise a level when synced and not when played offline:
 *   - the consecutive-strong walk was unbounded here but capped at 5 on the
 *     server, so a long high-scoring history could differ at the boundary;
 *   - the server also regresses on "many mistakes AND slow responses", which
 *     this client ignored entirely.
 */
export function suggestDifficulty({
  accuracy,
  responseTime,
  mistakes,
  currentDifficulty,
  recentScores = [],
}) {
  const acc = clamp01(accuracy)
  const expected = EXPECTED_RESPONSE[currentDifficulty] || 6.0

  // Mirrors the server's response_performance(): <= 60% of expected is
  // "strong", <= expected is "moderate", anything slower is "weak".
  const respPerf =
    responseTime > 0 && responseTime <= expected * 0.6
      ? 'strong'
      : responseTime <= expected
        ? 'moderate'
        : 'weak'

  const strong = acc >= 0.85 && (respPerf === 'strong' || respPerf === 'moderate') && mistakes <= 2
  const weak = acc < 0.6 || mistakes >= 8 || (mistakes >= 6 && respPerf === 'weak')

  let consecutiveStrong = strong ? 1 : 0
  // Walk backwards over the same 5-session window the server inspects.
  const window = recentScores.slice(-5)
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i] >= 85) consecutiveStrong++
    else break
  }

  if (strong && consecutiveStrong >= 2 && currentDifficulty < MAX_LEVEL) {
    return {
      recommended: currentDifficulty + 1,
      reason: `Your recent accuracy has remained above 85% with few mistakes. Ready for a slightly higher challenge.`,
    }
  }
  if (weak && currentDifficulty > 1) {
    return {
      recommended: currentDifficulty - 1,
      reason: `The last activity showed some difficulty. A slightly easier level is recommended.`,
    }
  }
  return {
    recommended: currentDifficulty,
    reason: `Your performance at this level is steady. Keeping the current level maintains a good balance.`,
  }
}

/**
 * Client-side mirror of the backend's compute_performance_score().
 * Kept exported so tests can assert both implementations agree.
 */
export { computeScore as computePerformanceScore }