"""Adds Yeo visual network and somatomotor masks (same Schaefer-2018/Yeo7 projection as atlas_masks.py) plus a Destrieux occipital/early visual mask
to mac/work/masks_v2.npz (the original masks are copied unchanged)."""
import sys, numpy as np
from pathlib import Path
from nilearn import datasets, surface
W = Path(__file__).resolve().parents[1]/"work"
fs = datasets.fetch_surf_fsaverage("fsaverage5")
sch = datasets.fetch_atlas_schaefer_2018(n_rois=400, yeo_networks=7, resolution_mm=1)
sl = [l.decode() if isinstance(l, bytes) else l for l in sch["labels"]]
nn = {"Vis": 1, "SomMot": 2, "DorsAttn": 3, "SalVentAttn": 4, "Limbic": 5, "Cont": 6, "Default": 7}
pnet = np.array([0 if l == "Background" else nn[l.split("_")[2]] for l in sl])
nets = np.concatenate([np.rint(surface.vol_to_surf(sch["maps"], fs[f"pial_{h}"], inner_mesh=fs[f"white_{h}"], interpolation="nearest_most_frequent")).astype(int).ravel() for h in ("left", "right")])
nets = pnet[nets]
m = dict(np.load(W/"masks.npz")); m["visual_net"] = nets == 1; m["somatomotor_net"] = nets == 2
np.savez(W/"masks_v2.npz", **m); print({k: int(v.sum()) for k, v in m.items()})
