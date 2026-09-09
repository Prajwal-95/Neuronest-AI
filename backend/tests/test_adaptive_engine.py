"""
Unit tests for the NeuroNest AI adaptive difficulty engine.

These tests exercise the deterministic, explainable adaptive algorithm that
backs the "Personalized Cognitive Training" claim in the SIH presentation.

Run the suite (no external test framework required):

    cd backend
    python -m unittest discover -s tests -v

Or with pytest (if installed via requirements-dev.txt):

    cd backend
    pytest tests -v
"""

import unittest

from app.ml.adaptive_engine import (
    MIN_DIFFICULTY,
    MAX_DIFFICULTY,
    adaptive_engine,
    compute_performance_score,
    game_label,
    normalize_accuracy,
    response_performance,
)


class TestNormalizeAccuracy(unittest.TestCase):
    def test_clamps_low_values(self):
        self.assertEqual(normalize_accuracy(-1.0), 0.0)
        self.assertEqual(normalize_accuracy(-0.3), 0.0)

    def test_clamps_high_values(self):
        self.assertEqual(normalize_accuracy(1.5), 1.0)
        self.assertEqual(normalize_accuracy(2.0), 1.0)

    def test_passes_inrange_values(self):
        self.assertEqual(normalize_accuracy(0.0), 0.0)
        self.assertEqual(normalize_accuracy(0.85), 0.85)
        self.assertEqual(normalize_accuracy(1.0), 1.0)


class TestResponsePerformance(unittest.TestCase):
    """Response-time thresholds scale with difficulty; harder = longer is OK."""

    def test_fast_response_is_strong(self):
        # Difficulty 1 has a 4s base; 2.0s is within 60% of it.
        self.assertEqual(response_performance(2.0, 1), "strong")

    def test_moderate_response(self):
        self.assertEqual(response_performance(3.0, 1), "moderate")
        self.assertEqual(response_performance(6.0, 3), "moderate")

    def test_weak_response_when_slow(self):
        self.assertEqual(response_performance(9.0, 1), "weak")
        self.assertEqual(response_performance(20.0, 5), "weak")

    def test_higher_difficulty_allows_slower_response(self):
        # 7.0s is 'weak' at level 2 (base 5s) but 'moderate' at level 5 (base 8s).
        self.assertEqual(response_performance(7.0, 2), "weak")
        self.assertEqual(response_performance(7.0, 5), "moderate")


class TestAdaptiveEngine(unittest.TestCase):
    """Core hysteresis logic: requires 2 consecutive strong sessions to advance."""

    def test_first_strong_session_keeps_level(self):
        # One great session alone must NOT rush the patient up a level.
        result = adaptive_engine(
            {
                "accuracy": 0.95,
                "response_time": 2.0,
                "mistakes": 0,
                "current_difficulty": 2,
                "recent_scores": [],
            }
        )
        self.assertEqual(result["recommended_difficulty"], 2)

    def test_consecutive_strong_sessions_advance(self):
        result = adaptive_engine(
            {
                "accuracy": 0.95,
                "response_time": 2.0,
                "mistakes": 0,
                "current_difficulty": 2,
                "recent_scores": [90, 92, 95],
            }
        )
        self.assertEqual(result["recommended_difficulty"], 3)
        self.assertIn("above", result["reason"])
        self.assertGreaterEqual(result["confidence"], 0.5)

    def test_never_advances_beyond_max(self):
        result = adaptive_engine(
            {
                "accuracy": 1.0,
                "response_time": 1.0,
                "mistakes": 0,
                "current_difficulty": MAX_DIFFICULTY,
                "recent_scores": [95, 96, 97, 98],
            }
        )
        self.assertEqual(result["recommended_difficulty"], MAX_DIFFICULTY)

    def test_weak_session_regresses(self):
        result = adaptive_engine(
            {
                "accuracy": 0.4,
                "response_time": 10.0,
                "mistakes": 9,
                "current_difficulty": 4,
                "recent_scores": [40, 45],
            }
        )
        self.assertEqual(result["recommended_difficulty"], 3)

    def test_never_regresses_below_min(self):
        result = adaptive_engine(
            {
                "accuracy": 0.2,
                "response_time": 30.0,
                "mistakes": 12,
                "current_difficulty": MIN_DIFFICULTY,
                "recent_scores": [],
            }
        )
        self.assertEqual(result["recommended_difficulty"], MIN_DIFFICULTY)

    def test_steady_performance_stays(self):
        result = adaptive_engine(
            {
                "accuracy": 0.7,
                "response_time": 5.0,
                "mistakes": 1,
                "current_difficulty": 3,
                "recent_scores": [70, 72],
            }
        )
        self.assertEqual(result["recommended_difficulty"], 3)
        self.assertIn("steady", result["reason"].lower())
        self.assertEqual(result["confidence"], 0.6)

    def test_many_mistakes_force_regression_even_with_fast_time(self):
        result = adaptive_engine(
            {
                "accuracy": 0.75,
                "response_time": 1.0,
                "mistakes": 8,
                "current_difficulty": 2,
                "recent_scores": [],
            }
        )
        self.assertEqual(result["recommended_difficulty"], 1)

    def test_bounds_are_respected_with_absurd_input(self):
        result = adaptive_engine(
            {
                "accuracy": 99.0,
                "response_time": -5.0,
                "mistakes": -3,
                "current_difficulty": 99,
                "recent_scores": [100] * 10,
            }
        )
        self.assertIn(result["recommended_difficulty"], (MIN_DIFFICULTY, MAX_DIFFICULTY))


class TestComputePerformanceScore(unittest.TestCase):
    def test_perfect_session_scores_high(self):
        score = compute_performance_score(
            {
                "accuracy": 1.0,
                "response_time": 2.0,
                "mistakes": 0,
                "attempts": 5,
                "completed": True,
                "difficulty": 1,
                "recent_scores": [90, 92, 91],
            }
        )
        self.assertGreaterEqual(score, 90.0)
        self.assertLessEqual(score, 100.0)

    def test_poor_session_scores_low(self):
        score = compute_performance_score(
            {
                "accuracy": 0.1,
                "response_time": 30.0,
                "mistakes": 12,
                "attempts": 20,
                "completed": False,
                "difficulty": 1,
                "recent_scores": [10, 12, 11],
            }
        )
        self.assertLessEqual(score, 40.0)

    def test_returns_rounded_float(self):
        score = compute_performance_score(
            {
                "accuracy": 0.8,
                "response_time": 4.0,
                "mistakes": 1,
                "attempts": 6,
                "completed": True,
                "difficulty": 2,
                "recent_scores": [80, 82, 81],
            }
        )
        self.assertIsInstance(score, float)
        self.assertEqual(score, round(score, 1))


class TestGameLabel(unittest.TestCase):
    def test_known_games(self):
        self.assertEqual(game_label({"game_type": "memory_match"}), "memory")
        self.assertEqual(game_label({"game_type": "quick_math"}), "math")
        self.assertEqual(game_label({"game_type": "attention"}), "attention")

    def test_unknown_default(self):
        self.assertEqual(game_label({}), "cognitive")


if __name__ == "__main__":
    unittest.main()