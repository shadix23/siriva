"""Writes es_core/data/warmup_{ru,en}.pcm (raw int16, 16 kHz mono, ~3 s of speech from macOS `say`) used to warm the model.
(raw .pcm rather than .wav because *.wav is git-ignored in es/.gitignore.)"""
import subprocess
import tempfile
from pathlib import Path

import av
import numpy as np

out = Path(__file__).resolve().parent.parent / "es_core" / "data"
for lang, voice, text in (("en", "Samantha", "The woman is standing at the sink and the water is running."),
                          ("ru", "Milena", "Женщина стоит у раковины, и вода льётся через край.")):
    aiff = Path(tempfile.mkdtemp()) / "w.aiff"
    subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
    rs = av.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    for frame in av.open(str(aiff)).decode(audio=0):
        for rf in rs.resample(frame):
            chunks.append(rf.to_ndarray().reshape(-1))
    pcm = np.concatenate(chunks).astype("int16")
    (out / f"warmup_{lang}.pcm").write_bytes(pcm.tobytes())
    print(lang, len(pcm) / 16000, "s")
