"""Video modality v2: V-JEPA 2 ViT-g (facebook/vjepa2-vitg-fpc64-256) -> TRIBE v2, on MPS in bf16 (device patched here).
usage: run_video.py [ids...]; env: TRIBE_VID_DIR (stimuli-v2/video), TRIBE_FEAT_DIR (features-v2/video), TRIBE_VID_DEV (mps),
TRIBE_VID_FREQ (feature frequency Hz, default 2), TRIBE_VID_FRAMES (frames per 4 s clip, default model's 64), TRIBE_VID_MAXIM (max image side)"""
import sys, os, time, json, gc
from pathlib import Path
import numpy as np, pandas as pd, torch
ROOT = Path(__file__).resolve().parents[2]
os.environ["PATH"] = str(ROOT/"mac"/"bin") + os.pathsep + os.environ["PATH"]
from tribev2.demo_utils import TribeModel, get_audio_and_text_events
import neuralset.extractors.video as nv
dev = os.environ.get("TRIBE_VID_DEV", "mps"); dt = torch.bfloat16 if os.environ.get("TRIBE_VID_DTYPE", "bf16") == "bf16" else torch.float16
_init = nv._HFVideoModel.__init__
def _init2(self, *a, **k):
    _init(self, *a, **k)
    self.model.to(dev, dtype=dt); self.model.to = lambda *aa, **kk: self.model  # keep on device
nv._HFVideoModel.__init__ = _init2
vdir = Path(os.environ.get("TRIBE_VID_DIR", ROOT/"stimuli-v2"/"video"))
ids = sys.argv[1:] or sorted(p.stem for p in vdir.glob("*.mp4"))
vid = {"image.device": "cpu"}
cfg = {"data.features_to_use": ["video"], "data.num_workers": 0, "data.batch_size": 1,
       "data.video_feature.image.device": "cpu", "data.video_feature.frequency": float(os.environ.get("TRIBE_VID_FREQ", "2")),
       "data.audio_feature.device": "cpu", "data.text_feature.device": "cpu"}
if os.environ.get("TRIBE_VID_FRAMES"): cfg["data.video_feature.num_frames"] = int(os.environ["TRIBE_VID_FRAMES"])
if os.environ.get("TRIBE_VID_MAXIM"): cfg["data.video_feature.max_imsize"] = int(os.environ["TRIBE_VID_MAXIM"])
cache = os.environ.get("TRIBE_VID_CACHE", str(ROOT/"cache"/"video-v2"))
m = TribeModel.from_pretrained(str(ROOT/"weights"/"tribev2"), cache_folder=cache, device="mps", config_update=cfg)
out = Path(os.environ.get("TRIBE_FEAT_DIR", ROOT/"features-v2"/"video")); out.mkdir(parents=True, exist_ok=True)
for ex in ids:
    if (out/f"{ex}.npy").exists(): continue
    t0 = time.time()
    ev = pd.DataFrame([{"type": "Video", "filepath": str(vdir/f"{ex}.mp4"), "start": 0, "timeline": "default", "subject": "default"}])
    ev = get_audio_and_text_events(ev, audio_only=True)
    p, seg = m.predict(ev, verbose=False)
    print(ex, p.shape, "nan" if not np.isfinite(p).all() else "finite", f"{time.time()-t0:.0f}s", flush=True)
    np.save(out/f"{ex}.npy", p.astype(np.float16)); gc.collect(); torch.mps.empty_cache()
