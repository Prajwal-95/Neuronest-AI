"""
Adaptive Difficulty Engine for NeuroNest AI.

This module implements a deterministic, explainable adaptive algorithm that
adjusts cognitive game difficulty based on actual patient performance data.

The algorithm is designed to be:
  - Deterministic: same inputs produce same outputs
  - Explainable: every recommendation has a human-readable reason
  - Stable: hysteresis prevents difficulty oscillation

It uses non-clinical performance metrics (accuracy, response efficiency,
mistake rate) purely as engagement engineering signals, NOT as medical
measurements.
"""

from typing import List, Dict, Any

# Difficulty bounds
MIN_DIFFICULTY = 1
MAX_DIFFICULTY = 10

# Expected response time (seconds) per level. Higher levels accept slightly
# longer responses because the content is genuinely harder. Grown to cover all
# ten levels; `.get(..., 6.0)` keeps unknown levels on a sane default.
EXPECTED_RESPONSE = {
    1: 4.0, 2: 5.0, 3: 6.0, 4: 7.0, 5: 8.0,
    6: 9.0, 7: 10.0, 8: 11.0, 9: 12.0, 10: 13.0,
}

# Performance thresholds (engineering metrics for the prototype)
ACCURACY_ADVANCE_THRESHOLD = 0.85
ACCURACY_REGRESS_THRESHOLD = 0.60
MAX_MISTAKES_ADVANCE = 2
MAX_MISTAKES_REGRESS = 8

# Hysteresis: number of consecutive strong sessions required to advance
CONSECUTIVE_STRONG_REQUIRED = 2


def normalize_accuracy(accuracy: float) -> float:
    """Clamp accuracy to [0, 1]."""
    return max(0.0, min(1.0, accuracy))


def response_performance(response_time: float, difficulty: int) -> str:
    """
    Classify response-time performance as 'strong', 'moderate', or 'weak'.

    Thresholds scale with difficulty so that higher difficulties accept
    slightly longer response times (harder content takes longer).
    """
    base = EXPECTED_RESPONSE.get(difficulty, 6.0)
    if response_time > 0 and response_time <= base * 0.6:
        return "strong"
    if response_time <= base:
        return "moderate"
    return "weak"



def adaptive_engine(input_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Compute recommended difficulty from a single session's performance.

    Args:
        input_data: dict with keys:
            accuracy (float 0..1)
            response_time (float seconds)
            mistakes (int)
            current_difficulty (int 1..10)
            recent_scores (list[float]) - recent performance scores

    Returns:
        dict with recommended_difficulty, reason, confidence.
    """
    accuracy = normalize_accuracy(float(input_data.get("accuracy", 0)))
    response_time = float(input_data.get("response_time", 10.0))
    mistakes = int(input_data.get("mistakes", 0))
    current = int(input_data.get("current_difficulty", 1))
    recent_scores = list(input_data.get("recent_scores", []))

    current = max(MIN_DIFFICULTY, min(MAX_DIFFICULTY, current))
    resp_perf = response_performance(response_time, current)

    # ----- Hysteresis check for advancement -----
    strong_session = (
        accuracy >= ACCURACY_ADVANCE_THRESHOLD
        and resp_perf in ("strong", "moderate")
        and mistakes <= MAX_MISTAKES_ADVANCE
    )

    consecutive_strong = 1 if strong_session else 0
    for score in reversed(recent_scores[-5:]):
        if score >= ACCURACY_ADVANCE_THRESHOLD * 100:
            consecutive_strong += 1
        else:
            break

    weak_session = (
        accuracy < ACCURACY_REGRESS_THRESHOLD
        or mistakes >= MAX_MISTAKES_REGRESS
        or (mistakes >= 6 and resp_perf == "weak")
    )

    recommended = current
    reason = ""
    confidence = 0.5

    if strong_session and consecutive_strong >= CONSECUTIVE_STRONG_REQUIRED and current < MAX_DIFFICULTY:
        recommended = current + 1
        reason = (
            f"Your recent {game_label(input_data)} accuracy has remained above "
            f"{ACCURACY_ADVANCE_THRESHOLD * 100:.0f}% with fast response and few "
            f"mistakes. This indicates readiness for a slightly higher challenge."
        )
        if resp_perf == "strong":
            reason += " Your response speed was excellent."
        confidence = min(0.5 + 0.05 * consecutive_strong + 0.1 * (accuracy - 0.85), 0.95)
    elif weak_session:
        recommended = max(current - 1, MIN_DIFFICULTY)
        reason = (
            f"Performance on the current level showed lower accuracy or a higher "
            f"number of mistakes. A slightly easier level is recommended to keep "
            f"the activity engaging and comfortable."
        )
        confidence = min(0.6 + abs(0.60 - accuracy) * 0.5, 0.95)
    else:
        recommended = current
        reason = (
            f"Performance at the current level is steady. Keeping the current level "
            f"maintains a good balance of challenge and confidence."
        )
        confidence = 0.6

    return {
        "recommended_difficulty": recommended,
        "reason": reason,
        "confidence": round(confidence, 2),
    }


def game_label(input_data: Dict[str, Any]) -> str:
    game = input_data.get("game_type", "")
    labels = {
        "memory_match": "memory",
        "sequence_recall": "sequence",
        "attention": "attention",
        "quick_math": "math",
        "word_recall": "word",
    }
    return labels.get(game, "cognitive")


def compute_performance_score(metrics: Dict[str, Any]) -> float:
    """
    Compute a composite performance score (0-100) from a single session.
    Weights are engineering metrics for the prototype, not validated clinically.
    """
    accuracy = normalize_accuracy(float(metrics.get("accuracy", 0)))
    response_time = float(metrics.get("response_time", 10.0))
    mistakes = int(metrics.get("mistakes", 0))
    attempts = int(metrics.get("attempts", 1))
    completed = bool(metrics.get("completed", True))
    difficulty = int(metrics.get("difficulty", 1))
    recent_scores = list(metrics.get("recent_scores", []))

    # Response efficiency: faster relative to expected time is better.
    expected = EXPECTED_RESPONSE.get(difficulty, 6.0)
    resp_efficiency = max(0.0, min(1.0, expected / response_time if response_time > 0 else 0.5))
    if response_time == 0:
        resp_efficiency = 0.5

    # Consistency: inverse variance of recent scores if available.
    consistency = 0.5
    if len(recent_scores) >= 2:
        import numpy as np
        std = np.std(recent_scores)
        mean = np.mean(recent_scores)
        cv = std / mean if mean > 0 else 1.0
        consistency = max(0.0, min(1.0, 1.0 - cv))

    # Completion
    completion = 1.0 if completed else 0.0

    # Improvement: trend of recent scores.
    improvement = 0.0
    if len(recent_scores) >= 2:
        if recent_scores[-1] > recent_scores[0]:
            improvement = 0.5
        improvement = min(1.0, improvement + (recent_scores[-1] - recent_scores[0]) / 50.0)

    score = (
        accuracy * 0.45
        + resp_efficiency * 0.20
        + consistency * 0.15
        + completion * 0.10
        + improvement * 0.10
    )
    return round(max(0.0, min(100.0, score * 100)), 1)
