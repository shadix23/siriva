"""Weekly trajectory and the trend flag for a close person.

The flag describes the direction of change of a function against a reference slope.
It is not a conclusion about a person's health. Thresholds are placeholders until calibration.
"""
from __future__ import annotations

from .profile import DOMAIN_LABEL_RU
from .texts import guillemets as g, weeks_ru
from .types import DOMAINS

from .config import (TREND_DELTA_FLAG as DELTA_FLAG, TREND_MIN_WEEKS as MIN_WEEKS,
                     TREND_NORMAL_WEEKLY_SLOPE as NORMAL_WEEKLY_SLOPE, TREND_SLOPE_FLAG as SLOPE_FLAG)


def slope(ys: list[float]) -> float:
    n = len(ys)
    xs = list(range(n))
    mx, my = sum(xs) / n, sum(ys) / n
    den = sum((x - mx) ** 2 for x in xs)
    return sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den if den else 0.0


def trend_for_domain(series: list[float | None]) -> dict:
    pts = [s for s in series if s is not None]
    if len(pts) < MIN_WEEKS:
        return {"weeks": len(pts), "slope_per_week": None, "delta": None, "flag": False}
    sl = slope(pts)
    delta = sum(pts[-3:]) / 3 - sum(pts[:3]) / 3
    return {"weeks": len(pts), "slope_per_week": round(sl, 2), "delta": round(delta, 1),
            "flag": sl <= SLOPE_FLAG and delta <= DELTA_FLAG}


def trend_flag(weekly_scores: dict[str, list[float | None]]) -> dict:
    per = {d: trend_for_domain(weekly_scores.get(d, [])) for d in DOMAINS}
    flagged = [d for d, t in per.items() if t["flag"]]
    weeks = max((t["weeks"] for t in per.values()), default=0)
    if flagged:
        names = ", ".join(g(DOMAIN_LABEL_RU[d]) for d in flagged)
        msg = (f"За {weeks_ru(weeks)} динамика по {names} идёт заметно ниже ориентира. "
               "Это наблюдение за трендом, не вывод о состоянии. Обсудите со специалистом.")
    else:
        msg = "Заметного отклонения динамики от ориентира не видно."
    return {"code": "trend_watch" if flagged else "trend_none", "message_params": {"weeks": weeks, "domains": flagged},
            "active": bool(flagged), "level": "watch" if flagged else "none", "domains": flagged,
            "domain_labels": [DOMAIN_LABEL_RU[d] for d in flagged], "message": msg,
            "reference_slope_per_week": NORMAL_WEEKLY_SLOPE, "per_domain": per}
