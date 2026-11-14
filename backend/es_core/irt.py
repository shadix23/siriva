"""IRT (1PL, Rasch) for exercise difficulty levels, per domain.

P(success | ability theta, level difficulty b) = sigmoid(theta - b). Results come as accuracy in 0..1 over
n trials, used as fractional successes (quasi-likelihood), so one result informs the estimate in proportion
to its size.
- Calibration of level difficulties: marginal ML (EM, Gauss-Hermite nodes) on a SYNTHETIC population, see
  scripts/calibrate_irt.py. The numbers are not real-patient norms (TODO: recalibrate on real data).
- Patient ability per domain: EAP (posterior mean) with a N(0, 1) prior.
- Level choice: the level whose predicted success is closest to the target 0.75. With too few results the
  70-80% rule from planner.py is the fallback (source "rule").
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .config import DIFF_MAX, DIFF_MIN, IRT_MIN_RESULTS, IRT_TARGET_SUCCESS
from .types import DOMAINS

CALIBRATION_FILE = Path(__file__).parent / "data" / "irt_calibration.json"
NODES = np.linspace(-5.0, 5.0, 61)
PRIOR_SD = 1.0
TRIALS_DEFAULT = 6   # how many trials a reported accuracy is worth when the client sends none

# generating difficulties of the synthetic population (levels 1..5), per domain
TRUE_DIFFICULTY = {
    "episodic_memory": [-1.2, -0.4, 0.3, 1.1, 1.9],
    "word_access": [-1.5, -0.7, 0.0, 0.8, 1.6],
    "phrase_building": [-1.4, -0.6, 0.1, 0.9, 1.7],
    "attention": [-1.6, -0.8, -0.1, 0.7, 1.5],
    "processing_speed": [-1.7, -0.9, -0.2, 0.6, 1.4],
}


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _prior():
    w = np.exp(-0.5 * (NODES / PRIOR_SD) ** 2)
    return w / w.sum()


def eap(results: list[tuple[int, float, float]], difficulty: list[float]) -> tuple[float, float]:
    """results: (level 1..5, accuracy 0..1, trials). Returns (theta, posterior sd)."""
    logp = np.log(_prior())
    for level, acc, n in results:
        p = np.clip(sigmoid(NODES - difficulty[level - 1]), 1e-9, 1 - 1e-9)
        logp = logp + n * (acc * np.log(p) + (1 - acc) * np.log(1 - p))
    post = np.exp(logp - logp.max())
    post /= post.sum()
    theta = float((post * NODES).sum())
    sd = float(math.sqrt((post * (NODES - theta) ** 2).sum()))
    return theta, sd


def success_probability(theta: float, b: float) -> float:
    return float(sigmoid(theta - b))


def choose_level(theta: float, difficulty: list[float], target: float = IRT_TARGET_SUCCESS) -> tuple[int, float]:
    probs = [success_probability(theta, b) for b in difficulty]
    best = min(range(len(probs)), key=lambda i: abs(probs[i] - target))
    return DIFF_MIN + best, probs[best]


def load_calibration(path: Path | str | None = None) -> dict[str, list[float]]:
    raw = json.loads(Path(path or CALIBRATION_FILE).read_text())
    cal = {d: [float(x) for x in raw["domains"][d]["difficulty"]] for d in DOMAINS}
    for d, b in cal.items():
        if len(b) != DIFF_MAX - DIFF_MIN + 1 or any(b[i] >= b[i + 1] for i in range(len(b) - 1)):
            raise ValueError(f"IRT calibration for {d} must have 5 increasing difficulties")
    return cal


def plan_level(results: list[tuple[int, float, float]], difficulty: list[float], rule_level: int) -> dict:
    """Level for the next exercise of a domain. IRT when there are enough results, else the rule level."""
    theta, sd = eap(results, difficulty)
    n = len(results)
    if n >= IRT_MIN_RESULTS:
        level, p = choose_level(theta, difficulty)
        source = "irt"
    else:
        level, source = rule_level, "rule"
        p = success_probability(theta, difficulty[level - 1])
    return {"level": level, "predicted_success": round(p, 3), "source": source,
            "theta": round(theta, 3), "theta_sd": round(sd, 3), "results": n}


# ---------- synthetic population and calibration (used by scripts/calibrate_irt.py and tests) ----------
def simulate_population(n_patients: int, seed: int, true_b: list[float], results_per_patient: int = 10,
                        trials: int = TRIALS_DEFAULT) -> list[list[tuple[int, float, float]]]:
    """Patients with theta ~ N(0,1) doing exercises; the level follows the 70-80% rule (as in the product)."""
    rng = np.random.default_rng(seed)
    out = []
    for _ in range(n_patients):
        theta = rng.normal(0, 1)
        level = 2
        res = []
        for _ in range(results_per_patient):
            p = sigmoid(theta - true_b[level - 1])
            acc = rng.binomial(trials, p) / trials
            res.append((level, float(acc), float(trials)))
            level = max(DIFF_MIN, min(DIFF_MAX, level + (1 if acc > 0.80 else -1 if acc < 0.70 else 0)))
        out.append(res)
    return out


def calibrate(population: list[list[tuple[int, float, float]]], iterations: int = 60) -> list[float]:
    """Marginal ML for the Rasch level difficulties (EM with Gauss-Hermite style nodes, prior N(0,1))."""
    k = DIFF_MAX - DIFF_MIN + 1
    b = np.zeros(k)
    prior = np.log(_prior())
    for _ in range(iterations):
        r = np.zeros((k, len(NODES)))   # expected successes
        m = np.zeros((k, len(NODES)))   # expected trials
        for res in population:
            logp = prior.copy()
            for level, acc, n in res:
                p = np.clip(sigmoid(NODES - b[level - 1]), 1e-9, 1 - 1e-9)
                logp = logp + n * (acc * np.log(p) + (1 - acc) * np.log(1 - p))
            post = np.exp(logp - logp.max())
            post /= post.sum()
            for level, acc, n in res:
                r[level - 1] += post * acc * n
                m[level - 1] += post * n
        for j in range(k):  # one Newton step per level
            p = sigmoid(NODES - b[j])
            grad = float((r[j] - m[j] * p).sum())
            hess = float((m[j] * p * (1 - p)).sum())
            b[j] += float(np.clip(grad / max(hess, 1e-6), -0.5, 0.5)) * -1.0
    return [float(x) for x in b]
