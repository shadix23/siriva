"""Export per-second TRIBE v2 predictions for the landing brain player.

Run: .venv-mac/bin/python viz/export_timeseries.py
Writes es/web/public/brain/timeseries/<id>.bin (uint8, frame after frame, 20484 vertices each, order as mesh.json)
and index.json (id, titles, frames, fps, zone curves, zone anchor vertices).

Method (same spirit as mac/v2/aggregate.py and viz/make_viz.py):
  per modality: drop the first 5 s, z per vertex against ALL frames of ALL stimuli that have the modality;
  modalities of one exercise averaged; clip [-2, 2]; value = (z + 2) / 4 * 255 (128 = average response).
Predictions are for English stimuli, average brain (fsaverage5), not a measurement of a person.
"""
import json
from pathlib import Path

import numpy as np

R = Path(__file__).resolve().parents[1]
OUT = R.parent / "web" / "public" / "brain" / "timeseries"
DROP, MAX_FRAMES, CLIP, NV = 5, 30, 2.0, 20484
SHOW = {
    "story_retell": ("Пересказ истории", "Story retell"),
    "picture_description": ("Описание картинки", "Picture description"),
    "naming_fluency": ("Слова по категории", "Naming fluency"),
    "spatial_sequence_recall": ("Последовательность на поле", "Spatial sequence"),
}
ids = list(json.load(open(R / "stimuli-v2" / "manifest.json")))


def load(mod, e):
    p = R / "features-v2" / mod / f"{e}.npy"
    return np.load(p).astype(np.float32)[DROP:] if p.exists() else None


# per-vertex mean/std over every frame of every stimulus, per modality
stats = {}
for mod in ("audio", "text"):
    frames = [a for a in (load(mod, e) for e in ids) if a is not None and len(a)]
    allf = np.concatenate(frames, 0)
    stats[mod] = (allf.mean(0), allf.std(0) + 1e-6)
    print(mod, "stimuli", len(frames), "frames", len(allf))

# zones: language network (masks_v2), auditory cortex (Destrieux: Heschl gyrus, transverse sulcus, planum temporale)
masks = np.load(R / "mac" / "work" / "masks_v2.npz")
lang = masks["word_access"] | masks["phrase_building"]
from nilearn import datasets  # noqa: E402

des = datasets.fetch_atlas_surf_destrieux()
names = [x.decode() if isinstance(x, bytes) else x for x in des["labels"]]
aud_ids = [i for i, n in enumerate(names) if n in ("G_temp_sup-G_T_transv", "S_temporal_transverse", "G_temp_sup-Plan_tempo")]
aud = np.concatenate([np.isin(des["map_left"], aud_ids), np.isin(des["map_right"], aud_ids)])
vis = masks["visual_net"]
print("zone sizes", int(lang.sum()), int(aud.sum()), int(vis.sum()))

# anchor = mask vertex nearest to the mask centroid on the inflated mesh used by the site (left hemisphere for language)
mesh = json.load(open(R.parent / "web" / "public" / "brain" / "mesh.json"))
P = np.asarray(mesh["positions"], np.float32).reshape(-1, 3)


def anchor(mask, hemi=None):
    idx = np.flatnonzero(mask)
    if hemi == "left":
        idx = idx[idx < NV // 2]
    c = P[idx].mean(0)
    return int(idx[np.argmin(((P[idx] - c) ** 2).sum(1))])


OUT.mkdir(parents=True, exist_ok=True)
index, total = [], 0
for e, (ru, en) in SHOW.items():
    zs = []
    for mod in ("audio", "text"):
        a = load(mod, e)
        if a is None:
            continue
        m, s = stats[mod]
        zs.append((a - m) / s)
    T = min(len(z) for z in zs)
    Z = np.mean([z[:T] for z in zs], 0)[:MAX_FRAMES]
    q = np.clip(np.round((np.clip(Z, -CLIP, CLIP) + CLIP) / (2 * CLIP) * 255), 0, 255).astype(np.uint8)
    q.tofile(OUT / f"{e}.bin")
    total += q.nbytes
    zone = lambda mk: [round(float(v), 2) for v in Z[:, mk].mean(1)]
    index.append({
        "id": e, "title_ru": ru, "title_en": en, "frames": int(len(q)), "fps": 1, "start_s": DROP,
        "modalities": [mod for mod in ("audio", "text") if load(mod, e) is not None],
        "zones": {"language": zone(lang), "auditory": zone(aud), "visual": zone(vis)},
    })
    print(e, q.shape, "lang z mean %.2f aud %.2f vis %.2f" % (Z[:, lang].mean(), Z[:, aud].mean(), Z[:, vis].mean()))

json.dump({
    "vertices": NV, "scale": "uint8 = (z + 2) / 4 * 255, 128 = average response; z per vertex against all frames of all stimuli",
    "model": "TRIBE v2 (Meta), prediction from stimulus audio and text, English stimuli, fsaverage5",
    "anchors": {"language": anchor(lang, "left"), "auditory": anchor(aud, "left"), "visual": anchor(vis, "left")},
    "exercises": index,
}, open(OUT / "index.json", "w"), ensure_ascii=False, separators=(",", ":"))
print("total bytes", total)
