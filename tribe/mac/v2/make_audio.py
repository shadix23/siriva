"""stimuli-v2 audio: macOS say Samantha (en_US) -> 16 kHz wav; real word timings by faster-whisper small (word_timestamps).
Run with the BACKEND python: ./backend/.venv/bin/python make_audio.py"""
import json, subprocess, wave, re, sys
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from stimuli_en import S, TEXT_IDS
ROOT = Path("./tribe"); FF = str(ROOT/"mac"/"bin"/"ffmpeg")
A = ROOT/"stimuli-v2"/"audio"; A.mkdir(parents=True, exist_ok=True); SR = 16000; TARGET = 42.0
def tone(f, d):
    n = int(SR*d); x = np.sin(2*np.pi*f*np.arange(n)/SR)*0.4; r = min(n//4, 200); x[:r] *= np.linspace(0,1,r); x[-r:] *= np.linspace(1,0,r); return x
sil = lambda d: np.zeros(int(SR*d))
def tonepart(ex):
    parts = []; ev = 0
    if ex == "rhythm_copy":
        for _ in range(4):
            for d in [0.25,0.25,0.5,0.25,0.5,0.25]: parts += [tone(660,0.12), sil(d)]; ev += 1
            parts.append(sil(1.2))
    elif ex == "sustained_tone_detection":
        for i in range(30): parts += [tone(880 if i in (7,17,26) else 700, 0.3), sil(0.9)]; ev += 1
    else:
        for f0, f1 in [(400,900),(900,400),(600,600),(300,1200),(1000,500),(500,500)]:
            n=int(SR*0.8); f=np.linspace(f0,f1,n); parts += [np.sin(2*np.pi*np.cumsum(f)/SR)*0.4, sil(2.5)]; ev += 1
    return np.concatenate(parts), ev
def rd(p):
    with wave.open(str(p)) as w: return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)/32768
def wr(p, x):
    with wave.open(str(p), "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((np.clip(x,-1,1)*32767).astype(np.int16).tobytes())
from faster_whisper import WhisperModel
wm = WhisperModel("small", device="cpu", compute_type="int8", download_root="./backend/models")
rng = np.random.default_rng(0); man = {}
for ex, (kind, text) in S.items():
    aiff, wav = A/f"{ex}.aiff", A/f"{ex}.wav"
    rates = [170] if kind != "speech" else [160, 150, 140, 130, 125, 120]
    for rate in rates:  # slow the examiner voice and add response pauses until the clip is >= 40 s
        t_say = re.sub(r"\. ", ". [[slnc 700]] ", text) if (kind == "speech" and ex != "story_retell" and rate < 160) else text
        subprocess.run(["say", "-v", "Samantha", "-r", str(rate), "-o", str(aiff), t_say], check=True)
        subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(aiff), "-ar", str(SR), "-ac", "1", str(wav)], check=True); aiff.unlink()
        if kind != "speech" or len(rd(wav))/SR >= 40: break
    sp = rd(wav); speech_dur = len(sp)/SR; ev = 0
    if kind == "speech": full = sp
    else:
        full = np.concatenate([sp, sil(0.5)])
        if kind == "tones": t, ev = tonepart(ex); full = np.concatenate([full, t])
        full = np.concatenate([full, sil(max(0, TARGET - len(full)/SR))])
    full = full + rng.normal(0, 1e-4, len(full))  # near-silence floor, avoids all-zero input
    wr(wav, full); dur = len(full)/SR
    entry = {"kind": kind, "say_rate_wpm": rate, "duration_s": round(dur,1), "speech_duration_s": round(speech_dur,1), "tone_events": ev, "text": text,
             "modalities": ["audio"] + (["text"] if ex in TEXT_IDS else [])}
    if ex in TEXT_IDS:
        segs, _ = wm.transcribe(str(wav), language="en", word_timestamps=True, beam_size=1)
        ws = [{"word": w.word.strip(), "start": round(w.start,2), "end": round(w.end,2)} for s in segs for w in s.words if w.word.strip()]
        entry["words_asr_timing"] = ws; entry["n_words"] = len(ws)
        entry["timing"] = "faster-whisper small word_timestamps (real); the text sent to Llama is the ASR transcript"
    else: entry["n_words"] = len(re.findall(r"\w+", text))
    man[ex] = entry; print(ex, kind, round(dur,1), entry["n_words"], flush=True)
(ROOT/"stimuli-v2"/"manifest.json").write_text(json.dumps(man, ensure_ascii=False, indent=1))
