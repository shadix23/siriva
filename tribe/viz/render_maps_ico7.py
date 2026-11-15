"""TRIBE v2 cortex figures on the site's ico7 brain (replaces the fsaverage5 pictures of make_viz.py).

Run: cd es/tribe && .venv-mac/bin/python viz/render_maps_ico7.py
Needs: es/web/public/brain/cortex (viz/export_mesh_fs6.py), es/web/node_modules/three, Google Chrome, node >= 22.
Writes: viz/speech_story_retell_{ru,en}.png, viz/visual_spatial_sequence_{ru,en}.png,
        viz/diff_speech_minus_visual_{ru,en}.png (1600x1480) and es/pitch/assets/tribe/diff_lateral.png (1320x650).

Data and meaning are the same as in make_viz.py: per exercise the mean response after 5 s, z across stimuli per
vertex and modality, modalities averaged; difference = mean z of 9 speech tasks minus 11 visual/spatial/motor ones;
outline = language mask word_access + phrase_building (left hemisphere only). Only the drawing changed:
fsaverage ico7 with relief and ambient occlusion, fs5 values carried over smoothly (as on the site),
a diverging scale whose middle shows the grey cortex. Views are rendered by render_views.html in headless Chrome.
"""
import json
import subprocess
import tempfile
from pathlib import Path

import matplotlib
import numpy as np

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from PIL import Image  # noqa: E402

R = Path(__file__).resolve().parents[1]
VIZ = R / "viz"
PITCH = R.parent / "pitch" / "assets" / "tribe"
DROP, N, CLIP = 5, 10242, 2.0
INK, INK3 = "#1e2320", "#5a625c"
plt.rcParams["font.family"] = ["Helvetica Neue", "Arial", "DejaVu Sans"]

# ---- data (same as make_viz.py)
ex = {e["id"]: e for e in json.load(open(R.parent / "backend/es_core/data/exercises.json"))["exercises"]}
masks = np.load(R / "mac/work/masks_v2.npz")
lang = masks["word_access"] | masks["phrase_building"]
ids = list(json.load(open(R / "stimuli-v2/manifest.json")))


def mean_map(mod, e):
    return np.load(R / "features-v2" / mod / f"{e}.npy").astype(np.float32)[DROP:].mean(0)


def zmap(mod):
    es = [e for e in ids if (R / "features-v2" / mod / f"{e}.npy").exists()]
    M = np.stack([mean_map(mod, e) for e in es])
    return dict(zip(es, (M - M.mean(0)) / (M.std(0) + 1e-9)))


Za, Zt = zmap("audio"), zmap("text")
Z = {e: np.mean([z[e] for z in (Za, Zt) if e in z], 0) for e in ids}
S = [e for e in ids if ex[e]["speech_output"]]
V = [e for e in ids if ex[e]["channel"] in ("visual", "spatial", "motor")]
diff = np.mean([Z[e] for e in S], 0) - np.mean([Z[e] for e in V], 0)
print("groups", len(S), len(V))
lang_left = lang.astype(np.float32)
lang_left[N:] = 0  # the mask exists for the left hemisphere only

T = {
    "ru": dict(
        speech="Речевое задание: рассказ по памяти (story_retell)",
        visual="Зрительное задание: пространственная последовательность (spatial_sequence_recall)",
        diff="Речевые минус зрительные задания (9 против 11)",
        cb="z по стимулам, среднее отклика после 5 с", cbd="разница средних z",
        lh="Левое", rh="Правое", lat="латерально", med="медиально",
        ctr="Контур: языковая маска (word_access + phrase_building)",
        foot="Предсказание модели для усреднённого мозга по звуку и тексту стимула, не измерение конкретного человека. TRIBE v2 (Meta).",
    ),
    "en": dict(
        speech="Speech task: story retell (story_retell)",
        visual="Visual task: spatial sequence recall (spatial_sequence_recall)",
        diff="Speech minus visual tasks (9 vs 11)",
        cb="z across stimuli, mean response after 5 s", cbd="difference of mean z",
        lh="Left", rh="Right", lat="lateral", med="medial",
        ctr="Outline: language mask (word_access + phrase_building)",
        foot="Model prediction for an average brain from stimulus audio and text, not a measurement of a specific person. TRIBE v2 (Meta).",
    ),
}
VIEWS = {  # (hemisphere, camera side): left lateral looks from x < 0, medial from the other side
    ("left", "lateral"): (0, -1),
    ("right", "lateral"): (1, 1),
    ("left", "medial"): (0, 1),
    ("right", "medial"): (1, -1),
}
VW, VH = 1500, 1000  # render size of one view, downscaled in the figure


# ---- colour scale for the legend: same stops and blending as the shader in render_views.html
def _lin(h):
    return (np.array([int(h[i : i + 2], 16) for i in (1, 3, 5)]) / 255.0) ** 2.2


P = [_lin("#a9d3ca"), _lin("#3a9b8b"), _lin("#1c5a51")]
Ng = [_lin("#ecc2ad"), _lin("#d27c60"), _lin("#9a3820")]
BASE = _lin("#bfc7cc")  # mid tone of the lit grey cortex


def scale_rgb(t):
    a = abs(t)
    st = P if t >= 0 else Ng
    c = st[0] + (st[1] - st[0]) * (a / 0.5) if a < 0.5 else st[1] + (st[2] - st[1]) * ((a - 0.5) / 0.5)
    x = np.clip((a - 0.05) / (0.4 - 0.05), 0, 1)
    al = 0.88 * x * x * (3 - 2 * x)
    return (BASE * (1 - al) + c * al) ** (1 / 2.2)


