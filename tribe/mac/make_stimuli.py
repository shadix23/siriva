"""Offline stimuli: macOS `say` (Milena, ru_RU) -> wav via ffmpeg (imageio-ffmpeg); tone sequences by numpy.
Writes stimuli/audio/<id>.wav and stimuli/manifest.json. Word timings are APPROXIMATE (proportional to characters)."""
import json, subprocess, sys, wave, re
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).parent))
from stimuli_data import S
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
ROOT = Path(__file__).resolve().parents[1]
A = ROOT / "stimuli" / "audio"; A.mkdir(parents=True, exist_ok=True)
SR = 16000

def tones(kind_id):
    t = lambda f, d: np.sin(2*np.pi*f*np.arange(int(SR*d))/SR) * 0.4 * np.minimum(1, np.minimum(np.arange(int(SR*d)), int(SR*d)[::-1] if False else 1e9)/200)
    def tone(f, d):
        n = int(SR*d); x = np.sin(2*np.pi*f*np.arange(n)/SR)*0.4
        r = min(n//4, 200); x[:r] *= np.linspace(0,1,r); x[-r:] *= np.linspace(1,0,r); return x
    sil = lambda d: np.zeros(int(SR*d))
    rng = np.random.default_rng(1); parts = []; ev = 0
    if kind_id == "rhythm_copy":
        for _ in range(3):
            for d in [0.25,0.25,0.5,0.25,0.5,0.25]: parts += [tone(660,0.12), sil(d)]; ev += 1
            parts.append(sil(1.0))
    elif kind_id == "sustained_tone_detection":
        for i in range(24): parts += [tone(880 if i in (7,17) else 700, 0.3), sil(0.9)]; ev += 1
    else:  # sound_to_picture: three familiar-ish synthetic sounds
        for f0, f1 in [(400,900),(900,400),(600,600)]:
            n=int(SR*0.8); f=np.linspace(f0,f1,n); parts += [np.sin(2*np.pi*np.cumsum(f)/SR)*0.4, sil(1.2)]; ev += 1
    return np.concatenate(parts), ev

manifest = {}
for ex, (kind, text) in S.items():
    aiff = A / f"{ex}.aiff"; wav = A / f"{ex}.wav"
    subprocess.run(["say", "-v", "Milena", "-r", "165", "-o", str(aiff), text], check=True)
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", str(aiff), "-ar", str(SR), "-ac", "1", str(wav)], check=True)
    aiff.unlink()
    with wave.open(str(wav)) as w: speech_dur = w.getnframes() / w.getframerate()
    words = re.findall(r"\w+", text); events = 0
    if kind == "tones":
        x, events = tones(ex)
        with wave.open(str(wav)) as w: sp = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)/32768
        full = np.concatenate([sp, np.zeros(SR//2), x])
        pcm = (full*32767).astype(np.int16)
        with wave.open(str(wav), "wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    with wave.open(str(wav)) as w: dur = w.getnframes() / w.getframerate()
    # approximate word timings: proportional to character count over the speech duration
    lens = np.array([len(x) for x in words], float); ends = np.cumsum(lens)/lens.sum()*speech_dur
    wt = [{"word": wd, "start": round(float(e - l/lens.sum()*speech_dur), 2), "end": round(float(e), 2)} for wd, l, e in zip(words, lens, ends)]
    manifest[ex] = {"kind": kind, "modalities": ["audio"] + (["text"] if kind == "speech" else []),
                    "duration_s": round(dur, 1), "speech_duration_s": round(speech_dur, 1), "n_words": len(words),
                    "tone_events": events, "text": text, "words_approx_timing": wt,
                    "how": "macOS say Milena ru_RU -> 16 kHz wav" + ("; synthetic tones by numpy" if kind == "tones" else "") +
                           ("; audio is voice-over of the instruction, the task itself is visual/motor and NOT in this stimulus" if kind == "instr" else "")}
    print(ex, round(dur, 1))
(ROOT/"stimuli"/"manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
