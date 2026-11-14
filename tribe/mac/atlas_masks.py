"""Domain masks on fsaverage5 (20484 = 10242 left + 10242 right). Destrieux (nilearn surface atlas) + Schaefer-2018 400 parcels grouped into Yeo 7 networks
(volumetric MNI, projected with nilearn vol_to_surf onto fsaverage5 pial)."""
import numpy as np, json
from pathlib import Path
from nilearn import datasets, surface
OUT = Path(__file__).resolve().parent / "work" / "masks.npz"
def build():
    fs = datasets.fetch_surf_fsaverage("fsaverage5")
    d = datasets.fetch_atlas_surf_destrieux()
    labels = [l.decode() if isinstance(l, bytes) else l for l in d["labels"]]
    lab = {"L": np.asarray(d["map_left"]), "R": np.asarray(d["map_right"])}
    def dest(hemis, names):
        m = []
        for h in ("L", "R"):
            ids = [labels.index(n) for n in names if h in hemis]
            m.append(np.isin(lab[h], ids))
        return np.concatenate(m)
    sch = datasets.fetch_atlas_schaefer_2018(n_rois=400, yeo_networks=7, resolution_mm=1)
    img = sch["maps"]
    slabels = [l.decode() if isinstance(l, bytes) else l for l in sch["labels"]]
    netname = {"Vis": 1, "SomMot": 2, "DorsAttn": 3, "SalVentAttn": 4, "Limbic": 5, "Cont": 6, "Default": 7}
    pnet = np.array([0 if l == "Background" else netname[l.split("_")[2]] for l in slabels])  # parcel index -> Yeo7 network
    nets = []
    for h in ("left", "right"):
        nets.append(np.rint(surface.vol_to_surf(img, fs[f"pial_{h}"], inner_mesh=fs[f"white_{h}"], interpolation="nearest_most_frequent")).astype(int).ravel())
    nets = pnet[np.concatenate(nets)]  # 1 Visual 2 Somatomotor 3 DorsAttn 4 VentAttn 5 Limbic 6 FPN 7 Default
    ifg_o = ["G_front_inf-Opercular"]; ifg_t = ["G_front_inf-Triangul"]; ifg_orb = ["G_front_inf-Orbital"]
    stg = ["G_temp_sup-Lateral", "S_temporal_sup", "G_temporal_middle", "Pole_temporal", "G_temp_sup-Plan_tempo"]
    masks = {
      "word_access": dest("L", ifg_t + ifg_orb + stg),
      "phrase_building": dest("L", ifg_o + ifg_t + ["G_temp_sup-Lateral", "S_temporal_sup", "G_temporal_middle", "G_pariet_inf-Angular"]),
      "attention": np.isin(nets, [3, 4, 6]),
      "episodic_memory": np.isin(nets, [7]) | dest("LR", ["G_oc-temp_med-Parahip", "G_precuneus", "G_cingul-Post-dorsal", "G_cingul-Post-ventral"]),
    }
    np.savez(OUT, **masks)
    return masks
if __name__ == "__main__":
    OUT.parent.mkdir(exist_ok=True); m = build()
    print({k: int(v.sum()) for k, v in m.items()})
