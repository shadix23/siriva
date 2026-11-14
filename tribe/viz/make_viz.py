"""Build cortex PNGs and 3D data from TRIBE v2 audio/text predictions. Run: .venv-mac/bin/python viz/make_viz.py"""
import json
from pathlib import Path
import numpy as np, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from nilearn import datasets, plotting, surface
R = Path(__file__).resolve().parents[1]; OUT = R/"viz"; BRAIN = R.parent/"web"/"public"/"brain"
DROP, N, CLIP = 5, 10242, 2.0
ex = {e["id"]: e for e in json.load(open(R.parent/"backend/es_core/data/exercises.json"))["exercises"]}
masks = np.load(R/"mac/work/masks_v2.npz"); lang = masks["word_access"] | masks["phrase_building"]
ids = list(json.load(open(R/"stimuli-v2/manifest.json")))
def mean_map(mod, e):
    p = np.load(R/"features-v2"/mod/f"{e}.npy").astype(np.float32); return p[DROP:].mean(0)
def zmap(mod):
    es = [e for e in ids if (R/"features-v2"/mod/f"{e}.npy").exists()]
    M = np.stack([mean_map(mod, e) for e in es]); Z = (M - M.mean(0)) / (M.std(0) + 1e-9)
    return dict(zip(es, Z))
Za, Zt = zmap("audio"), zmap("text")
Z = {e: np.mean([z[e] for z in (Za, Zt) if e in z], 0) for e in ids}   # modalities of one exercise averaged
S = [e for e in ids if ex[e]["speech_output"]]; V = [e for e in ids if ex[e]["channel"] in ("visual", "spatial", "motor")]
diff = np.mean([Z[e] for e in S], 0) - np.mean([Z[e] for e in V], 0)
print("groups", len(S), len(V))
# sanity numbers
for name, m in [("speech z", np.mean([Z[e] for e in S], 0)), ("visual z", np.mean([Z[e] for e in V], 0)), ("diff", diff)]:
    print(name, "lang mask mean %.2f, rest %.2f; L lang %.2f R-hemi lang-homolog n/a" % (m[lang].mean(), m[~lang].mean(), m[lang].mean()))
fs = datasets.fetch_surf_fsaverage("fsaverage5")
cmap = LinearSegmentedColormap.from_list("siriva", ["#9a3820", "#d9a58f", "#f6f3ec", "#7fb0a5", "#1c5a51"])  # terracotta - paper - teal
L = {"ru": dict(speech="Речевое задание: рассказ по памяти (story_retell)", visual="Зрительное задание: пространственная последовательность (spatial_sequence_recall)",
     diff="Речевые минус зрительные задания (9 против 11)", cb="z по стимулам, среднее отклика после 5 с", cbd="разница средних z", lh="Левое", rh="Правое", lat="латерально", med="медиально", ctr="Контур: языковая маска (word_access + phrase_building)",
     foot="Предсказание модели для усреднённого мозга по звуку и тексту стимула, не измерение конкретного человека. TRIBE v2 (Meta), fsaverage5."),
     "en": dict(speech="Speech task: story retell (story_retell)", visual="Visual task: spatial sequence recall (spatial_sequence_recall)",
     diff="Speech minus visual tasks (9 vs 11)", cb="z across stimuli, mean response after 5 s", cbd="difference of mean z", lh="Left", rh="Right", lat="lateral", med="medial", ctr="Outline: language mask (word_access + phrase_building)",
     foot="Model prediction for an average brain from stimulus audio and text, not a measurement of a specific person. TRIBE v2 (Meta), fsaverage5.")}
