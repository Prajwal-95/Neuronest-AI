"""
Recommendation layer for NeuroNest AI.

Uses historical session features to recommend the next game, difficulty,
and the cognitive domain to prioritize.

IMPORTANT: The model is trained on clearly labeled SYNTHETIC/DEMO training
data for the prototype. It is NOT clinically validated. Recommendations are
always paired with human-readable reasons (explainable AI).
"""

from typing import Dict, Any, List
import numpy as np
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.preprocessing import LabelEncoder


# Cognitive domains per game type
GAME_DOMAIN = {
    "memory_match": "Memory",
    "sequence_recall": "Recognition",
    "attention": "Attention",
}


class RecommendationModel:
    def __init__(self):
        self.model = None
        self._game_encoder = LabelEncoder()
        self._game_encoder.fit(["memory_match", "sequence_recall", "attention"])
        self._synthetic = True

    def _features(self, patient_features: Dict[str, Any]) -> np.ndarray:
        """Build feature vector from patient aggregate features."""
        return np.array([
            patient_features.get("avg_accuracy", 0.7),
            min(patient_features.get("avg_response_time", 5.0) / 10.0, 1.0),
            patient_features.get("improvement", 0.0) / 100.0,
            min(patient_features.get("error_rate", 0.3), 1.0),
            patient_features.get("completion_rate", 0.9),
            patient_features.get("current_difficulty", 2) / 5.0,
        ]).reshape(1, -1)

    def train_synthetic(self):
        """Train on clearly-labeled synthetic/demo data for the prototype."""
        # Synthetic training data: [avg_accuracy, norm_resp_time, improvement,
        # error_rate, completion_rate, norm_difficulty] -> game_type
        X = np.array([
            [0.90, 0.30, 0.05, 0.05, 0.98, 0.40],  # strong memory -> memory
            [0.85, 0.40, 0.10, 0.10, 0.95, 0.60],  # strong memory -> memory
            [0.60, 0.70, -0.05, 0.35, 0.80, 0.40], # weaker memory -> attention
            [0.55, 0.80, -0.10, 0.40, 0.75, 0.40], # weak attention -> attention
            [0.80, 0.50, 0.03, 0.15, 0.90, 0.40],  # decent -> sequence
            [0.70, 0.60, 0.00, 0.20, 0.85, 0.60],  # moderate -> sequence
            [0.92, 0.25, 0.08, 0.03, 0.99, 0.40],  # excellent -> memory
            [0.45, 0.90, -0.20, 0.50, 0.60, 0.60], # poor -> attention
            [0.78, 0.55, 0.02, 0.18, 0.88, 0.40],  # -> sequence
            [0.88, 0.35, 0.06, 0.06, 0.97, 0.60],  # -> memory
        ])
        y = self._game_encoder.transform(
            ["memory_match", "memory_match", "attention", "attention",
             "sequence_recall", "sequence_recall", "memory_match", "attention",
             "sequence_recall", "memory_match"]
        )
        self.model = GradientBoostingClassifier(
            n_estimators=50, max_depth=2, random_state=42
        )
        self.model.fit(X, y)

    def recommend(self, patient_features: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a recommendation with explanation."""
        if self.model is None:
            self.train_synthetic()

        features = self._features(patient_features)
        probs = self.model.predict_proba(features)[0]
        game_idx = int(np.argmax(probs))
        game_type = self._game_encoder.inverse_transform([game_idx])[0]
        confidence = float(probs[game_idx])

        # Difficulty recommendation
        from app.ml.adaptive_engine import adaptive_engine
        adaptive = adaptive_engine({
            "accuracy": patient_features.get("avg_accuracy", 0.7),
            "response_time": patient_features.get("avg_response_time", 5.0),
            "mistakes": int(patient_features.get("error_rate", 0.3) * 20),
            "current_difficulty": patient_features.get("current_difficulty", 2),
            "recent_scores": patient_features.get("recent_scores", []),
            "game_type": game_type,
        })

        reason = _build_reason(patient_features, game_type, adaptive, confidence)
        return {
            "game_type": game_type,
            "difficulty": adaptive["recommended_difficulty"],
            "reason": reason,
            "confidence": round(confidence, 2),
            "synthetic_model": self._synthetic,
        }

    def train_on_real(self, X, y):
        """Optional future method to retrain on real patient data."""
        self._synthetic = False
        self.model.fit(X, y)


def _build_reason(features, game_type, adaptive, confidence) -> str:
    domain = GAME_DOMAIN.get(game_type, "cognitive")
    accuracy = features.get("avg_accuracy", 0.7)
    difficulty = adaptive["recommended_difficulty"]

    if accuracy >= 0.85:
        return (
            f"Your recent {domain.lower()} accuracy is high. NeuroNest recommends a "
            f"{domain} activity at Level {difficulty} to build on your strength."
        )
    if accuracy < 0.65:
        return (
            f"Your {domain.lower()} accuracy has dipped recently. A Level {difficulty} "
            f"{domain} activity is recommended to rebuild confidence comfortably."
        )
    return (
        f"Based on your recent activity, a {domain} exercise at Level {difficulty} "
        f"would keep you steadily engaged."
    )


recommendation_model = RecommendationModel()
