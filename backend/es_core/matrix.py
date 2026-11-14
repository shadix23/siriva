"""Load matrix "exercise x domain": loader interface and the placeholder file.

Predicted load, not a measurement of anyone's brain. The real TRIBE v2 output is an
fsaverage5 cortex map (20 484 vertices) plus subcortex at 1 Hz; an offline job must reduce it to
one number per (stimulus, domain) before it reaches this loader. Everything the loader needs:
  source, model_version, atlas, domains, loads{exercise_id: {domain: 0..1}}.
TODO(TRIBE v2): write that offline reducer (network/ROI -> domain mapping, see docs/RESEARCH-ACCESS-TRIBE.md).
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

from .types import DOMAINS

DATA = Path(__file__).parent / "data"
PLACEHOLDER_SOURCE = "placeholder, not TRIBE v2"


@dataclass
class Exercise:
    id: str
    kind: str
    channel: str
    duration_min: int
    measures: bool
    speech_output: bool
    title_ru: str


@dataclass
class LoadMatrix:
    source: str
    domains: tuple[str, ...]
    loads: dict[str, dict[str, float]]
    model_version: str | None = None
    atlas: str | None = None
    domain_notes: dict[str, str] = field(default_factory=dict)
    label_ru: str | None = None
    domain_sources: dict[str, str] = field(default_factory=dict)  # domain -> tribe_v2 | task_type_estimate (hybrid)
    raw_tribe_loads: dict[str, dict[str, float]] = field(default_factory=dict)  # unscaled TRIBE values (hybrid)

    @property
    def is_placeholder(self) -> bool:
        return self.source == PLACEHOLDER_SOURCE

    @property
    def is_hybrid(self) -> bool:
        return "task_type_estimate" in self.domain_sources.values() and "tribe_v2" in self.domain_sources.values()

    def validation_value(self, exercise_id: str, domain: str) -> float:
        """Value used for agreement checks: the unscaled TRIBE number when the hybrid kept it."""
        return self.raw_tribe_loads.get(exercise_id, {}).get(domain, self.loads[exercise_id][domain])

    @property
    def tribe_domains(self) -> list[str]:
        """Domains whose values come from TRIBE v2 (all of them for a plain TRIBE matrix, none for the placeholder)."""
        if self.domain_sources:
            return [d for d in self.domains if self.domain_sources.get(d) == "tribe_v2"]
        return [] if self.is_placeholder else list(self.domains)

    @property
    def label(self) -> str:
        """Short Russian label of the source for texts; honest for both the placeholder and a real matrix."""
        if self.label_ru:
            return self.label_ru
        if self.is_placeholder:
            return "Предварительная нагрузка по типу задания, не результат TRIBE v2"
        return f"Предсказанная нагрузка, источник: {self.source}"

    def load(self, exercise_id: str) -> dict[str, float]:
        return self.loads[exercise_id]

    def meta(self) -> dict:
        return {"source": self.source, "is_placeholder": self.is_placeholder, "label_ru": self.label, "is_hybrid": self.is_hybrid, "domain_sources": self.domain_sources or None,
                "model_version": self.model_version, "atlas": self.atlas,
                "domains": list(self.domains), "domain_notes": self.domain_notes}


class MatrixLoader(Protocol):
    def load(self) -> LoadMatrix: ...


class JsonMatrixLoader:
    """Reads the JSON format written by scripts/build_placeholder_matrix.py (or the future offline job)."""

    def __init__(self, path: str | Path | None = None):
        self.path = Path(path or os.environ.get("ES_LOAD_MATRIX") or DATA / "load_matrix.placeholder.json")

    def load(self) -> LoadMatrix:
        raw = json.loads(self.path.read_text())
        domains = tuple(raw["domains"])
        if set(domains) != set(DOMAINS):
            raise ValueError(f"matrix domains must be {DOMAINS}, got {domains}")
        loads = {}
        for ex_id, row in raw["loads"].items():
            if set(row) != set(domains):
                raise ValueError(f"{ex_id}: missing domains")
            if any(not 0.0 <= float(v) <= 1.0 for v in row.values()):
                raise ValueError(f"{ex_id}: loads must be within 0..1")
            loads[ex_id] = {d: float(row[d]) for d in domains}
        return LoadMatrix(raw["source"], domains, loads, raw.get("model_version"), raw.get("atlas"),
                          raw.get("domain_notes", {}), raw.get("label_ru"),
                          (raw.get("metadata") or {}).get("domain_sources") or {},
                          (raw.get("metadata") or {}).get("tribe_raw_loads") or {})


# Exercises that have a screen in the web app (MVP): three speech measures and two non-speech tasks
# (the two that most often land in the program of demo-bypass-b).
PLAYABLE = frozenset({"picture_description", "naming_fluency", "story_retell",
                      "spatial_sequence_recall", "delayed_picture_recognition"})


def load_exercises() -> list[Exercise]:
    raw = json.loads((DATA / "exercises.json").read_text())
    return [Exercise(**e) for e in raw["exercises"]]


def get_matrix() -> LoadMatrix:
    return JsonMatrixLoader().load()
