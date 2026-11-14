"""Manual end-to-end check: macOS `say` -> webm/opus (like MediaRecorder) -> API /audio -> features.

Needs the whisper model on disk (first run downloads it once, ES_WHISPER_MODEL=base by default).
Run: PYTHONPATH=. .venv/bin/python scripts/e2e_say.py [en|ru]
"""
import subprocess
import sys
import tempfile
from pathlib import Path

import av
from fastapi.testclient import TestClient

from es_api.main import create_app

LANG = sys.argv[1] if len(sys.argv) > 1 else "en"
TEXT = {"en": "The woman is standing at the sink and the water is running over. The boy is on a stool "
              "reaching for the cookie jar while his sister waits.",
        "ru": "Женщина стоит у раковины, и вода льётся через край. Мальчик стоит на стуле "
              "и тянется к банке с печеньем."}[LANG]
VOICE = {"en": "Samantha", "ru": "Milena"}[LANG]

tmp = Path(tempfile.mkdtemp())
aiff, webm = tmp / "s.aiff", tmp / "s.webm"
subprocess.run(["say", "-v", VOICE, "-o", str(aiff), TEXT], check=True)

# re-encode to webm/opus with PyAV (no ffmpeg binary needed)
inp = av.open(str(aiff))
out = av.open(str(webm), "w", format="webm")
ostream = out.add_stream("libopus", rate=48000)
resampler = av.AudioResampler(format="s16", layout="mono", rate=48000)
for frame in inp.decode(audio=0):
    for rf in resampler.resample(frame):
        for pkt in ostream.encode(rf):
            out.mux(pkt)
for pkt in ostream.encode(None):
    out.mux(pkt)
out.close()
print("webm bytes:", webm.stat().st_size)

c = TestClient(create_app(tmp / "e2e.sqlite3", seed_demo=False))
pid = c.post("/patients", json={"language": LANG, "consent_voice": True}).json()["id"]
sid = c.post(f"/patients/{pid}/sessions", json={}).json()["session_id"]
r = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
           files={"file": ("rec.webm", webm.read_bytes(), "audio/webm")}, data={"language": LANG})
print(r.status_code)
j = r.json()
print("engine:", j.get("engine"), "| text:", j.get("transcript", {}).get("text"))
print("first words:", j.get("transcript", {}).get("words", [])[:4])
print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in j.get("features", {}).items()})
