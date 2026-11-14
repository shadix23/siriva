"""Aggregate cached TRIBE predictions into the 5-domain load matrix.
usage: aggregate.py <out.json> <modality> [<modality> ...]
Per modality: mean predicted response (TRs after the first 5 dropped) over vertices of the domain mask -> z across the
stimuli -> clip to [-2,2] -> (z+2)/4 in 0..1. With several modalities the per-modality values are averaged.
processing_speed is NOT a brain value: rank-scaled stimulus tempo proxy (words/s of speech, tone events/s)."""
import json, sys
from pathlib import Path
import numpy as np
from scipy.stats import rankdata
ROOT = Path(__file__).resolve().parents[1]
out_path, mods = Path(sys.argv[1]), sys.argv[2:]
man = json.load(open(ROOT/"stimuli"/"manifest.json"))
masks = dict(np.load(ROOT/"mac"/"work"/"masks.npz"))
DOM = ["episodic_memory", "word_access", "phrase_building", "attention", "processing_speed"]
BR = [d for d in DOM if d != "processing_speed"]
DROP = 5
def zs(x): x = np.asarray(x, float); return (x - x.mean()) / (x.std() or 1.0)
per_mod, computed = {}, {}
for mod in mods:
    ids = [e for e in man if (ROOT/"features"/mod/f"{e}.npy").exists()]
    raw = {d: [] for d in BR}; used = []
    for e in ids:
        p = np.load(ROOT/"features"/mod/f"{e}.npy").astype(np.float32)
        p = p[DROP:] if len(p) > DROP + 1 else p[-2:]
        for d in BR: raw[d].append(float(p[:, masks[d]].mean()))
    per_mod[mod] = {d: dict(zip(ids, (np.clip(zs(v), -2, 2) + 2) / 4)) for d, v in raw.items()}
    computed[mod] = ids
allids = list(man)
tempo = np.array([(man[e]["n_words"]/max(man[e]["speech_duration_s"], 1e-6)) if man[e]["tone_events"] == 0
                  else man[e]["tone_events"]/max(man[e]["duration_s"], 1e-6) for e in allids])
tp = (rankdata(tempo) - 1) / (len(tempo) - 1)
loads = {}
for i, e in enumerate(allids):
    row = {}
    for d in BR:
        vals = [per_mod[m][d][e] for m in mods if e in per_mod[m][d]]
        if not vals: raise SystemExit(f"no value for {e}/{d}: incomplete modalities {computed}")
        row[d] = round(float(np.mean(vals)), 4)
    row["processing_speed"] = round(float(tp[i]), 4)
    loads[e] = {d: row[d] for d in DOM}
meta_mod = {"audio": "audio (Wav2Vec-BERT 2.0 -> TRIBE v2), stimulus = Russian voice-over (macOS say) of the instruction and spoken material; tone sequences for auditory tasks",
            "text": "text (Llama-3.2-3B, unsloth mirror -> TRIBE v2), stimulus = words with approximate timings (proportional to characters)",
            "video": "video (V-JEPA 2 -> TRIBE v2)"}
mat = {"source": "TRIBE v2 predicted load",
 "label_ru": "Предсказанная нагрузка TRIBE v2 (запасной прогон на Mac, модальности: " + ", ".join(mods) + "). Не измерение мозга.",
 "model_version": "facebook/tribev2 best.ckpt (f894e78), cortex fsaverage5 only; run on Mac M5 16 GB",
 "atlas": "Schaefer-2018 400 parcels / Yeo 7 networks (volumetric, vol_to_surf) + Destrieux surface atlas, fsaverage5",
 "domains": DOM,
 "domain_notes": {
   "episodic_memory": "low reliability: Yeo Default network + parahippocampal/precuneus/posterior cingulate cortex; no hippocampus (public checkpoint outputs cortex only); model is passive perception, not memory success",
   "word_access": "left IFG (triangular, orbital) + left lateral/superior temporal, middle temporal, temporal pole (Destrieux); perception of speech, not production",
   "phrase_building": "left IFG (opercular, triangular) + left superior/middle temporal + angular (Destrieux); overlaps with word_access",
   "attention": "Yeo Dorsal Attention + Ventral Attention + Frontoparietal control networks, both hemispheres",
   "processing_speed": "proxy of stimulus tempo (words/s or tone events/s, rank-scaled), not a brain-based value"},
 "metadata": {
   "modalities_computed": mods, "modalities_not_computed": [m for m in ("text", "audio", "video") if m not in mods],
   "modality_details": {m: meta_mod[m] for m in mods}, "exercises_per_modality": {m: len(v) for m, v in computed.items()},
   "visual_only_exercises_note": "exercises whose task is visual/motor have only a voice-over of the instruction as stimulus; their values describe the instruction, not the task" if "video" not in mods else "",
   "method": "mean predicted response over domain vertices, first 5 s dropped, z across 25 stimuli, clip [-2,2], (z+2)/4; modalities averaged",
   "built_with": "Built with Llama (weights from unsloth/Llama-3.2-3B mirror, Llama 3.2 Community License)" if "text" in mods else None,
   "license": "TRIBE v2 CC BY-NC 4.0, non-commercial prototype; Meta FAIR, d'Ascoli et al. 2026 arXiv 2605.04326"},
 "loads": loads}
out_path.parent.mkdir(exist_ok=True); out_path.write_text(json.dumps(mat, ensure_ascii=False, indent=1))
print("written", out_path, computed)
