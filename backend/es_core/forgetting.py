"""Forgetting model for materials that are learned (stories, picture sets, sequences).

Light half-life regression: predicted recall after dt days is p = 2^(-dt / h), h is the half-life in days.
- First exposure: h0 = prior half-life * (0.5 + encoding strength), strength 0..1 (e.g. share of story units told).
- Every later check with observed recall q (0..1) moves log h by ETA * (q - p), and, when q is good (>= 0.7),
  adds a spacing gain proportional to how much was forgotten (1 - p): a late successful recall strengthens
  memory more than an immediate one.
- Next review is planned when predicted recall falls to FORGET_TARGET_RECALL (0.8): dt = h * log2(1 / 0.8).
Not calibrated on real data (TODO: fit ETA and gain on real review logs, then compare with FSRS).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta

from .config import (FORGET_MAX_HALF_LIFE_DAYS, FORGET_MIN_HALF_LIFE_DAYS, FORGET_PRIOR_HALF_LIFE_DAYS,
                     FORGET_TARGET_RECALL)

ETA = 1.2
SPACING_GAIN = 1.0
GOOD_RECALL = 0.7
DAY = 86400.0


@dataclass
class MemoryState:
    half_life_days: float
    last_review_at: datetime
    reviews: int = 1
    best_frac: float = 0.0   # best share recalled so far (used to judge later free recall)


def _clamp(h: float) -> float:
    return max(FORGET_MIN_HALF_LIFE_DAYS, min(FORGET_MAX_HALF_LIFE_DAYS, h))


def recall_probability(half_life_days: float, dt_days: float) -> float:
    return 2.0 ** (-max(dt_days, 0.0) / half_life_days)


def init_state(strength: float, at: datetime) -> MemoryState:
    strength = max(0.0, min(1.0, strength))
    return MemoryState(_clamp(FORGET_PRIOR_HALF_LIFE_DAYS * (0.5 + strength)), at, 1, strength)


def update(state: MemoryState, q: float, now: datetime) -> MemoryState:
    q = max(0.0, min(1.0, q))
    dt = max((now - state.last_review_at).total_seconds() / DAY, 0.0)
    p = recall_probability(state.half_life_days, dt)
    log_h = math.log(state.half_life_days) + ETA * (q - p)
    if q >= GOOD_RECALL:
        log_h += SPACING_GAIN * (1.0 - p)
    return MemoryState(_clamp(math.exp(log_h)), now, state.reviews + 1, max(state.best_frac, q))


def next_review_at(state: MemoryState, target: float = FORGET_TARGET_RECALL) -> datetime:
    return state.last_review_at + timedelta(days=state.half_life_days * math.log2(1.0 / target))


def describe(state: MemoryState, now: datetime) -> dict:
    dt = max((now - state.last_review_at).total_seconds() / DAY, 0.0)
    p = recall_probability(state.half_life_days, dt)
    nxt = next_review_at(state)
    return {"half_life_days": round(state.half_life_days, 2), "predicted_recall": round(p, 3),
            "next_review_at": nxt.isoformat(timespec="seconds"), "due": p <= FORGET_TARGET_RECALL,
            "last_review_at": state.last_review_at.isoformat(timespec="seconds"), "reviews": state.reviews}
