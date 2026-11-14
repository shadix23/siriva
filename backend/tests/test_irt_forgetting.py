from datetime import datetime, timedelta, timezone

import numpy as np
import pytest

from es_core import forgetting, irt
from es_core.config import FORGET_TARGET_RECALL, IRT_MIN_RESULTS
from es_core.types import DOMAINS
from tests.test_api import new_patient, new_session, transcript_body
from tests.test_v02 import retell


# ---------- IRT ----------
def test_calibration_file_is_valid_and_recovers_generating_values():
    cal = irt.load_calibration()
    assert set(cal) == set(DOMAINS) and all(len(b) == 5 for b in cal.values())
    import json
    raw = json.loads(irt.CALIBRATION_FILE.read_text())
    assert raw["n_patients"] >= 200 and raw["population"] == "synthetic"
    assert all(v["rmse_vs_generating"] < 0.2 for v in raw["domains"].values())


def test_calibrate_recovers_difficulties_on_fresh_population():
    true_b = irt.TRUE_DIFFICULTY["word_access"]
    pop = irt.simulate_population(250, 123, true_b)
    b = irt.calibrate(pop, iterations=40)
    assert np.sqrt(np.mean((np.array(b) - np.array(true_b)) ** 2)) < 0.25
    assert all(b[i] < b[i + 1] for i in range(4))


def test_eap_and_level_choice():
    b = irt.load_calibration()["word_access"]
    weak = irt.eap([(2, 0.3, 6), (2, 0.4, 6), (1, 0.6, 6)], b)
    strong = irt.eap([(3, 0.9, 6), (4, 0.8, 6), (3, 0.95, 6)], b)
    assert weak[0] < 0 < strong[0]
    more = irt.eap([(3, 0.9, 6)] * 6, b)
    assert more[1] < strong[1]                               # more data, smaller uncertainty
    lv_w, p_w = irt.choose_level(weak[0], b)
    lv_s, p_s = irt.choose_level(strong[0], b)
    assert lv_w < lv_s
    for th in (-1.0, 0.0, 1.0):                              # chosen level is the closest to 0.75
        lv, p = irt.choose_level(th, b)
        assert all(abs(p - 0.75) <= abs(irt.success_probability(th, x) - 0.75) + 1e-9 for x in b)
    assert irt.eap([], b)[0] == pytest.approx(0.0, abs=1e-6)


def test_plan_level_falls_back_to_rule_with_few_results():
    b = irt.load_calibration()["attention"]
    few = irt.plan_level([(2, 0.9, 6)], b, rule_level=4)
    assert few["source"] == "rule" and few["level"] == 4 and few["results"] == 1
    enough = irt.plan_level([(2, 0.5, 6)] * IRT_MIN_RESULTS, b, rule_level=4)
    assert enough["source"] == "irt" and enough["level"] <= 2


# ---------- forgetting ----------
NOW = datetime(2026, 11, 14, 12, 0, tzinfo=timezone.utc)


def test_recall_decays_and_next_review_hits_target():
    st = forgetting.init_state(0.6, NOW)
    p1 = forgetting.recall_probability(st.half_life_days, 1)
    p3 = forgetting.recall_probability(st.half_life_days, 3)
    assert 1 > p1 > p3 > 0
    nxt = forgetting.next_review_at(st)
    dt = (nxt - st.last_review_at).total_seconds() / 86400
    assert forgetting.recall_probability(st.half_life_days, dt) == pytest.approx(FORGET_TARGET_RECALL, abs=1e-6)
    assert not forgetting.describe(st, NOW)["due"] and forgetting.describe(st, nxt + timedelta(hours=1))["due"]


def test_stronger_encoding_lasts_longer_and_reviews_move_half_life():
    weak, strong = forgetting.init_state(0.2, NOW), forgetting.init_state(0.9, NOW)
    assert strong.half_life_days > weak.half_life_days
    later = NOW + timedelta(days=2)
    good = forgetting.update(strong, 0.9, later)
    bad = forgetting.update(strong, 0.1, later)
    assert good.half_life_days > strong.half_life_days > bad.half_life_days
    # a late successful recall strengthens more than one right after learning
    soon = forgetting.update(strong, 0.9, NOW + timedelta(minutes=20))
    assert good.half_life_days > soon.half_life_days
    assert good.reviews == 2 and forgetting.MemoryState


