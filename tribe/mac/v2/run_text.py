"""Text modality v2: Word events with REAL (faster-whisper) timings from stimuli-v2/manifest.json, Llama-3.2-3B (unsloth mirror) in bf16.
usage: TRIBE_TEXT_DEV=mps|cpu run_text.py [ids...]   env TRIBE_FEAT_DIR (default features-v2/text), TRIBE_MAX_WORDS (test excerpt)
Device is patched from here (neuralset only allows auto/cpu/cuda/accelerate): model loaded in bf16 and moved to MPS, inputs redirected to MPS."""
import sys, os, json, time, gc
from pathlib import Path
import numpy as np, pandas as pd, torch
ROOT = Path(__file__).resolve().parents[2]
os.environ["PATH"] = str(ROOT/"mac"/"bin") + os.pathsep + os.environ["PATH"]
from tribev2.demo_utils import TribeModel
from neuralset.events.utils import standardize_events
from neuralset.events.transforms import AddText, AddSentenceToWords, AddContextToWords, RemoveMissing
from transformers import AutoModel
from transformers.tokenization_utils_base import BatchEncoding
dev = os.environ.get("TRIBE_TEXT_DEV", "mps")
_orig = AutoModel.from_pretrained.__func__
def _load(cls, *a, **k):
    mdl = _orig(cls, *a, dtype=torch.bfloat16, attn_implementation=os.environ.get("TRIBE_ATTN", "eager"), **k).to(dev)
    mdl.to = lambda *aa, **kk: mdl  # neuralset calls model.to('cpu') afterwards: keep the model on the chosen device
    return mdl
AutoModel.from_pretrained = classmethod(_load)
_to = BatchEncoding.to
BatchEncoding.to = lambda self, d, *a, **k: _to(self, dev, *a, **k)
man = json.load(open(ROOT/"stimuli-v2"/"manifest.json"))
ids = sys.argv[1:] or [e for e in man if "text" in man[e]["modalities"]]
maxw = int(os.environ.get("TRIBE_MAX_WORDS", "0"))
cfg = {"data.features_to_use": ["text"], "data.num_workers": 0, "data.batch_size": 1,
       "data.text_feature.model_name": "unsloth/Llama-3.2-3B", "data.text_feature.device": "cpu",
       "data.audio_feature.device": "cpu", "data.video_feature.image.device": "cpu"}
cache = os.environ.get("TRIBE_TEXT_CACHE", str(ROOT/"cache"/"text-v2"))
m = TribeModel.from_pretrained(str(ROOT/"weights"/"tribev2"), cache_folder=cache, device="mps", config_update=cfg)
out = Path(os.environ.get("TRIBE_FEAT_DIR", ROOT/"features-v2"/"text")); out.mkdir(parents=True, exist_ok=True)
for ex in ids:
    if (out/f"{ex}.npy").exists(): continue
    t0 = time.time(); ws = man[ex]["words_asr_timing"][: maxw or None]
    rows = [{"type": "Word", "text": w["word"], "start": w["start"], "duration": max(w["end"] - w["start"], 0.05),
             "timeline": "default", "subject": "default"} for w in ws]
    ev = standardize_events(pd.DataFrame(rows))
    for tr in [AddText(), AddSentenceToWords(max_unmatched_ratio=0.05), AddContextToWords(sentence_only=False, max_context_len=1024, split_field=""), RemoveMissing()]:
        ev = tr(ev)
    ev = standardize_events(ev)
    p, seg = m.predict(ev, verbose=False)
    print(ex, p.shape, "nan" if not np.isfinite(p).all() else "finite", f"{time.time()-t0:.0f}s", flush=True)
    np.save(out/f"{ex}.npy", p.astype(np.float16)); gc.collect()
