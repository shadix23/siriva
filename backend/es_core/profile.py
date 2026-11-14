"""Profile of five functions: transparent weighted heuristic over features.

CALIBRATION STATUS: before calibration on ADReSS (and on any real data). The reference points
below (GOOD / POOR) are rough priors chosen for the demo, not norms. Scores show the function
profile against these reference points, they are not a medical assessment.

Each feature is mapped linearly to 0..1 between POOR (0) and GOOD (1), clipped.
A domain score is the weighted mean of its available features, times 100.
Missing features are skipped and the weights renormalised; `coverage` is the share of weight present.

Per the research notes: episodic memory uses only behavioural retell metrics (no neural source);
processing speed uses only latencies and tempo from telemetry and speech.
TODO(ADReSS): replace the weights with a model trained on English ADReSS speech (English only);
for Russian only the temporal metrics and this profile stay in use.
"""
from __future__ import annotations

from statistics import median
from typing import Mapping

from .types import DOMAINS

CALIBRATION_NOTE_RU = "Предварительная оценка, до калибровки на ADReSS. Это профиль функций относительно ориентиров, а не заключение."
from .config import DAMAGED_THRESHOLD, REDUCED_THRESHOLD

# feature: (poor, good)
REFERENCE: dict[str, tuple[float, float]] = {
    "pause_ratio": (0.45, 0.15),
    "pause_before_content_mean": (0.90, 0.25),
    "first_word_latency": (4.0, 1.0),
    "speech_rate_wpm": (70.0, 150.0),
    "mattr": (0.50, 0.75),
    "pronoun_share": (0.50, 0.20),
    "mean_utterance_len": (4.0, 10.0),
    "subordination_per100": (1.0, 6.0),
    "disfluency_per100": (12.0, 3.0),
    "fluency_count": (8.0, 22.0),
    "fluency_late_early_ratio": (0.15, 0.50),
    "fluency_repeats": (4.0, 0.0),
    "retell_immediate_frac": (0.15, 0.50),
    "retell_delayed_frac": (0.10, 0.45),
    "retell_retention": (0.40, 0.90),
    "time_to_first_action_s": (6.0, 1.5),
    "hints_per_session": (4.0, 0.0),
    "interruptions_per_session": (3.0, 0.0),
    "rt_cv": (0.70, 0.25),
}

# domain -> {feature: weight}; weights of a domain sum to 1.
WEIGHTS: dict[str, dict[str, float]] = {
    "episodic_memory": {"retell_retention": 0.45, "retell_delayed_frac": 0.35, "retell_immediate_frac": 0.20},
    "word_access": {"fluency_count": 0.30, "pause_before_content_mean": 0.25, "pronoun_share": 0.20,
                    "mattr": 0.15, "fluency_repeats": 0.10},
    "phrase_building": {"mean_utterance_len": 0.35, "subordination_per100": 0.25,
                        "disfluency_per100": 0.20, "mattr": 0.20},
    "attention": {"rt_cv": 0.25, "hints_per_session": 0.20, "interruptions_per_session": 0.20,
                  "fluency_late_early_ratio": 0.20, "pause_ratio": 0.15},
    "processing_speed": {"time_to_first_action_s": 0.40, "speech_rate_wpm": 0.35, "first_word_latency": 0.25},
}

DOMAIN_LABEL_RU = {
    "episodic_memory": "Эпизодическая память",
    "word_access": "Доступ к слову",
    "phrase_building": "Построение фраз",
    "attention": "Внимание",
    "processing_speed": "Скорость обработки",
}


def normalise(feature: str, value: float) -> float:
    poor, good = REFERENCE[feature]
    x = (value - poor) / (good - poor)
    return max(0.0, min(1.0, x))


def build_profile(features: Mapping[str, float | None]) -> dict:
    domains: dict[str, dict] = {}
    for d in DOMAINS:
        wmap = WEIGHTS[d]
        used, total_w, acc = [], 0.0, 0.0
        for f, w in wmap.items():
            v = features.get(f)
            if v is None:
                continue
            n = normalise(f, float(v))
            used.append({"feature": f, "value": round(float(v), 4), "normalised": round(n, 3), "weight": w})
            total_w += w
            acc += w * n
        cov = total_w / sum(wmap.values())
        if total_w == 0:
            domains[d] = {"score": None, "coverage": 0.0, "reduced": None, "damaged": None, "contributions": [],
                          "label_ru": DOMAIN_LABEL_RU[d]}
            continue
        score = round(100.0 * acc / total_w, 1)
        domains[d] = {"score": score, "coverage": round(cov, 2), "reduced": score < REDUCED_THRESHOLD,
                      "damaged": score < DAMAGED_THRESHOLD,
                      "contributions": used, "label_ru": DOMAIN_LABEL_RU[d]}
    return {"domains": domains, "reduced_threshold": REDUCED_THRESHOLD, "damaged_threshold": DAMAGED_THRESHOLD,
            "calibration": "before_adress_calibration", "note": CALIBRATION_NOTE_RU}


def scores(profile: dict) -> dict[str, float | None]:
    return {d: profile["domains"][d]["score"] for d in DOMAINS}


def median_features(rows: list[Mapping[str, float | None]]) -> dict[str, float]:
    """Median per feature across sessions (None skipped); resistant to a single bad day."""
    keys = {k for r in rows for k in r}
    out: dict[str, float] = {}
    for k in keys:
        vals = [float(r[k]) for r in rows if isinstance(r.get(k), (int, float)) and r.get(k) is not None]
        if vals:
            out[k] = median(vals)
    return out