def colorbar(ax, label):
    ts = np.linspace(-1, 1, 600)
    img = np.array([scale_rgb(t) for t in ts])[None, :, :].repeat(24, 0)
    ax.imshow(img, extent=(-CLIP, CLIP, 0, 1), aspect="auto")
    ax.set_yticks([])
    ax.set_xticks(np.arange(-2, 2.01, 0.5))
    ax.set_xticklabels([f"{v:.1f}".replace("-", "−") for v in np.arange(-2, 2.01, 0.5)], fontsize=8, color=INK)
    ax.tick_params(axis="x", length=3, color="#9aa3a9")
    for s in ax.spines.values():
        s.set_visible(False)
    ax.set_xlabel(label, fontsize=9, color=INK, labelpad=4)


def render(maps, jobs):
    with tempfile.TemporaryDirectory(prefix="cortex-render-") as tmp:
        work = Path(tmp)
        (work / "maps.json").write_text(json.dumps({k: np.round(v, 4).tolist() for k, v in maps.items()}))
        for j in jobs:
            j["out"] = str(work / f"{j['name']}_{j['h']}_{j['side']}.png")
        (work / "jobs.json").write_text(json.dumps(jobs))
        subprocess.run(["node", str(VIZ / "render_views.mjs"), str(work)], check=True)
        out = {}
        for j in jobs:
            with Image.open(j["out"]) as im:
                out[(j["name"], j["h"], j["side"])] = im.convert("RGBA")
        return out


def crop_box(ims, pad=12):
    """One crop box for all views of a map: every hemisphere keeps the same scale in the figure."""
    bbs = [im.getbbox() for im in ims]
    w, h = ims[0].size
    return (max(min(b[0] for b in bbs) - pad, 0), max(min(b[1] for b in bbs) - pad, 0),
            min(max(b[2] for b in bbs) + pad, w), min(max(b[3] for b in bbs) + pad, h))


def crop(views, name, key):
    box = crop_box([v for k, v in views.items() if k[0] == name])
    return views[key].crop(box)


def place(f, im, rect):
    ax = f.add_axes(rect)
    ax.imshow(np.asarray(im))
    ax.set_axis_off()
    ax.set_anchor("C")
    return ax


def figure(views, name, title, cblabel, fname, lg, contour=False):
    t = T[lg]
    f = plt.figure(figsize=(8, 7.4), facecolor="white")
    f.text(0.5, 0.965, title, ha="center", va="center", fontsize=12.5, color=INK, wrap=True)
    cells = {("left", "lateral"): (0.02, 0.575), ("right", "lateral"): (0.51, 0.575), ("left", "medial"): (0.02, 0.235), ("right", "medial"): (0.51, 0.235)}
    for (hemi, view), (x, y) in cells.items():
        h, side = VIEWS[(hemi, view)]
        place(f, crop(views, name, (name, h, side)), [x, y, 0.47, 0.3])
        f.text(x + 0.235, y + 0.305, f"{t['lh'] if hemi == 'left' else t['rh']}, {t['lat'] if view == 'lateral' else t['med']}", ha="center", fontsize=10, color=INK)
    colorbar(f.add_axes([0.3, 0.165, 0.4, 0.022]), cblabel)
    if contour:
        f.text(0.5, 0.072, t["ctr"], ha="center", fontsize=9, color=INK)
    f.text(0.5, 0.028, t["foot"], ha="center", fontsize=7.3, color=INK3, wrap=True)
    f.savefig(VIZ / fname, dpi=200, facecolor="white")
    plt.close(f)
    print("figure", VIZ / fname)


def pitch_lateral(views, name, cblabel, out, lg="ru"):
    """Slide 4 picture: lateral views only, colour scale and outline note, 1320x650 like before."""
    t = T[lg]
    f = plt.figure(figsize=(6.6, 3.25), facecolor="white")
    for hemi, x in (("left", 0.01), ("right", 0.51)):
        h, side = VIEWS[(hemi, "lateral")]
        place(f, crop(views, name, (name, h, side)), [x, 0.345, 0.48, 0.57])
        f.text(x + 0.24, 0.94, f"{t['lh'] if hemi == 'left' else t['rh']}, {t['lat']}", ha="center", va="center", fontsize=10, color=INK)
    colorbar(f.add_axes([0.25, 0.25, 0.5, 0.04]), cblabel)
    f.text(0.5, 0.025, t["ctr"], ha="center", fontsize=8.5, color=INK)
    f.savefig(out, dpi=200, facecolor="white")
    plt.close(f)
    print("figure", out)


if __name__ == "__main__":
    maps = {"story_retell": Z["story_retell"], "spatial_sequence_recall": Z["spatial_sequence_recall"], "diff": diff, "lang": lang_left}
    jobs = []
    for name in ("story_retell", "spatial_sequence_recall", "diff"):
        for h, side in VIEWS.values():
            j = {"name": name, "h": h, "side": side, "w": VW, "hgt": VH, "lineW": 4.5}
            if name == "diff" and h == 0:
                j["maskName"] = "lang"
            jobs.append(j)
    views = render(maps, jobs)
    for lg, t in T.items():
        figure(views, "story_retell", t["speech"], t["cb"], f"speech_story_retell_{lg}.png", lg)
        figure(views, "spatial_sequence_recall", t["visual"], t["cb"], f"visual_spatial_sequence_{lg}.png", lg)
        figure(views, "diff", t["diff"], t["cbd"], f"diff_speech_minus_visual_{lg}.png", lg, contour=True)
    pitch_lateral(views, "diff", T["ru"]["cbd"], PITCH / "diff_lateral.png")
