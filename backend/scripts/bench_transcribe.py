"""Benchmark of faster-whisper (int8, CPU) on 60 and 90 s of speech, ru and en, webm/opus like MediaRecorder.

Run: PYTHONPATH=. .venv/bin/python scripts/bench_transcribe.py [base small ...]
Audio comes from macOS `say`. Prints load time, warm-up (first call) and steady time per clip.
"""
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import av

from es_core.transcribe import FasterWhisperTranscriber

TEXT = {
    "en": ("The woman is standing at the sink and the water is running over the edge. The boy is on a stool "
           "reaching for the cookie jar while his sister waits with her hand out. A dog sits by the window and "
           "the curtains move in the wind. Outside a man is watering the flowers with a green hose. ") * 8,
    "ru": ("Женщина стоит у раковины, и вода льётся через край. Мальчик стоит на стуле и тянется к банке с "
           "печеньем, а его сестра ждёт с протянутой рукой. Собака сидит у окна, и занавески колышет ветер. "
           "На улице мужчина поливает цветы из зелёного шланга. ") * 8,
}
VOICE = {"en": "Samantha", "ru": "Milena"}


def make_webm(lang: str, seconds: int, tmp: Path) -> Path:
    aiff = tmp / f"{lang}.aiff"
    if not aiff.exists():
        subprocess.run(["say", "-v", VOICE[lang], "-o", str(aiff), TEXT[lang]], check=True)
    out_path = tmp / f"{lang}_{seconds}.webm"
    inp = av.open(str(aiff))
    out = av.open(str(out_path), "w", format="webm")
    st = out.add_stream("libopus", rate=48000)
    rs = av.AudioResampler(format="s16", layout="mono", rate=48000)
    done = 0.0
    for frame in inp.decode(audio=0):
        for rf in rs.resample(frame):
            done += rf.samples / 48000
            for pkt in st.encode(rf):
                out.mux(pkt)
        if done >= seconds:
            break
    for pkt in st.encode(None):
        out.mux(pkt)
    out.close()
    return out_path


if __name__ == "__main__":
    models = sys.argv[1:] or ["base", "small"]
    tmp = Path(tempfile.mkdtemp())
    clips = {(l, s): make_webm(l, s, tmp) for l in ("ru", "en") for s in (60, 90)}
    for m in models:
        t = time.time()
        tr = FasterWhisperTranscriber(m)
        tr._load()
        print(f"[{m}] load {time.time() - t:.1f}s", flush=True)
        t = time.time()
        tr.warmup()
        print(f"[{m}] warm-up {time.time() - t:.1f}s", flush=True)
        for (l, s), p in clips.items():
            t = time.time()
            r = tr.transcribe(str(p), l)
            print(f"[{m}] {l} {s}s audio -> {time.time() - t:.1f}s, words={len(r.words)}, "
                  f"head: {' '.join(w.text for w in r.words[:8])}", flush=True)
