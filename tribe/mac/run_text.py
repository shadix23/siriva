"""Text modality: Word events from manifest (approximate timings), Llama-3.2-3B via open mirror unsloth/Llama-3.2-3B.
usage: run_text.py [ids...]   (TRIBE_TEXT_DEVICE=accelerate|cpu)"""
import sys, os, json, time, gc
from pathlib import Path
import numpy as np, pandas as pd, torch
ROOT = Path(__file__).resolve().parents[1]
os.environ["PATH"] = str(ROOT/"mac"/"bin") + os.pathsep + os.environ["PATH"]
from tribev2.demo_utils import TribeModel
from neuralset.events.utils import standardize_events
from neuralset.events.transforms import AddText, AddSentenceToWords, AddContextToWords, RemoveMissing
man = json.load(open(ROOT/"stimuli"/"manifest.json"))
ids = sys.argv[1:] or [e for e in man if "text" in man[e]["modalities"]]
tdev = os.environ.get("TRIBE_TEXT_DEVICE", "cpu")
if tdev == "cpu":  # Llama 3B in fp32 = 13 GB, too much for 16 GB shared; load it in bf16 on CPU (fp16 on MPS gave NaN)
    from transformers import AutoModel
    _orig = AutoModel.from_pretrained.__func__
    AutoModel.from_pretrained = classmethod(lambda cls, *a, **k: _orig(cls, *a, dtype=torch.bfloat16, **k))
cfg = {"data.features_to_use": ["text"], "data.num_workers": 0, "data.batch_size": 1,
       "data.text_feature.model_name": "unsloth/Llama-3.2-3B", "data.text_feature.device": tdev,
       "data.audio_feature.device": "cpu", "data.video_feature.image.device": "cpu"}
m = TribeModel.from_pretrained(str(ROOT/"weights"/"tribev2"), cache_folder=str(ROOT/"cache"/"text"), device="mps", config_update=cfg)
out = ROOT/"features"/"text"; out.mkdir(parents=True, exist_ok=True)
for ex in ids:
    if (out/f"{ex}.npy").exists(): continue
    t0 = time.time()
    rows = [{"type": "Word", "text": w["word"], "start": w["start"], "duration": max(w["end"] - w["start"], 0.05),
             "timeline": "default", "subject": "default"} for w in man[ex]["words_approx_timing"]]
    ev = standardize_events(pd.DataFrame(rows))
    for tr in [AddText(), AddSentenceToWords(max_unmatched_ratio=0.05), AddContextToWords(sentence_only=False, max_context_len=1024, split_field=""), RemoveMissing()]:
        ev = tr(ev)
    ev = standardize_events(ev)
    p, seg = m.predict(ev, verbose=False)
    np.save(out/f"{ex}.npy", p.astype(np.float16)); print(ex, p.shape, f"{time.time()-t0:.0f}s", flush=True)
    gc.collect()
