"""Spearman per domain: matrix vs placeholder. usage: validate.py <matrix.json> -> prints markdown table, writes work/spearman.json"""
import json, sys
from pathlib import Path
from scipy.stats import spearmanr
ROOT = Path(__file__).resolve().parents[1]
a = json.load(open(sys.argv[1]))
b = json.load(open(ROOT.parent/"backend"/"es_core"/"data"/"load_matrix.placeholder.json"))
ids = list(b["loads"]); res = {}
print("| domain | rho | p |\n|---|---|---|")
for d in b["domains"]:
    r, p = spearmanr([a["loads"][e][d] for e in ids], [b["loads"][e][d] for e in ids])
    res[d] = {"rho": round(float(r), 3), "p": round(float(p), 4)}
    print(f"| {d} | {r:.2f} | {p:.3f} |")
(ROOT/"mac"/"work"/"spearman.json").write_text(json.dumps(res, indent=1))
