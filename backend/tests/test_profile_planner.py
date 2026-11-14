from datetime import date

import pytest
from es_core import planner, trend
from es_core.matrix import JsonMatrixLoader, load_exercises
from es_core.profile import REDUCED_THRESHOLD, WEIGHTS, build_profile, median_features, scores
from es_core.synthetic import HEALTHY, demo_bypass_histories, demo_trend_history, generate_history
from es_core.types import DOMAINS

ANCHOR = date(2026, 11, 14)
from es_core.matrix import DATA
MATRIX = JsonMatrixLoader(DATA / "load_matrix.placeholder.json").load()
EXS = load_exercises()


def test_weights_sum_to_one_and_features_have_reference():
    from es_core.profile import REFERENCE
    for d, w in WEIGHTS.items():
        assert sum(w.values()) == pytest.approx(1.0)
        assert all(f in REFERENCE for f in w)


def test_profile_healthy_vs_missing_features():
    p = build_profile(HEALTHY)
    assert all(p["domains"][d]["score"] > 60 for d in DOMAINS)
    p2 = build_profile({"fluency_count": 20.0})
    assert p2["domains"]["word_access"]["coverage"] == pytest.approx(0.30)
    assert p2["domains"]["episodic_memory"]["score"] is None
    assert p["calibration"] == "before_adress_calibration"


def test_matrix_placeholder_and_library():
    assert MATRIX.source == "placeholder, not TRIBE v2" and MATRIX.is_placeholder
    assert 15 <= len(EXS) <= 30
    assert {e.channel for e in EXS} >= {"speech", "visual", "spatial", "auditory"}
    assert all(e.id in MATRIX.loads for e in EXS)


def test_matrix_loader_rejects_bad_values(tmp_path):
    import json
    raw = json.loads((DATA / "load_matrix.placeholder.json").read_text())
    raw["loads"]["story_retell"]["attention"] = 1.7
    p = tmp_path / "m.json"
    p.write_text(json.dumps(raw))
    with pytest.raises(ValueError):
        JsonMatrixLoader(p).load()


def test_difficulty_rule_keeps_70_80():
    assert planner.adapt_difficulty(3, 0.9) == 4
    assert planner.adapt_difficulty(3, 0.75) == 3
    assert planner.adapt_difficulty(3, 0.5) == 2
    assert planner.adapt_difficulty(5, 1.0) == 5 and planner.adapt_difficulty(1, 0.0) == 1


def test_dose_budget_respected():
    sc = {"episodic_memory": 30, "word_access": 70, "phrase_building": 70, "attention": 70, "processing_speed": 70}
    for budget in (6, 12, 18):
        prog = planner.plan_program(sc, EXS, MATRIX, budget=budget)
        assert prog["dose_total"] <= budget
        assert len(prog["items"]) <= planner.MAX_ITEMS


def test_bypass_two_patients_same_memory_different_programs():
    a, b = demo_bypass_histories(anchor=ANCHOR)
    sa = scores(build_profile(median_features([f for _, f in a])))
    sb = scores(build_profile(median_features([f for _, f in b])))
    assert sa["episodic_memory"] == sb["episodic_memory"] < REDUCED_THRESHOLD
    pa = planner.plan_program(sa, EXS, MATRIX, target="episodic_memory")
    pb = planner.plan_program(sb, EXS, MATRIX, target="episodic_memory")
    ids = lambda p: [i["exercise_id"] for i in p["items"]]
    by_id = {e.id: e for e in EXS}
    assert ids(pa) != ids(pb)
    assert pa["avoid_domains"] == []
    assert set(pb["avoid_domains"]) == {"word_access", "phrase_building"}
    # B gets no spoken exercises, and every item still loads memory strongly
    assert not any(by_id[i].speech_output for i in ids(pb))
    assert all(i["predicted_load"]["episodic_memory"] >= 0.7 for i in pb["items"])
    assert any(by_id[i].speech_output for i in ids(pa))
    # a naive picker (no avoidance) would have given B spoken exercises
    assert any(by_id[i].speech_output for i in pb["naive_item_ids"]) and pb["differs_from_naive"]


def test_trend_flag_fires_only_for_the_declining_domain():
    hist = demo_trend_history(anchor=ANCHOR)
    weekly = {d: [] for d in DOMAINS}
    for w in range(12):
        s = scores(build_profile(median_features([f for _, f in hist[w * 7:(w + 1) * 7]])))
        for d in DOMAINS:
            weekly[d].append(s[d])
    flag = trend.trend_flag(weekly)
    assert flag["active"] and flag["domains"] == ["word_access"]
    assert "Обсудите со специалистом" in flag["message"]
    # a stable patient does not get a flag, and short history never flags
    stable = generate_history(3, 84, ANCHOR)
    weekly2 = {d: [scores(build_profile(median_features([f for _, f in stable[w * 7:(w + 1) * 7]])))[d]
                   for w in range(12)] for d in DOMAINS}
    assert not trend.trend_flag(weekly2)["active"]
    assert not trend.trend_flag({d: v[:4] for d, v in weekly.items()})["active"]


def test_synthetic_is_deterministic():
    assert generate_history(5, 10, ANCHOR) == generate_history(5, 10, ANCHOR)
    assert generate_history(5, 10, ANCHOR) != generate_history(6, 10, ANCHOR)
