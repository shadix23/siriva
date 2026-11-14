"""Story retelling: match a retelling to marked meaning units, immediate vs delayed (20 min)."""
from __future__ import annotations

from .lang import norm_stem, norm_token
from .stories import Story, Unit
from .types import Transcript

WINDOW = 8  # all stems of an alternative must lie within this many tokens


def _positions(tokens: list[str], stem: str) -> list[int]:
    if stem.endswith("$"):  # whole-word match
        return [i for i, t in enumerate(tokens) if t == stem[:-1]]
    return [i for i, t in enumerate(tokens) if t.startswith(stem)]


def _alt_matches(tokens: list[str], alt: tuple[str, ...]) -> bool:
    pos = [_positions(tokens, norm_stem(s)) for s in alt]
    if any(not p for p in pos):
        return False
    if len(alt) == 1:
        return True
    return any(all(any(abs(q - p0) <= WINDOW for q in other) for other in pos[1:]) for p0 in pos[0])


def unit_matched(tokens: list[str], unit: Unit) -> bool:
    return any(_alt_matches(tokens, a) for a in unit.alternatives)


def match_units(tr: Transcript, story: Story) -> list[str]:
    """Ids of the units found in the retelling (tr.language must equal story.language)."""
    tokens = [t for t in (norm_token(w.text) for w in tr.words) if t]
    return [u.id for u in story.units if unit_matched(tokens, u)]


def score_retell(tr: Transcript, story: Story) -> dict:
    found = match_units(tr, story)
    total = len(story.units)
    return {
        "retell_units_found": found,
        "retell_units_total": total,
        "retell_units_count": len(found),
        "retell_frac": len(found) / total,
    }


def compare_phases(immediate_ids: list[str], delayed_ids: list[str], total: int) -> dict:
    """Loss between the two phases. retention = delayed / immediate (None if immediate is 0).

    Units found only in the delayed retelling are not counted as gain (they are listed apart).
    """
    imm, dly = set(immediate_ids), set(delayed_ids)
    kept = imm & dly
    lost = sorted(imm - dly)
    return {
        "retell_immediate_frac": len(imm) / total,
        "retell_delayed_frac": len(dly) / total,
        "retell_units_lost": lost,
        "retell_units_lost_count": len(lost),
        "retell_units_new_in_delayed": sorted(dly - imm),
        "retell_retention": (len(kept) / len(imm)) if imm else None,
    }