def fig(vals, title, cblabel, fname, lg, contour=False):
    t = L[lg]; f = plt.figure(figsize=(8, 7.4), facecolor="white")
    gs = f.add_gridspec(2, 2, left=0.02, right=0.98, top=0.99, bottom=0.2, wspace=-0.12, hspace=-0.2)
    for r, view in enumerate(["lateral", "medial"]):
        for c, hemi in enumerate(["left", "right"]):
            ax = f.add_subplot(gs[r, c], projection="3d"); ax.patch.set_visible(False); v = vals[:N] if hemi == "left" else vals[N:]
            plotting.plot_surf_stat_map(fs["infl_"+hemi], v, hemi=hemi, view=view, bg_map=fs["sulc_"+hemi], bg_on_data=True, cmap=cmap,
                vmax=CLIP, threshold=None, colorbar=False, axes=ax, figure=f, engine="matplotlib", symmetric_cbar=True)
            if contour and hemi == "left":
                m = (lang[:N] if hemi == "left" else lang[N:]).astype(int)
                plotting.plot_surf_contours(fs["infl_"+hemi], m, levels=[1], colors=["#1e2320"], axes=ax, figure=f, hemi=hemi, view=view, linewidths=[1.2])
            ax.set_title(f"{t['lh'] if hemi=='left' else t['rh']}, {t['lat'] if view=='lateral' else t['med']}", fontsize=10, color="#1e2320", y=0.9)
    f.suptitle(title, fontsize=12, color="#1e2320", y=0.975, wrap=True)
    cax = f.add_axes([0.3, 0.15, 0.4, 0.018]); sm = plt.cm.ScalarMappable(cmap=cmap, norm=plt.Normalize(-CLIP, CLIP))
    cb = f.colorbar(sm, cax=cax, orientation="horizontal"); cb.set_label(cblabel, fontsize=9, color="#1e2320"); cb.ax.tick_params(labelsize=8)
    if contour: f.text(0.5, 0.062, t["ctr"], ha="center", fontsize=9, color="#1e2320")
    f.text(0.5, 0.02, t["foot"], ha="center", fontsize=7.5, color="#5a554b", wrap=True)
    f.savefig(OUT/fname, dpi=200, facecolor="white"); plt.close(f)   # 8x7.4 in at 200 dpi
for lg in L:
    t = L[lg]
    fig(Z["story_retell"], t["speech"], t["cb"], f"speech_story_retell_{lg}.png", lg)
    fig(Z["spatial_sequence_recall"], t["visual"], t["cb"], f"visual_spatial_sequence_{lg}.png", lg)
    fig(diff, t["diff"], t["cbd"], f"diff_speech_minus_visual_{lg}.png", lg, contour=True)
# ---- 3D data
def inflated(h):
    c, f = surface.load_surf_mesh(fs["infl_"+h]); return np.asarray(c, float), np.asarray(f)
cl, fl = inflated("left"); cr, fr = inflated("right")
gap = 8.0; cl[:, 0] += -gap - cl[:, 0].max(); cr[:, 0] += gap - cr[:, 0].min()
P = np.vstack([cl, cr]); P -= (P.max(0) + P.min(0)) / 2
BRAIN.mkdir(parents=True, exist_ok=True)
json.dump({"positions": np.round(P, 2).ravel().tolist(), "indices": np.vstack([fl, fr + N]).ravel().tolist(), "hemi_split": N}, open(BRAIN/"mesh.json", "w"), separators=(",", ":"))
q = lambda v: np.clip(np.round((np.clip(v, -CLIP, CLIP) + CLIP) / (2*CLIP) * 255), 0, 255).astype(int).tolist()
SHOW = {"story_retell": ("Пересказ истории", "Story retell", "speech"), "picture_description": ("Описание картинки", "Picture description", "speech"),
 "naming_fluency": ("Называние слов по категории", "Naming fluency", "speech"), "spatial_sequence_recall": ("Пространственная последовательность", "Spatial sequence recall", "visual"),
 "card_sorting": ("Сортировка карточек", "Card sorting", "visual"), "spot_the_difference": ("Найди отличия", "Spot the difference", "visual")}
exs = {e: {"title_ru": a, "title_en": b, "group": g, "values": q(Z[e])} for e, (a, b, g) in SHOW.items()}
exs["diff_speech_minus_visual"] = {"title_ru": "Речевые минус зрительные задания", "title_en": "Speech minus visual tasks", "group": "diff", "values": q(diff)}
json.dump({"meta": {"model": "TRIBE v2 (Meta), предсказание по звуку и тексту", "scale": "0..255 общая для всех карт: значение = (z + 2) / 4 * 255, 128 = 0 (z по стимулам, обрезка +-2)",
  "caveat_ru": "Предсказание модели для усреднённого мозга по звуку и тексту стимула, не измерение конкретного человека.",
  "caveat_en": "Model prediction for an average brain from stimulus audio and text, not a measurement of a specific person.", "language_mask": np.flatnonzero(lang).tolist()}, "exercises": exs}, open(BRAIN/"loads.json", "w"), ensure_ascii=False, separators=(",", ":"))
# regional check
import nibabel  # noqa
print("done")
