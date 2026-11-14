"""Agreement of a real (TRIBE v2) load matrix with the placeholder: Spearman per domain."""
from __future__ import annotations

from .matrix import LoadMatrix

# processing_speed is a tempo proxy in both matrices, not a brain-based value: reported, not averaged
EXCLUDED_FROM_MEAN = ("processing_speed",)
METHOD = ("Spearman rank correlation across exercises, per domain, real matrix vs placeholder; "
          "value is the mean over the TRIBE v2 domains (for a hybrid matrix) or over all domains except processing_speed (proxy)")


def _ranks(xs: list[float]) -> list[float]:
    order = sorted(range(len(xs)), key=lambda i: xs[i])
    ranks = [0.0] * len(xs)
    i = 0
    while i < len(order):
        j = i
        while j + 1 < len(order) and xs[order[j + 1]] == xs[order[i]]:
            j += 1
        for k in range(i, j + 1):
            ranks[order[k]] = (i + j) / 2 + 1
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float | None:
    if len(a) < 3:
        return None
    ra, rb = _ranks(a), _ranks(b)
    ma, mb = sum(ra) / len(ra), sum(rb) / len(rb)
    num = sum((x - ma) * (y - mb) for x, y in zip(ra, rb))
    da = sum((x - ma) ** 2 for x in ra) ** 0.5
    db = sum((y - mb) ** 2 for y in rb) ** 0.5
    return num / (da * db) if da and db else None


def spearman_agreement(real: LoadMatrix, placeholder: LoadMatrix, domains: list[str] | None = None) -> dict:
    ids = sorted(set(real.loads) & set(placeholder.loads))
    per = {}
    for d in real.domains:
        per[d] = spearman([real.validation_value(i, d) for i in ids], [placeholder.loads[i][d] for i in ids])
    if domains is None:
        domains = [d for d in real.domains if d not in EXCLUDED_FROM_MEAN]
    vals = [per[d] for d in domains if per.get(d) is not None]
    return {"value": sum(vals) / len(vals) if vals else None, "per_domain": per, "exercises_compared": len(ids),
            "domains_in_mean": list(domains)}
