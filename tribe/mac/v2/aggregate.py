"""Aggregate v2 predictions (features-v2/<mod>/<id>.npy) into the 5-domain matrix. Same method as mac/aggregate.py:
per modality: mean predicted response over domain vertices (first 5 TRs dropped) -> z across the stimuli that have the modality ->
clip [-2,2] -> (z+2)/4; modalities of one exercise averaged. Also writes work/v2_detail.json (raw per-modality values, incl. Yeo visual network
as a diagnostic, not a matrix domain).
usage: aggregate.py <out.json> <mod> [<mod>...]"""
import json, sys
from pathlib import Path
import numpy as np
from scipy.stats import rankdata
ROOT = Path(__file__).resolve().parents[2]
out_path, mods = Path(sys.argv[1]), sys.argv[2:]
man = json.load(open(ROOT/"stimuli-v2"/"manifest.json")); masks = dict(np.load(ROOT/"mac"/"work"/"masks_v2.npz"))
DOM = ["episodic_memory", "word_access", "phrase_building", "attention", "processing_speed"]; BR = DOM[:4]; DIAG = ["visual_net", "somatomotor_net"]; DROP = 5
zs = lambda x: (np.asarray(x, float) - np.mean(x)) / (np.std(x) or 1.0)
per_mod, computed, raw_all = {}, {}, {}
for mod in mods:
    ids = [e for e in man if (ROOT/"features-v2"/mod/f"{e}.npy").exists()]; raw = {d: [] for d in BR + DIAG}
    for e in ids:
        p = np.load(ROOT/"features-v2"/mod/f"{e}.npy").astype(np.float32); p = p[DROP:] if len(p) > DROP + 1 else p[-2:]
        for d in raw: raw[d].append(float(p[:, masks[d]].mean()))
    per_mod[mod] = {d: dict(zip(ids, (np.clip(zs(v), -2, 2) + 2) / 4)) for d, v in raw.items()}
    raw_all[mod] = {d: dict(zip(ids, v)) for d, v in raw.items()}; computed[mod] = ids
allids = list(man)
tempo = np.array([man[e]["n_words"]/max(man[e]["speech_duration_s"], 1e-6) if man[e]["tone_events"] == 0 else man[e]["tone_events"]/max(man[e]["duration_s"], 1e-6) for e in allids])
tp = (rankdata(tempo) - 1)/(len(tempo) - 1); loads, comb = {}, {}
import os
RAWLEVEL = os.environ.get("AGG") == "rawlevel"  # sensitivity variant: average RAW domain means over the modalities, then z across 25 stimuli (keeps modality level differences)
if RAWLEVEL:
    rawavg = {d: {e: float(np.mean([raw_all[m][d][e] for m in mods if e in raw_all[m][d]])) for e in allids} for d in BR + DIAG}
    per_cmb = {"rawlevel": {d: dict(zip(allids, (np.clip(zs([rawavg[d][e] for e in allids]), -2, 2) + 2) / 4)) for d in BR + DIAG}}
for i, e in enumerate(allids):
    row = {}
    for d in BR + DIAG:
        vals = [(per_cmb if RAWLEVEL else per_mod)[m][d][e] for m in (per_cmb if RAWLEVEL else mods) if e in (per_cmb if RAWLEVEL else per_mod)[m][d]]
        if not vals: raise SystemExit(f"no value for {e}/{d}: {computed}")
        row[d] = float(np.mean(vals))
    comb[e] = dict(row); row["processing_speed"] = float(tp[i]); loads[e] = {d: round(row[d], 4) for d in DOM}
json.dump({"variant": "rawlevel" if RAWLEVEL else "z-per-modality", "per_modality_z01": {m: {d: v for d, v in per_mod[m].items()} for m in mods}, "raw": raw_all, "combined": comb}, open(ROOT/"mac"/"work"/("v2_detail_rawlevel.json" if RAWLEVEL else "v2_detail.json"), "w"), indent=1)
used = {e: [m for m in mods if e in computed[m]] for e in allids}
mat = {"source": "TRIBE v2 predicted load",
 "label_ru": "Предсказанная нагрузка TRIBE v2 (полный прогон на Mac, английские стимулы, модальности: " + ", ".join(mods) + "). Не измерение мозга.",
 "model_version": "facebook/tribev2 best.ckpt (f894e78), cortex fsaverage5 only; run on Mac M5 16 GB",
 "atlas": "Schaefer-2018 400 parcels / Yeo 7 networks (volumetric, vol_to_surf) + Destrieux surface atlas, fsaverage5", "domains": DOM,
 "domain_notes": {
   "episodic_memory": "low reliability: Yeo Default network + parahippocampal/precuneus/posterior cingulate cortex; no hippocampus (public checkpoint outputs cortex only); passive perception, not memory success",
   "word_access": "left IFG (triangular, orbital) + left lateral/superior temporal, middle temporal, temporal pole (Destrieux); perception, not production",
   "phrase_building": "left IFG (opercular, triangular) + left superior/middle temporal + angular (Destrieux); overlaps with word_access",
   "attention": "Yeo Dorsal Attention + Ventral Attention + Frontoparietal control networks, both hemispheres",
   "processing_speed": "proxy of stimulus tempo (words/s of the spoken instruction or content, tone events/s, rank-scaled), not a brain-based value"},
 "metadata": {"modalities_computed": mods, "modalities_not_computed": [m for m in ("text", "audio", "video") if m not in mods],
   "modalities_per_exercise": used, "exercises_per_modality": {m: len(v) for m, v in computed.items()},
   "stimulus_language": "English (macOS say, voice Samantha), the training language of the model; stimuli 27-54 s",
   "stimuli": "speech tasks: examiner voice with the real task content (story lantern-keeper-en in full); picture tasks: the real pictures from es/web/public/pictures; visual and motor tasks: render of the real task course (PIL state machines, not final UI art) plus a short English instruction; word timings by faster-whisper small (real ASR)",
   "text_modality_scope": "only the 9 speech exercises (word_picture_matching text was dropped for time)",
   "video_modality_scope": "only the exercises with a screen course (visual, spatial, motor and picture tasks)",
   "model_weights_source": "facebook/tribev2 (Hugging Face); extractors Wav2Vec-BERT 2.0 (facebook/w2v-bert-2.0), Llama-3.2-3B (unsloth/Llama-3.2-3B mirror), V-JEPA 2 ViT-g (facebook/vjepa2-vitg-fpc64-256)",
   "method": "mean predicted response over domain vertices, first 5 s dropped, z across the stimuli of each modality, clip [-2,2], (z+2)/4; modalities of one exercise averaged" + (" (variant rawlevel: raw domain means averaged over modalities first, then z across 25)" if RAWLEVEL else "") + ". Modality sets differ between exercises (see modalities_per_exercise)",
   "built_with": "Built with Llama (Llama-3.2-3B from the unsloth mirror, Llama 3.2 Community License)" if "text" in mods else None,
   "license": "TRIBE v2 CC BY-NC 4.0, non-commercial prototype; Meta FAIR, d'Ascoli et al. 2026 arXiv 2605.04326"},
 "loads": loads}
out_path.parent.mkdir(exist_ok=True); out_path.write_text(json.dumps(mat, ensure_ascii=False, indent=1)); print("written", out_path, {m: len(v) for m, v in computed.items()})
