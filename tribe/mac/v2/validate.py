"""Validation v2. usage: validate.py <matrix.json> <out.md>
1) Spearman per domain vs the placeholder markup (success metric 2). 2) known groups (speech vs visual/spatial/motor exercises, defined by
the exercise channel, not by the placeholder): Mann-Whitney U (one-sided in the expected direction), rank-biserial r, on the final matrix and per modality."""
import json, sys
from pathlib import Path
import numpy as np
from scipy.stats import spearmanr, mannwhitneyu
ROOT = Path(__file__).resolve().parents[2]
a = json.load(open(sys.argv[1])); b = json.load(open(ROOT.parent/"backend"/"es_core"/"data"/"load_matrix.placeholder.json"))
ex = {e["id"]: e for e in json.load(open(ROOT.parent/"backend"/"es_core"/"data"/"exercises.json"))["exercises"]}
ids = list(b["loads"]); L = []
L += ["## Spearman against the placeholder markup (n = %d)" % len(ids), "", "| domain | rho | p |", "|---|---|---|"]
for d in b["domains"]:
    r, p = spearmanr([a["loads"][e][d] for e in ids], [b["loads"][e][d] for e in ids]); L.append(f"| {d} | {r:.2f} | {p:.3f} |")
S = [e for e in ids if ex[e]["speech_output"]]; V = [e for e in ids if ex[e]["channel"] in ("visual", "spatial", "motor")]
import os
det = json.load(open(ROOT/"mac"/"work"/os.environ.get("DETAIL", "v2_detail.json")))
def test(vals, g1, g2, d1="greater"):
    x = [vals[e] for e in g1 if e in vals]; y = [vals[e] for e in g2 if e in vals]
    if len(x) < 3 or len(y) < 3: return None
    u, p = mannwhitneyu(x, y, alternative=d1); rbc = 2*u/(len(x)*len(y)) - 1
    return len(x), len(y), float(np.mean(x)), float(np.mean(y)), rbc, p
L += ["", f"## Known groups: speech exercises (n={len(S)}) vs visual/spatial/motor exercises (n={len(V)})", "",
      "Expected: word_access and phrase_building higher in speech; attention and Yeo visual network higher in visual. Mann-Whitney U one-sided, rbc = rank-biserial effect size (+1 = fully as expected).", "",
      "| source | domain | expected | n speech / n visual | mean speech | mean visual | rbc | p |", "|---|---|---|---|---|---|---|---|"]
rows = {"matrix": {d: {e: a["loads"][e][d] for e in ids} for d in ("word_access", "phrase_building", "attention", "episodic_memory")}}
rows["matrix"]["visual_net"] = {e: det["combined"][e]["visual_net"] for e in ids}
for m, dd in det["per_modality_z01"].items(): rows[m] = dd
res = {}
for src, dd in rows.items():
    for d, exp in (("word_access", "S>V"), ("phrase_building", "S>V"), ("attention", "V>S"), ("visual_net", "V>S")):
        if d not in dd: continue
        t = test(dd[d], S, V) if exp == "S>V" else test(dd[d], V, S)
        if not t: continue
        n1, n2, m1, m2, rbc, p = t; ns, nv = (n1, n2) if exp == "S>V" else (n2, n1); ms, mv = (m1, m2) if exp == "S>V" else (m2, m1)
        L.append(f"| {src} | {d} | {exp} | {ns} / {nv} | {ms:.2f} | {mv:.2f} | {rbc:+.2f} | {p:.3f} |"); res[f"{src}/{d}"] = {"rbc": rbc, "p": p}
Path(sys.argv[2]).write_text("\n".join(L)); print("\n".join(L))
