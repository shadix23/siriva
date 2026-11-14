"""Transcription with word timings behind one interface.

Default: local faster-whisper (works offline once the model is on disk; PyAV inside it decodes
webm/opus from the browser's MediaRecorder, no system ffmpeg needed).
Optional: Groq Whisper API, only when ES_TRANSCRIBER=groq (or =auto and GROQ_API_KEY is set).
The key is read from the environment only. Voice leaves the machine only in that mode.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Protocol

from .types import Transcript, Word, SUPPORTED_LANGUAGES

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_MODEL = "small"  # better Russian; ES_WHISPER_MODEL=base for speed (see README)


class Transcriber(Protocol):
    name: str

    def transcribe(self, path: str, language: str) -> Transcript: ...


class TranscriptionError(RuntimeError):
    """`code` is a short reason safe to show to the client; the full text stays in `str(e)` (server log only)."""

    def __init__(self, message: str, code: str = "failed"):
        super().__init__(message)
        self.code = code


class FasterWhisperTranscriber:
    """Local faster-whisper (int8, CPU).

    Decoding one 30 s window after another is dominated by per-step overhead on this hardware
    (about 30 s for 60 s of speech on an Apple M5). The batched pipeline decodes the windows together
    and takes about 4-6 s for 60 s with the base model, so it is the default. ES_WHISPER_BATCH=0 turns it off.
    """
    name = "faster-whisper"

    def __init__(self, model_size: str | None = None, device: str = "cpu", compute_type: str = "int8",
                 cpu_threads: int | None = None, batch_size: int | None = None, beam_size: int | None = None):
        self.model_size = model_size or os.environ.get("ES_WHISPER_MODEL", DEFAULT_MODEL)
        self.device, self.compute_type = device, compute_type
        self.cpu_threads = cpu_threads if cpu_threads is not None else int(os.environ.get("ES_WHISPER_THREADS", "4"))
        self.batch_size = batch_size if batch_size is not None else int(os.environ.get("ES_WHISPER_BATCH", "8"))
        self.beam_size = beam_size if beam_size is not None else int(os.environ.get("ES_WHISPER_BEAM", "1"))
        self._model = None
        self._pipeline = None
        self._warm = False
        self.state = "cold"      # cold -> warming -> ready | error
        self.error: str | None = None

    def ready(self) -> bool:
        """True only after warm-up: the model is loaded and has decoded once (the first call is slow)."""
        return self._warm

    def warmup(self) -> None:
        self.state = "warming"
        try:
            import numpy as np
            self._load()
            data = Path(__file__).parent / "data"
            for lang in ("ru", "en"):  # real short speech, so the decoder really runs (noise would be skipped by VAD)
                pcm = np.frombuffer((data / f"warmup_{lang}.pcm").read_bytes(), dtype="int16")
                self._run(pcm.astype("float32") / 32768.0, lang)
            self._warm, self.state = True, "ready"
        except Exception as e:
            self.state, self.error = "error", str(e)
            raise TranscriptionError(f"warm-up failed: {e}", "warmup_failed") from e

    def _load(self):
        if self._model is None:
            from faster_whisper import WhisperModel
            MODELS_DIR.mkdir(exist_ok=True)
            try:
                self._model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type,
                                           cpu_threads=self.cpu_threads, download_root=str(MODELS_DIR))
            except Exception as e:  # no model on disk and no network
                raise TranscriptionError(f"whisper model {self.model_size!r} is not available: {e}", "model_unavailable") from e
            if self.batch_size > 1:
                from faster_whisper import BatchedInferencePipeline
                self._pipeline = BatchedInferencePipeline(model=self._model)
        return self._model

    def _run(self, audio, language: str):
        model = self._load()
        if self._pipeline is not None:
            segments, info = self._pipeline.transcribe(audio, language=language, word_timestamps=True,
                                                       batch_size=self.batch_size, beam_size=self.beam_size)
        else:
            segments, info = model.transcribe(audio, language=language, word_timestamps=True, vad_filter=False,
                                              beam_size=self.beam_size, condition_on_previous_text=False)
        words = [Word(w.word.strip(), float(w.start), float(w.end))
                 for seg in segments for w in (seg.words or []) if w.word.strip()]
        return words, info

    def transcribe(self, path: str, language: str) -> Transcript:
        try:
            from faster_whisper.audio import decode_audio
            audio = decode_audio(path, sampling_rate=16000)
            words, info = self._run(audio, language)
        except TranscriptionError:
            raise
        except Exception as e:
            raise TranscriptionError(f"cannot decode or transcribe audio: {e}", "decode_failed") from e
        return Transcript(words=words, language=language, duration=float(info.duration),
                          engine=f"faster-whisper:{self.model_size}")


class GroqTranscriber:
    name = "groq"
    URL = "https://api.groq.com/openai/v1/audio/transcriptions"

    def __init__(self, api_key: str | None = None, model: str = "whisper-large-v3-turbo", client=None):
        self.api_key = api_key or os.environ.get("GROQ_API_KEY")
        if not self.api_key:
            raise TranscriptionError("GROQ_API_KEY is not set", "no_api_key")
        self.model = model
        self._client = client  # httpx.Client, injectable for tests

    def ready(self) -> bool:
        return bool(self.api_key)  # reachability of the network is not checked

    def transcribe(self, path: str, language: str) -> Transcript:
        import httpx
        client = self._client or httpx.Client(timeout=60)
        with open(path, "rb") as f:
            resp = client.post(
                self.URL, headers={"Authorization": f"Bearer {self.api_key}"},
                data={"model": self.model, "language": language, "response_format": "verbose_json",
                      "timestamp_granularities[]": "word"},
                files={"file": (Path(path).name, f)})
        if resp.status_code != 200:
            raise TranscriptionError(f"groq returned {resp.status_code}", "provider_error")
        d = resp.json()
        words = [Word(str(w["word"]).strip(), float(w["start"]), float(w["end"]))
                 for w in d.get("words", []) if str(w["word"]).strip()]
        return Transcript(words=words, language=language, duration=d.get("duration"),
                          text=d.get("text", "").strip(), engine=f"groq:{self.model}")


def get_transcriber() -> Transcriber:
    mode = os.environ.get("ES_TRANSCRIBER", "local").lower()
    if mode == "groq" or (mode == "auto" and os.environ.get("GROQ_API_KEY")):
        return GroqTranscriber()
    return FasterWhisperTranscriber()


def check_language(lang: str) -> None:
    if lang not in SUPPORTED_LANGUAGES:
        raise ValueError(lang)
