"""Research classifier on English transcripts: a DEMONSTRATION of the pipeline, not a result of ours.

Model: vjsyong/xlm-roberta-dementia_detection (Hugging Face, MIT, text, base xlm-roberta-base).
Facts from its card and config (checked 2026-11-14):
- classes id2label {0: NEGATIVE, 1: POSITIVE}; the card does not say what POSITIVE means. We read it as the
  "impairment pattern" class (assumption, not documented by the author);
- training data: "unknown dataset"; only a train accuracy 0.8958 is reported, validation loss 0.477 stays
  well above the train loss (overfitting signs); there is no test evaluation;
- weights are published for TensorFlow only (tf_model.h5): scripts/convert_research_classifier.py converts them
  once into a PyTorch checkpoint next to them (models/ is not in git);
- input: plain text (we pass the transcript of the picture description as it comes from ASR).
The score never enters the profile, the program, or the patient and family screens. Shown only on the demo
and jury screens with the disclaimers below. No claims about people's health are made from it.
TODO(ADReSS): replace with our own classifier when data access is granted (English only).
"""
from __future__ import annotations

import os
import threading
import time
from pathlib import Path

MODEL_ID = "vjsyong/xlm-roberta-dementia_detection"
LICENSE = "MIT"
MODEL_DISPLAY = "xlm-roberta (vjsyong), исследовательская модель"  # neutral name for screens; `model` is the technical HF id
LABEL_RU = "Исследовательская модель, точность не подтверждена. Не медицинское заключение"
REPORTED_RU = "заявлена только точность на обучающих данных 0,896, проверочной оценки нет"
CLASS_RU = {"pattern": "паттерн нарушений", "control": "контроль"}
ONLY_ENGLISH_RU = "Модель только для английской речи"
MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "research-classifier" / "vjsyong-xlm-roberta-dementia_detection"
MAX_TOKENS = 384
THRESHOLD = 0.5


def enabled() -> bool:
    return os.environ.get("ES_RESEARCH_CLASSIFIER", "1") != "0"


class ResearchClassifier:
    name = MODEL_ID

    def __init__(self, model_dir: str | Path | None = None):
        self.model_dir = Path(model_dir or os.environ.get("ES_RESEARCH_CLASSIFIER_DIR") or MODEL_DIR)
        self._tok = self._model = None
        self.state = "cold"           # cold -> warming -> ready | error
        self.error: str | None = None
        self._lock = threading.Lock()

    def ready(self) -> bool:
        return self.state == "ready"

    def _load(self):
        if self._model is None:
            import torch
            from transformers import AutoTokenizer, XLMRobertaForSequenceClassification
            torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))
            self._tok = AutoTokenizer.from_pretrained(str(self.model_dir))
            self._model = XLMRobertaForSequenceClassification.from_pretrained(str(self.model_dir)).eval()

    def warmup(self) -> None:
        self.state = "warming"
        try:
            self._load()
            self.score("The woman is standing at the sink and the water is running over.")
            self.state = "ready"
        except Exception as e:
            self.state, self.error = "error", f"{type(e).__name__}: {e}"[:300]
            raise

    def score(self, text: str) -> float:
        """Probability of class 1 ("POSITIVE", read as the impairment pattern class)."""
        import torch
        with self._lock:
            self._load()
            enc = self._tok(text, return_tensors="pt", truncation=True, max_length=MAX_TOKENS)
            with torch.no_grad():
                logits = self._model(**enc).logits[0]
            return float(torch.softmax(logits, dim=-1)[1])


def block(score: float, elapsed_ms: int | None = None, model: str = MODEL_ID) -> dict:
    cls = "pattern" if score >= THRESHOLD else "control"
    return {"model": model, "model_display": MODEL_DISPLAY, "license": LICENSE, "score": round(score, 3), "class_code": cls,
            "class_ru": CLASS_RU[cls], "label_ru": LABEL_RU, "reported": REPORTED_RU, "language": "en",
            "elapsed_ms": elapsed_ms}


def for_transcript(clf, text: str, language: str) -> dict:
    """Fields to merge into an /audio or /transcript response: {research_classifier, research_classifier_reason...}."""
    if language != "en":
        return {"research_classifier": None, "research_classifier_reason": "english_only",
                "research_classifier_reason_ru": ONLY_ENGLISH_RU}
    if clf is None or not enabled():
        return {"research_classifier": None, "research_classifier_reason": "disabled",
                "research_classifier_reason_ru": "Исследовательская модель выключена"}
    if not clf.ready():
        return {"research_classifier": None, "research_classifier_reason": "model_not_ready",
                "research_classifier_reason_ru": "Исследовательская модель ещё не готова"}
    try:
        t = time.time()
        s = clf.score(text)
        return {"research_classifier": block(s, int((time.time() - t) * 1000), getattr(clf, "name", MODEL_ID))}
    except Exception as e:
        print(f"[es] research classifier failed: {e}", flush=True)
        return {"research_classifier": None, "research_classifier_reason": "error",
                "research_classifier_reason_ru": "Исследовательская модель недоступна"}


def meta() -> dict:
    """Static metadata for /demo/numbers (no score)."""
    return {"model": MODEL_ID, "model_display": MODEL_DISPLAY, "license": LICENSE, "label_ru": LABEL_RU, "reported": REPORTED_RU,
            "language": "en", "role": "demo", "own_result": False}
