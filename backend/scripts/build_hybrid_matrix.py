"""Builds the hybrid load matrix: TRIBE v2 values where TRIBE v2 is validated, task-type estimate elsewhere.

Default sources of each domain (validation: es/tribe/mac/work/v2_val_audio.md, Spearman vs the task-type markup
and known-group tests):
  word_access, phrase_building, attention  -> TRIBE v2 (validated)
  episodic_memory, processing_speed        -> task-type estimate (TRIBE v2 is not validated for them: the public
                                              model has no hippocampus; speed is only a tempo proxy)

Scale: TRIBE v2 values are z-scores across the stimulus set squeezed to 0..1 (0.5 = an average stimulus), so a
screen task sits near 0.3 on "word_access" instead of 0. The planner penalises load on avoided functions, so the
default `--scale quantile` keeps the TRIBE ORDER of the exercises (what the validation supports, Spearman and
known groups) and puts the magnitudes on the task-type scale of the same domain (rank matching). Raw TRIBE values
stay in metadata.tribe_raw_loads. `--scale raw` uses the TRIBE numbers as they are.

Run (re-run when a fuller TRIBE matrix arrives, text and video from other machines):
  cd es/backend && PYTHONPATH=. .venv/bin/python scripts/build_hybrid_matrix.py [--tribe PATH] [--tribe-domains a,b,c]
Then switch the app with: ES_LOAD_MATRIX=es/tribe/out/load_matrix.hybrid.json
"""
import argparse
import json
from pathlib import Path

from es_core.matrix import DATA, JsonMatrixLoader
from es_core.types import DOMAINS

ES = Path(__file__).resolve().parents[2]
DEFAULT_TRIBE = ES / "tribe" / "out" / "load_matrix.tribe_v2.en.audio-only.json"
DEFAULT_VALIDATION = ES / "tribe" / "mac" / "work" / "v2_val_audio.md"
DEFAULT_OUT = ES / "tribe" / "out" / "load_matrix.hybrid.json"
DEFAULT_TRIBE_DOMAINS = ("word_access", "phrase_building", "attention")
SHORT_RU = {"episodic_memory": "память", "attention": "внимание", "processing_speed": "скорость"}


def group_ru(domains: list[str]) -> str:
    parts = []
    if {"word_access", "phrase_building"} <= set(domains):
        parts.append("речь")
    else:
        parts += [{"word_access": "доступ к слову", "phrase_building": "построение фраз"}[d]
                  for d in domains if d in ("word_access", "phrase_building")]
    parts += [SHORT_RU[d] for d in DOMAINS if d in domains and d in SHORT_RU]
    return " и ".join([", ".join(parts[:-1]), parts[-1]] if len(parts) > 2 else parts)


def quantile_match(tribe_vals: dict[str, float], target_vals: dict[str, float]) -> dict[str, float]:
    """Rank-preserving map: the k-th smallest TRIBE value gets the k-th smallest task-type value (ties averaged)."""
    ids = sorted(tribe_vals, key=lambda i: tribe_vals[i])
    tgt = sorted(target_vals.values())
    out, i = {}, 0
    while i < len(ids):
        j = i
        while j + 1 < len(ids) and tribe_vals[ids[j + 1]] == tribe_vals[ids[i]]:
            j += 1
        v = sum(tgt[i:j + 1]) / (j - i + 1)
        for k in range(i, j + 1):
            out[ids[k]] = round(v, 4)
        i = j + 1
    return out


def build(tribe_path: Path, validation: Path, out: Path, tribe_domains: tuple[str, ...], scale: str = "quantile") -> dict:
    tribe_raw = json.loads(tribe_path.read_text())
    JsonMatrixLoader(tribe_path).load()  # format check (raises)
    ph = JsonMatrixLoader(DATA / "load_matrix.placeholder.json").load()
    missing = [i for i in ph.loads if i not in tribe_raw["loads"]]
    if missing:
        raise SystemExit(f"TRIBE matrix lacks exercises: {missing}")
    other = [d for d in DOMAINS if d not in tribe_domains]
    scaled = {}
    for d in tribe_domains:
        raw_d = {ex: float(tribe_raw["loads"][ex][d]) for ex in ph.loads}
        scaled[d] = quantile_match(raw_d, {ex: ph.loads[ex][d] for ex in ph.loads}) if scale == "quantile" else raw_d
    loads = {ex: {d: (scaled[d][ex] if d in tribe_domains else ph.loads[ex][d]) for d in DOMAINS} for ex in ph.loads}
    label = (f"Нагрузка на {group_ru(list(tribe_domains))}: TRIBE v2; "
             f"на {group_ru(other)}: оценка по типу задания") if other else "Нагрузка: TRIBE v2"
    meta = tribe_raw.get("metadata", {})
    result = {
        "source": "гибрид: TRIBE v2 + оценка по типу задания",
        "label_ru": label,
        "model_version": tribe_raw.get("model_version"),
        "atlas": tribe_raw.get("atlas"),
        "domains": list(DOMAINS),
        "domain_notes": {
            **{d: "TRIBE v2 predicted load, validated against known groups" for d in tribe_domains},
            **{d: "task-type estimate (TRIBE v2 is not validated for this domain)" for d in other},
        },
        "metadata": {
            "kind": "hybrid",
            "domain_sources": {d: ("tribe_v2" if d in tribe_domains else "task_type_estimate") for d in DOMAINS},
            "tribe_matrix": {
                "file": str(tribe_path.relative_to(ES)) if tribe_path.is_relative_to(ES) else str(tribe_path),
                "source": tribe_raw.get("source"), "label_ru": tribe_raw.get("label_ru"),
                "modalities_computed": meta.get("modalities_computed"),
                "stimulus_language": meta.get("stimulus_language"),
                "method": meta.get("method"), "license": meta.get("license"),
                "validation": str(validation.relative_to(ES)) if validation.is_relative_to(ES) else str(validation),
            },
            "scale": scale,
            "scale_note": ("TRIBE order kept, magnitudes matched by rank to the task-type scale of the same domain"
                           if scale == "quantile" else "raw TRIBE values"),
            "tribe_raw_loads": {ex: {d: tribe_raw["loads"][ex][d] for d in tribe_domains} for ex in ph.loads},
            "task_type_estimate_file": "es/backend/es_core/data/load_matrix.placeholder.json",
            "built_by": "es/backend/scripts/build_hybrid_matrix.py",
        },
        "loads": loads,
    }
    out.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    JsonMatrixLoader(out).load()  # the result must pass the loader
    return result


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--tribe", type=Path, default=DEFAULT_TRIBE)
    ap.add_argument("--validation", type=Path, default=DEFAULT_VALIDATION)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--scale", choices=("quantile", "raw"), default="quantile")
    ap.add_argument("--tribe-domains", default=",".join(DEFAULT_TRIBE_DOMAINS))
    a = ap.parse_args()
    td = tuple(x.strip() for x in a.tribe_domains.split(",") if x.strip())
    bad = [d for d in td if d not in DOMAINS]
    if bad:
        raise SystemExit(f"unknown domains: {bad}")
    r = build(a.tribe.resolve(), a.validation.resolve(), a.out.resolve(), td, a.scale)
    print("written", a.out, "|", r["label_ru"])
    print("domain sources:", r["metadata"]["domain_sources"])
