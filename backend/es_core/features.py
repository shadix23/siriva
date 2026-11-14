"""Speech features from a transcript with word timings (picture description and free speech).

Temporal features (pauses, latency, rate) do not depend on the language.
Lexical ones use the small dictionaries from lang.py.
"""
from __future__ import annotations

from statistics import mean

from .lang import (CORRECTION_PHRASES, FILLERS, FILLER_PHRASES, SUBORDINATORS, check_language,
                   is_function_word, is_noun_proxy, is_pronoun, norm_token)
from .types import Transcript

PAUSE_MIN_S = 0.25      # gap between words counted as a pause
UTTERANCE_BREAK_S = 1.0  # gap that splits utterances when there is no punctuation
MATTR_WINDOW = 20


def mattr(tokens: list[str], window: int = MATTR_WINDOW) -> float | None:
    """Moving-average type-token ratio: stable for texts of different length."""
    n = len(tokens)
    if n == 0:
        return None
    w = min(window, n)
    ratios = [len(set(tokens[i:i + w])) / w for i in range(n - w + 1)]
    return sum(ratios) / len(ratios)


def _count_phrases(tokens: list[str], phrases: list[tuple[str, ...]]) -> int:
    c = 0
    for i in range(len(tokens)):
        for ph in phrases:
            if tuple(tokens[i:i + len(ph)]) == ph:
                c += 1
    return c


def extract_speech_features(tr: Transcript, language: str | None = None) -> dict[str, float | None]:
    lang = check_language(language or tr.language)
    words = [w for w in tr.words if norm_token(w.text)]
    toks = [norm_token(w.text) for w in words]
    n = len(words)
    empty: dict[str, float | None] = {
        "word_count": 0, "first_word_latency": None, "pause_ratio": None, "pause_count": 0,
        "pause_before_content_mean": None, "speech_rate_wpm": None, "articulation_rate_wpm": None,
        "mattr": None, "pronoun_share": None, "mean_utterance_len": None,
        "subordination_per100": None, "disfluency_per100": None, "filler_count": 0,
        "repetition_count": 0, "self_correction_count": 0,
    }
    if n == 0:
        return empty

    first_latency = max(0.0, words[0].start)
    span = max(words[-1].end - words[0].start, 1e-6)

    gaps = [max(0.0, words[i].start - words[i - 1].end) for i in range(1, n)]
    pauses = [g for g in gaps if g >= PAUSE_MIN_S]
    pause_total = sum(pauses)
    pause_ratio = pause_total / span if n > 1 else 0.0

    content_gaps = [gaps[i - 1] for i in range(1, n) if not is_function_word(toks[i], lang)]
    pause_before_content = mean(content_gaps) if content_gaps else None

    speech_rate = n / span * 60.0
    articulate_time = max(span - pause_total, 1e-6)
    articulation_rate = n / articulate_time * 60.0

    pronouns = sum(1 for t in toks if is_pronoun(t, lang))
    nouns = sum(1 for t in toks if is_noun_proxy(t, lang))
    pronoun_share = pronouns / (pronouns + nouns) if (pronouns + nouns) else None

    # Utterances: split at sentence-final punctuation or a long gap.
    utt_lens: list[int] = []
    cur = 0
    for i, w in enumerate(words):
        cur += 1
        end_punct = w.text.strip()[-1:] in ".?!"
        long_gap = i + 1 < n and (words[i + 1].start - w.end) >= UTTERANCE_BREAK_S
        if end_punct or long_gap or i == n - 1:
            utt_lens.append(cur)
            cur = 0
    mean_utt = mean(utt_lens)
    subs = sum(1 for t in toks if t in SUBORDINATORS[lang])
    subordination = subs / n * 100

    fillers = sum(1 for t in toks if t in FILLERS[lang]) + _count_phrases(toks, FILLER_PHRASES[lang])
    # Repetitions: a word or a two-word chunk said twice in a row (function words included,
    # "the the" is a typical stumble).
    reps = sum(1 for i in range(1, n) if toks[i] == toks[i - 1] and toks[i] not in FILLERS[lang])
    reps += sum(1 for i in range(3, n)
                if toks[i] != toks[i - 1] and (toks[i - 3], toks[i - 2]) == (toks[i - 1], toks[i]))
    corrections = _count_phrases(toks, CORRECTION_PHRASES[lang])
    disfl = (fillers + reps + corrections) / n * 100

    return {
        "word_count": n,
        "first_word_latency": first_latency,
        "pause_ratio": pause_ratio,
        "pause_count": len(pauses),
        "pause_before_content_mean": pause_before_content,
        "speech_rate_wpm": speech_rate,
        "articulation_rate_wpm": articulation_rate,
        "mattr": mattr(toks),
        "pronoun_share": pronoun_share,
        "mean_utterance_len": mean_utt,
        "subordination_per100": subordination,
        "disfluency_per100": disfl,
        "filler_count": fillers,
        "repetition_count": reps,
        "self_correction_count": corrections,
    }
