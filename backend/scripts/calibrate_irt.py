"""Calibrates Rasch difficulties of the 5 levels per domain on a synthetic population (seeded).

Writes es_core/data/irt_calibration.json. Run: PYTHONPATH=. .venv/bin/python scripts/calibrate_irt.py [n_patients]
The population is generated from the same model, so this proves the calibration code recovers known values;
it is not a norm for real patients (TODO: recalibrate when real results exist).
"""
import json
import sys
from pathlib import Path

import numpy as np

from es_core import irt
from es_core.types import DOMAINS

N = int(sys.argv[1]) if len(sys.argv) > 1 else 400
SEED = 20261114
out = {"model": "1PL Rasch, marginal ML (EM), prior N(0,1)", "population": "synthetic", "n_patients": N,
       "seed": SEED, "results_per_patient": 10, "note": "synthetic population, not real-patient norms", "domains": {}}
for i, d in enumerate(DOMAINS):
    true_b = irt.TRUE_DIFFICULTY[d]
    pop = irt.simulate_population(N, SEED + i, true_b)
    b = irt.calibrate(pop)
    rmse = float(np.sqrt(np.mean((np.array(b) - np.array(true_b)) ** 2)))
    out["domains"][d] = {"difficulty": [round(x, 3) for x in b], "generating_difficulty": true_b,
                         "rmse_vs_generating": round(rmse, 3)}
    print(d, [round(x, 2) for x in b], "rmse", round(rmse, 3))
Path(__file__).resolve().parent.parent.joinpath("es_core", "data", "irt_calibration.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1) + "\n")