# ---------- API ----------
def test_result_updates_ability_and_switches_from_rule_to_irt(make_client):
    c = make_client(seed_demo=False)
    pid = new_patient(c)
    sid = new_session(c, pid)
    levels = []
    for acc in (0.9, 0.6, 0.8, 0.7, 0.8):
        r = c.post(f"/sessions/{sid}/exercises/spatial_sequence_recall/result",
                   json={"accuracy": acc, "duration_s": 60, "trials": 5}).json()
        levels.append((r["next_level"]["source"], r["ability"]["results"]))
        assert 0 < r["next_level"]["predicted_success"] < 1 and 1 <= r["difficulty_after"] <= 5
    assert levels[0][0] == "rule" and levels[-1][0] == "irt" and levels[-1][1] == 5
    # the played level may be reported by the client and is stored
    r = c.post(f"/sessions/{sid}/exercises/spatial_sequence_recall/result", json={"accuracy": 0.5, "level": 4}).json()
    assert r["difficulty_before"] == 4
    assert c.post(f"/sessions/{sid}/exercises/spatial_sequence_recall/result", json={"accuracy": 0.5, "level": 9}).status_code == 422


def test_program_items_have_level_probability_and_source(make_client):
    c = make_client()
    for pid in ("demo-bypass-a", "demo-bypass-b", "demo-trend"):
        prog = c.get(f"/patients/{pid}/program/today", params={"only": "playable"}).json()
        assert prog["items"]
        for it in prog["items"]:
            assert it["difficulty_source"] == "irt" and 1 <= it["difficulty"] <= 5
            assert 0.4 <= it["predicted_success"] <= 0.95
        assert set(prog["ability"]) == set(DOMAINS) and prog["ability"]["episodic_memory"]["results"] >= 3
    # weaker patient gets an easier level than the stronger one on the same exercise
    pa = c.get("/patients/demo-bypass-a/program/today", params={"only": "playable"}).json()["ability"]
    pb = c.get("/patients/demo-bypass-b/program/today", params={"only": "playable"}).json()["ability"]
    assert pb["word_access"]["theta"] < pa["word_access"]["theta"]


def test_reviews_due_for_demo_and_created_by_retell(make_client):
    c = make_client()
    a = {r["material_id"]: r for r in c.get("/patients/demo-bypass-a/program/today").json()["reviews"]}
    b = {r["material_id"]: r for r in c.get("/patients/demo-bypass-b/program/today").json()["reviews"]}
    assert a["story:apple-tree-ru"]["due"] is False and b["story:apple-tree-ru"]["due"] is True
    r = b["story:apple-tree-ru"]
    assert r["reason_code"] == "recall_below_target" and r["predicted_recall"] <= 0.8 and r["next_review_at"]
    assert "Пора повторить" in r["reason"] and "0," in r["reason"]
    # due story is proposed in the story_retell item
    prog = c.get("/patients/demo-bypass-a/program/today").json()
    sr = next(i for i in prog["items"] if i["exercise_id"] == "story_retell")
    assert sr["story_id"] == "apple-tree-ru"
    # a new patient: retelling creates the memory state; it is not due right after
    c2 = make_client(seed_demo=False)
    pid = new_patient(c2)
    sid = new_session(c2, pid)
    c2.post(f"/sessions/{sid}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru"))
    retell(c2, sid, "immediate")
    retell(c2, sid, "delayed")
    revs = c2.get(f"/patients/{pid}/program/today").json()["reviews"]
    assert len(revs) == 1 and revs[0]["kind"] == "story" and revs[0]["reviews"] == 2 and revs[0]["due"] is False
    # generic materials via /result
    c2.post(f"/sessions/{sid}/exercises/delayed_picture_recognition/result",
            json={"accuracy": 0.8, "material_id": "pictures-garden"})
    ids = {r["material_id"] for r in c2.get(f"/patients/{pid}/program/today").json()["reviews"]}
    assert ids == {"story:apple-tree-ru", "pictures-garden"}


def test_default_whisper_model_is_small():
    from es_core.transcribe import DEFAULT_MODEL
    assert DEFAULT_MODEL == "small"
