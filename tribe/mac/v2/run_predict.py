"""TRIBE v2 prediction on Mac (MPS). usage: run_predict.py <modality: audio|text|video> [ids...]
Saves per-exercise predictions (T x 20484, float16) to features/<modality>/<id>.npy. Other modalities are masked
(features_to_use=[modality]) so the model sees only that modality (missing ones are zeros in training too)."""
import sys, os, time, json, gc
from pathlib import Path
import numpy as np, pandas as pd, torch
ROOT = Path(__file__).resolve().parents[2]
os.environ["PATH"] = str(ROOT/"mac"/"bin") + os.pathsep + os.environ["PATH"]
from tribev2.demo_utils import TribeModel, get_audio_and_text_events
mod = sys.argv[1]; ids = sys.argv[2:] or list(json.load(open(ROOT/"stimuli-v2"/"manifest.json")))
dev = os.environ.get("TRIBE_DEVICE", "mps")
cfg = {"data.features_to_use": [mod], "data.num_workers": 0, "data.batch_size": 1,
       **{f"data.{m}_feature.device": "cpu" for m in ("text", "audio")},
       "data.video_feature.image.device": "cpu"}
m = TribeModel.from_pretrained(str(ROOT/"weights"/"tribev2"), cache_folder=str(ROOT/"cache"/mod), device=dev, config_update=cfg)
out = ROOT/"features-v2"/mod; out.mkdir(parents=True, exist_ok=True)
man = json.load(open(ROOT/"stimuli-v2"/"manifest.json"))
for ex in ids:
    if (out/f"{ex}.npy").exists(): continue
    t0 = time.time()
    if mod == "audio":
        ev = pd.DataFrame([{"type": "Audio", "filepath": str(ROOT/"stimuli-v2"/"audio"/f"{ex}.wav"), "start": 0, "timeline": "default", "subject": "default"}])
        ev = get_audio_and_text_events(ev, audio_only=True)
    elif mod == "video":
        ev = pd.DataFrame([{"type": "Video", "filepath": str(ROOT/"stimuli-v2"/"video"/f"{ex}.mp4"), "start": 0, "timeline": "default", "subject": "default"}])
        ev = get_audio_and_text_events(ev, audio_only=True)
    else:
        raise SystemExit("text path: see run_text.py")
    p, seg = m.predict(ev, verbose=False)
    np.save(out/f"{ex}.npy", p.astype(np.float16))
    print(ex, p.shape, f"{time.time()-t0:.0f}s", flush=True)
    gc.collect(); torch.mps.empty_cache() if dev == "mps" else None
