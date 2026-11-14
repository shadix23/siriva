"""Program for today: aim at the lowered domain, stay away from the reduced one, respect the dose.

score(e) = load(e, target) - LAMBDA * sum(load(e, d) for d in reduced domains other than target)
Items with score <= MIN_SCORE are dropped. Greedy by score under a dose budget:
dose(e) = duration_min * sum of loads over domains ("dose units"), budget per session DOSE_BUDGET.
Difficulty is kept per domain: accuracy 70-80% holds, above 80% harder, below 70% easier.
"""
from __future__ import annotations

from dataclasses import dataclass

from .matrix import Exercise, LoadMatrix
from .profile import DOMAIN_LABEL_RU, REDUCED_THRESHOLD
from .texts import guillemets as g, num_ru
from .types import DOMAINS

from .config import (DAMAGED_THRESHOLD, MIN_FILL_SCORE, ACC_HIGH, ACC_LOW, DEFAULT_DIFFICULTY, DIFF_MAX, DIFF_MIN, DOSE_BUDGET, LAMBDA, MAX_ITEMS,
                     MIN_ITEM_SCORE as MIN_SCORE)


def adapt_difficulty(level: int, accuracy: float) -> int:
    if accuracy > ACC_HIGH:
        level += 1
    elif accuracy < ACC_LOW:
        level -= 1
    return max(DIFF_MIN, min(DIFF_MAX, level))


def dose(ex: Exercise, loads: dict[str, float]) -> float:
    return round(ex.duration_min * sum(loads.values()), 2)


def pick_target_and_avoid(domain_scores: dict[str, float | None], target: str | None = None,
                          threshold: float = DAMAGED_THRESHOLD) -> tuple[str, list[str]]:
    """Target: the lowest function that is not damaged (damaged = below `threshold`).
    Damaged functions go to `avoid`. If every function is damaged, the lowest one is the target."""
    known = {d: s for d, s in domain_scores.items() if s is not None}
    if not known:
        raise ValueError("profile has no scores yet")
    if target is None:
        ok = {d: s for d, s in known.items() if s >= threshold} or known
        target = min(ok, key=lambda d: ok[d])
    elif target not in DOMAINS:
        raise ValueError(f"unknown domain: {target}")
    avoid = [d for d, s in known.items() if d != target and s < threshold]
    return target, avoid


def primary_domain(loads: dict[str, float]) -> str:
    return max(loads, key=lambda d: loads[d])


def _select(exercises: list[Exercise], matrix: LoadMatrix, target: str, avoid: list[str],
            lam: float, budget: float, max_items: int, only: set[str] | None = None) -> list[dict]:
    cands = []
    for ex in exercises:
        if ex.id not in matrix.loads or (only is not None and ex.id not in only):
            continue
        ld = matrix.load(ex.id)
        pen = sum(ld[d] for d in avoid)
        sc = ld[target] - lam * pen
        if sc > MIN_FILL_SCORE:
            cands.append((sc, ex, ld, pen))
    cands.sort(key=lambda c: (-c[0], c[1].id))
    chosen, spent = [], 0.0
    # pass 1: items that clearly help the target; pass 2: top up the dose budget with weaker ones
    for floor in (MIN_SCORE, MIN_FILL_SCORE):
        for sc, ex, ld, pen in cands:
            if sc <= floor or any(c["exercise"].id == ex.id for c in chosen):
                continue
            ds = dose(ex, ld)
            if len(chosen) >= max_items or spent + ds > budget:
                continue
            chosen.append({"exercise": ex, "loads": ld, "score": round(sc, 3), "dose": ds,
                           "avoid_load": round(pen, 3)})
            spent += ds
    return chosen


def plan_program(domain_scores: dict[str, float | None], exercises: list[Exercise], matrix: LoadMatrix,
                 difficulty: dict[str, int] | None = None, target: str | None = None, lam: float = LAMBDA,
                 budget: float = DOSE_BUDGET, max_items: int = MAX_ITEMS,
                 only: set[str] | None = None) -> dict:
    difficulty = difficulty or {}
    target, avoid = pick_target_and_avoid(domain_scores, target)
    chosen = _select(exercises, matrix, target, avoid, lam, budget, max_items, only)
    naive = _select(exercises, matrix, target, [], lam, budget, max_items, only)
    items = []
    for c in chosen:
        ex: Exercise = c["exercise"]
        prim = primary_domain(c["loads"])
        avoided = {d: c["loads"][d] for d in avoid}
        items.append({
            "exercise_id": ex.id, "kind": ex.kind, "channel": ex.channel, "title": ex.title_ru,
            "duration_min": ex.duration_min, "speech_output": ex.speech_output,
            "difficulty": difficulty.get(prim, DEFAULT_DIFFICULTY), "difficulty_domain": prim,
            "score": c["score"], "dose": c["dose"],
            "predicted_load": {d: c["loads"][d] for d in DOMAINS},
            "rationale": (f"Нагрузка на {g(DOMAIN_LABEL_RU[target])}: {num_ru(c['loads'][target])}"
                          + (", на сниженные функции: " + ", ".join(f"{g(DOMAIN_LABEL_RU[d])} {num_ru(v)}"
                                                                    for d, v in avoided.items()) if avoided else "")),
            "rationale_params": {"target_domain": target, "target_load": c["loads"][target],
                                 "avoid_loads": avoided},
        })
    naive_ids = [c["exercise"].id for c in naive]
    ids = [i["exercise_id"] for i in items]
    return {
        "target_domain": target, "target_label": DOMAIN_LABEL_RU[target],
        "avoid_domains": avoid, "avoid_labels": [DOMAIN_LABEL_RU[d] for d in avoid],
        "lambda": lam, "dose_budget": budget, "dose_total": round(sum(i["dose"] for i in items), 2),
        "items": items,
        "naive_item_ids": naive_ids,
        "differs_from_naive": ids != naive_ids,
        "load_source": matrix.source,
        "summary_code": "bypass" if avoid else "direct",
        "summary_params": {"target_domain": target, "avoid_domains": avoid},
        "summary": (f"Цель на сегодня: {g(DOMAIN_LABEL_RU[target])}."
                    + (f" Задания с большой нагрузкой на {', '.join(g(DOMAIN_LABEL_RU[d]) for d in avoid)} "
                       "сегодня обходим: тренируем цель через сохранные каналы." if avoid else "")),
    }
