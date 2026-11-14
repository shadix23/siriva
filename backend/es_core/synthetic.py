"""Deterministic synthetic data for the demo (seeded; no global random state).

Features are generated directly (not through audio) so 84 sessions build instantly.
`timed()` builds a timed transcript from plain text for fixtures and end-to-end tests.
"""
from __future__ import annotations

import random
from datetime import date, timedelta

from .types import Transcript, Word

HEALTHY: dict[str, float] = {
    "pause_ratio": 0.22, "pause_before_content_mean": 0.40, "first_word_latency": 1.5,
    "speech_rate_wpm": 135.0, "mattr": 0.70, "pronoun_share": 0.28, "mean_utterance_len": 8.5,
    "subordination_per100": 4.5, "disfluency_per100": 4.0,
    "fluency_count": 18.0, "fluency_late_early_ratio": 0.45, "fluency_repeats": 0.5,
    "retell_immediate_frac": 0.45, "retell_delayed_frac": 0.40, "retell_retention": 0.85,
    "time_to_first_action_s": 2.2, "hints_per_session": 0.6, "interruptions_per_session": 0.2,
    "rt_cv": 0.35,
}
MEMORY_FEATURES = ("retell_immediate_frac", "retell_delayed_frac", "retell_retention")
WORD_ACCESS_FEATURES = ("fluency_count", "pause_before_content_mean", "pronoun_share", "fluency_repeats")
PHRASE_FEATURES = ("mean_utterance_len", "subordination_per100", "disfluency_per100")

MEMORY_LOW = {"retell_immediate_frac": 0.32, "retell_delayed_frac": 0.18, "retell_retention": 0.55}
SPEECH_REDUCED = {
    "fluency_count": 9.0, "pause_before_content_mean": 0.85, "pronoun_share": 0.46, "mattr": 0.56,
    "fluency_repeats": 3.0, "mean_utterance_len": 5.0, "subordination_per100": 1.5,
    "disfluency_per100": 10.0, "fluency_late_early_ratio": 0.25,
}
# value at week 12 for the faster-declining domain (word access) in the trend demo
WORD_ACCESS_END = {"fluency_count": 13.0, "pause_before_content_mean": 0.62, "pronoun_share": 0.40,
                   "fluency_repeats": 1.5}
# normal slow drift: this many percent of the way to a poorer value over the whole period
NORMAL_DRIFT_FRACTION = 0.02
NOISE_SD = 0.04  # of the value scale (relative, see _noise)

_SCALE = {  # rough spread of each feature, to scale noise and drift
    "pause_ratio": 0.30, "pause_before_content_mean": 0.65, "first_word_latency": 3.0,
    "speech_rate_wpm": 80.0, "mattr": 0.25, "pronoun_share": 0.30, "mean_utterance_len": 6.0,
    "subordination_per100": 5.0, "disfluency_per100": 9.0, "fluency_count": 14.0,
    "fluency_late_early_ratio": 0.35, "fluency_repeats": 4.0, "retell_immediate_frac": 0.35,
    "retell_delayed_frac": 0.35, "retell_retention": 0.5, "time_to_first_action_s": 4.5,
    "hints_per_session": 4.0, "interruptions_per_session": 3.0, "rt_cv": 0.45,
}
_HIGHER_IS_BETTER = {"speech_rate_wpm", "mattr", "mean_utterance_len", "subordination_per100",
                     "fluency_count", "fluency_late_early_ratio", "retell_immediate_frac",
                     "retell_delayed_frac", "retell_retention"}


def _rng(seed: int, *key) -> random.Random:
    return random.Random(f"{seed}:" + ":".join(map(str, key)))


def generate_history(seed: int, days: int, anchor: date, base: dict[str, float] | None = None,
                     end_overrides: dict[str, float] | None = None) -> list[tuple[date, dict[str, float]]]:
    """One session per day ending on `anchor`. Features drift slowly, plus noise.

    end_overrides: features that move linearly from base to this value by the last day (faster decline).
    Noise for each feature depends only on (seed, feature, day), so two patients with the same base
    value of a feature get identical series.
    """
    base = {**HEALTHY, **(base or {})}
    end_overrides = end_overrides or {}
    out = []
    for i in range(days):
        frac = i / max(days - 1, 1)
        feats = {}
        for k, v0 in base.items():
            sc = _SCALE[k]
            sign = -1.0 if k in _HIGHER_IS_BETTER else 1.0
            if k in end_overrides:
                v = v0 + (end_overrides[k] - v0) * frac
            else:
                v = v0 + sign * NORMAL_DRIFT_FRACTION * sc * frac
            v += _rng(seed, k, i).gauss(0, NOISE_SD * sc)
            feats[k] = round(max(v, 0.0), 4)
        feats["retell_retention"] = min(feats["retell_retention"], 1.0)
        feats["fluency_count"] = float(round(feats["fluency_count"]))
        out.append((anchor - timedelta(days=days - 1 - i), feats))
    return out


def demo_trend_history(seed: int = 7, anchor: date | None = None, weeks: int = 12):
    anchor = anchor or date.today()
    return generate_history(seed, weeks * 7, anchor, end_overrides=WORD_ACCESS_END)


def demo_bypass_histories(seed: int = 11, anchor: date | None = None, days: int = 14):
    """Two patients: identical episodic-memory deficit, different speech. A: speech intact. B: speech reduced."""
    anchor = anchor or date.today()
    a = generate_history(seed, days, anchor, base=MEMORY_LOW)
    b = generate_history(seed, days, anchor, base={**MEMORY_LOW, **SPEECH_REDUCED})
    return a, b


def timed(text: str, wps: float = 2.4, gap_after: dict[int, float] | None = None, start: float = 0.0,
          language: str = "en", duration: float | None = None, word_s: float | None = None) -> Transcript:
    """Timed transcript from text: `wps` words per second, extra silence after word index in gap_after."""
    gap_after = gap_after or {}
    toks = text.split()
    step = 1.0 / wps
    wlen = word_s if word_s is not None else step * 0.7
    t, words = start, []
    for i, tok in enumerate(toks):
        words.append(Word(tok, t, t + wlen))
        t += step + gap_after.get(i, 0.0)
    return Transcript(words=words, language=language, duration=duration or t, engine="synthetic")
