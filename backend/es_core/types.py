from __future__ import annotations

from dataclasses import dataclass, field, asdict
from typing import Any

SUPPORTED_LANGUAGES = ("en", "ru")
DOMAINS = (
    "episodic_memory",
    "word_access",
    "phrase_building",
    "attention",
    "processing_speed",
)


@dataclass(frozen=True)
class Word:
    text: str
    start: float  # seconds from the start of the exercise audio
    end: float

    def to_dict(self) -> dict[str, Any]:
        return {"text": self.text, "start": round(self.start, 3), "end": round(self.end, 3)}


@dataclass
class Transcript:
    words: list[Word]
    language: str
    duration: float | None = None  # total audio length, seconds (None: unknown)
    text: str = ""
    engine: str = "unknown"
    meta: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not self.text:
            self.text = " ".join(w.text for w in self.words)

    def to_dict(self) -> dict[str, Any]:
        return {
            "text": self.text,
            "language": self.language,
            "duration": self.duration,
            "engine": self.engine,
            "words": [w.to_dict() for w in self.words],
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Transcript":
        words = [Word(str(w["text"]), float(w["start"]), float(w["end"])) for w in d.get("words", [])]
        return cls(
            words=words,
            language=d.get("language", "en"),
            duration=d.get("duration"),
            text=d.get("text", ""),
            engine=d.get("engine", "fixture"),
        )
