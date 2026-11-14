"""Checks a load matrix file before the demo: format, coverage, agreement with the placeholder, bypass demo.

Run: PYTHONPATH=. .venv/bin/python scripts/check_matrix.py ../tribe/out/load_matrix.tribe_v2.json
Switch the app to it with one variable: ES_LOAD_MATRIX=<path> (start-demo.sh passes it through).
"""
import sys
from datetime import date

from es_core import planner
from es_core.agreement import spearman_agreement
from es_core.matrix import DATA, JsonMatrixLoader, load_exercises
from es_core.profile import build_profile, median_features, scores
from es_core.synthetic import demo_bypass_histories

path = sys.argv[1]
m = JsonMatrixLoader(path).load()  # raises on a bad format
ph = JsonMatrixLoader(DATA / "load_matrix.placeholder.json").load()
exs = load_exercises()
missing = [e.id for e in exs if e.id not in m.loads]
print(f"source: {m.source} | model: {m.model_version} | atlas: {m.atlas} | placeholder: {m.is_placeholder}")
print(f"exercises covered: {len(exs) - len(missing)}/{len(exs)}", f"MISSING: {missing}" if missing else "")
ag = spearman_agreement(m, ph)
print("agreement (Spearman vs placeholder):", None if ag["value"] is None else round(ag["value"], 3))
for d, v in ag["per_domain"].items():
    print(f"  {d}: {None if v is None else round(v, 3)}")
a, b = demo_bypass_histories(anchor=date.today())
prog = {}
for k, h in (("A", a), ("B", b)):
    sc = scores(build_profile(median_features([f for _, f in h])))
    prog[k] = planner.plan_program(sc, exs, m, target="episodic_memory")
ids = {k: [i["exercise_id"] for i in p["items"]] for k, p in prog.items()}
by = {e.id: e for e in exs}
print("bypass demo: A =", ids["A"])
print("             B =", ids["B"])
ok = ids["A"] != ids["B"] and ids["B"] and not any(by[i].speech_output for i in ids["B"])
print("bypass demo OK (programs differ, B non-empty, no speech)" if ok else "WARNING: bypass demo is NOT clean with this matrix")
