import asyncio
import json
import time

import pytest

from es_core import config
from es_core.matrix import DATA, JsonMatrixLoader, PLAYABLE
from es_core.pictures import BACKYARD, BUS_STOP, SCENES, score_picture
from es_core.synthetic import timed
from es_core.texts import num_ru, weeks_ru
from es_core.transcribe import FasterWhisperTranscriber
from tests.conftest import FakeTranscriber, load_fixture
from tests.test_api import new_patient, new_session, transcript_body


# ---- pictures (R9) ----
def test_scenes_are_well_formed():
    for s in SCENES.values():
        assert 12 <= len(s.units) <= 15
        assert "no text" in s.image_prompt and "1536x1024" in s.image_prompt
        assert any(u.kind == "oddity" for u in s.units)
        assert all(u.ru and u.en for u in s.units)
        assert len({u.id for u in s.units}) == len(s.units)


def test_picture_matching_ru_and_en():
    ru = timed("Женщина с зонтом стоит под дождем. Старик читает газету на скамейке. Мальчик в сапогах прыгает "
               "в лужу, а в луже рыба.", language="ru")
    r = score_picture(ru, BUS_STOP)
    assert {"p01", "p02", "p03", "p04", "p05", "p06", "p07", "p08", "p13"} <= set(r["picture_units_found"])
    assert r["picture_units_total"] == 14
    en = timed("a woman hangs laundry in the wind, a boy with a kite stuck in a tree, a cat on the line", language="en")
    f = score_picture(en, BACKYARD)["picture_units_found"]
    assert {"p01", "p02", "p03", "p04", "p05", "p06", "p10"} <= set(f)
    # whole-word keys: "который" is not "кот"
    assert "p10" not in score_picture(timed("который час", language="ru"), BACKYARD)["picture_units_found"]
    assert score_picture(timed("hello", language="en"), BUS_STOP)["picture_units_found"] == []


def test_picture_id_in_api(make_client):
    c = make_client(seed_demo=False)
    pid = new_patient(c)
    sid = new_session(c, pid)
    body = transcript_body("picture_ru", picture_id="bus-stop-rain")
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=body).json()
    assert r["features"]["picture_units_total"] == 14 and isinstance(r["features"]["picture_units_found"], list)
    assert r["session_features"]["picture_units_count"] == r["features"]["picture_units_count"]
    bad = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_ru", picture_id="x"))
    assert bad.status_code == 404 and bad.json()["error"]["code"] == "picture_not_found"
    assert len(c.get("/pictures").json()["pictures"]) == 2


# ---- retell timing, statuses, session (R3, R4) ----
def retell(c, sid, phase):
    name = "retell_ru_immediate" if phase == "immediate" else "retell_ru_delayed"
    return c.post(f"/sessions/{sid}/exercises/story_retell/transcript",
                  json=transcript_body(name, phase=phase, story_id="apple-tree-ru")).json()


def seed_patient_with_history(c):
    pid = new_patient(c)
    s0 = new_session(c, pid, "2026-11-01")
    c.post(f"/sessions/{s0}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru"))
    c.post(f"/sessions/{s0}/exercises/picture_description/transcript", json=transcript_body("picture_ru"))
    retell(c, s0, "immediate")
    retell(c, s0, "delayed")
    return pid


def test_delayed_available_at_and_statuses(make_client, monkeypatch):
    c = make_client(seed_demo=False)
    pid = seed_patient_with_history(c)
    sid = new_session(c, pid)
    p0 = c.get(f"/patients/{pid}/program/today", params={"session_id": sid, "target": "episodic_memory"}).json()
    ids = [i["exercise_id"] for i in p0["items"]]
    assert "story_retell" in ids and all(i["status"] == "available" for i in p0["items"])
    assert next(i for i in p0["items"] if i["exercise_id"] == "story_retell")["part"] == "immediate"
    imm = retell(c, sid, "immediate")
    assert imm["delayed_available_at"] and imm["delayed_available_at"].endswith("+00:00")
    p1 = c.get(f"/patients/{pid}/program/today", params={"session_id": sid, "target": "episodic_memory"}).json()
    sr = next(i for i in p1["items"] if i["exercise_id"] == "story_retell")
    assert sr["status"] == "waiting" and sr["available_at"] == imm["delayed_available_at"] and sr["part"] == "delayed"
    assert p1["next_exercise_id"] != "story_retell"
    s = c.get(f"/sessions/{sid}").json()
    assert s["retell"]["delayed_available_at"] == imm["delayed_available_at"]
    assert [e["exercise_id"] for e in s["exercises"]] == ["story_retell"] and s["exercises"][0]["done_at"]


def test_delayed_becomes_available_and_done(make_client, monkeypatch):
    monkeypatch.setattr(config, "DELAYED_RETELL_MINUTES", 0.0)
    c = make_client(seed_demo=False)
    pid = seed_patient_with_history(c)
    sid = new_session(c, pid)
    retell(c, sid, "immediate")
    time.sleep(1.1)
    p = c.get(f"/patients/{pid}/program/today", params={"session_id": sid, "target": "episodic_memory"}).json()
    sr = next(i for i in p["items"] if i["exercise_id"] == "story_retell")
    assert sr["status"] == "available" and sr["part"] == "delayed"
    d = retell(c, sid, "delayed")
    assert d["features"]["retell_delay_min"] >= 0
    p = c.get(f"/patients/{pid}/program/today", params={"session_id": sid, "target": "episodic_memory"}).json()
    assert next(i for i in p["items"] if i["exercise_id"] == "story_retell")["status"] == "done"
    other = new_patient(c)
    assert c.get(f"/patients/{other}/program/today", params={"session_id": sid}).status_code in (404, 409)
    assert c.get("/sessions/nope").status_code == 404


# ---- telemetry meta (R5) ----
def test_telemetry_meta_and_new_types(make_client):
    c = make_client(seed_demo=False)
    sid = new_session(c, new_patient(c))
    ok = c.post(f"/sessions/{sid}/telemetry", json={"events": [
        {"type": "hint_offered", "t": 7.0}, {"type": "hint_used", "t": 9.0},
        {"type": "story_replayed", "t": 3.0, "meta": {"count": 1}}, {"type": "story_text_shown", "t": 4.0},
        {"type": "mic_error", "t": 0.0, "meta": {"reason": "denied"}},
        {"type": "stop_reason", "t": 60.0, "meta": {"reason": "timeout"}},
        {"type": "stop_reason", "t": 61.0, "meta": {"reason": "idle_timeout"}}]})
    assert ok.status_code == 201
    f = ok.json()["session_features"]
    assert f["hints_offered_count"] == 1 and f["hints_per_session"] == 1 and f["story_text_shown_count"] == 1
    assert f["story_replayed_count"] == 1 and f["mic_error_count"] == 1
    for bad in ({"type": "stop_reason", "t": 1}, {"type": "stop_reason", "t": 1, "meta": {"reason": "bored"}},
                {"type": "mic_error", "t": 1, "meta": {"reason": "denied2"}}):
        r = c.post(f"/sessions/{sid}/telemetry", json={"events": [bad]})
        assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"


# ---- texts (R6) ----
def test_russian_texts_format(make_client):
    assert weeks_ru(1) == "1 неделя" and weeks_ru(3) == "3 недели" and weeks_ru(12) == "12 недель"
    assert weeks_ru(21) == "21 неделя" and weeks_ru(11) == "11 недель"
    assert num_ru(0.8) == "0,80"
    c = make_client()
    tr = c.get("/patients/demo-trend/trajectory").json()
    flag = tr["trend_flag"]
    assert "12 недель" in flag["message"] and "нед." not in flag["message"]
    assert flag["code"] == "trend_watch" and flag["message_params"] == {"weeks": 12, "domains": ["word_access"]}
    assert "«Доступ к слову»" in flag["message"]
    prog = c.get("/patients/demo-bypass-b/program/today", params={"target": "episodic_memory"}).json()
    it = prog["items"][0]
    assert "0," in it["rationale"] and "0." not in it["rationale"].replace("0.0", "")
    assert it["rationale_params"]["target_domain"] == "episodic_memory"
    assert prog["summary_code"] == "bypass" and "avoid_domains" in prog["summary_params"]
    prof = c.get("/patients/demo-trend/profile").json()
    assert prof["domains"]["word_access"]["label_ru"] == "Доступ к слову"
    sc = c.get("/demo/bypass-scenario").json()
    assert sc["explanation_code"] == "bypass_demo"


# ---- consent_share (R7) ----
def test_consent_share_gates_trajectory(make_client):
    c = make_client()
    p = c.post("/patients", json={"language": "ru", "consent_voice": True, "consent_version": "v1"}).json()
    assert p["consent_share"] is False and p["consent_version"] == "v1" and p["consent_at"]
    r = c.get(f"/patients/{p['id']}/trajectory")
    assert r.status_code == 403 and r.json()["error"]["code"] == "share_not_allowed"
    up = c.patch(f"/patients/{p['id']}", json={"consent_share": True}).json()
    assert up["consent_share"] is True and up["consent_voice"] is True
    assert c.get(f"/patients/{p['id']}/trajectory").status_code == 200
    none = c.post("/patients", json={}).json()
    assert none["consent_at"] is None
    demo = c.get("/patients/demo-trend").json()
    assert demo["consent_share"] is True and demo["label"] == "Сауле, 68 лет" and demo["is_demo"] is True


# ---- category (R10), health (R11), timeout (R13) ----
def test_category_default_and_unsupported(make_client):
    c = make_client(seed_demo=False)
    sid = new_session(c, new_patient(c))
    r = c.post(f"/sessions/{sid}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru")).json()
    assert r["category"] == "animals"
    bad = c.post(f"/sessions/{sid}/exercises/naming_fluency/transcript",
                 json=transcript_body("animals_ru", category="fruits"))
    assert bad.status_code == 422


def test_health_transcriber_ready_only_after_warmup(make_client):
    assert make_client(transcriber=FakeTranscriber("animals_ru")).get("/health").json()["transcriber_ready"] is True
    tr = FasterWhisperTranscriber("base")
    c = make_client(transcriber=tr)
    h = c.get("/health").json()
    assert h["transcriber_ready"] is False and h["transcriber_state"] == "cold" and h["transcriber_model"] == "base"
    tr._warm, tr.state = True, "ready"
    assert c.get("/health").json()["transcriber_ready"] is True


def test_warmup_runs_in_background_on_startup(make_client):
    import threading

    class Warm(FakeTranscriber):
        state = "cold"
        error = None
        done = threading.Event()

        def ready(self):
            return self.done.is_set()

        def warmup(self):
            self.state = "warming"
            time.sleep(0.3)
            self.state = "ready"
            self.done.set()

    tr = Warm("animals_ru")
    c = make_client(transcriber=tr)
    with c:
        first = c.get("/health").json()
        assert first["transcriber_ready"] is False  # startup does not block on the warm-up
        assert tr.done.wait(3)
        assert c.get("/health").json()["transcriber_ready"] is True


def test_default_model_is_base_and_batched():
    from es_core.transcribe import DEFAULT_MODEL
    tr = FasterWhisperTranscriber()
    assert DEFAULT_MODEL == "small" and tr.batch_size == 8 and tr.beam_size == 1


def test_transcription_timeout_is_503(make_client, monkeypatch):
    class Slow(FakeTranscriber):
        def transcribe(self, path, language):
            time.sleep(3.0)
            return super().transcribe(path, language)

    monkeypatch.setattr(config, "TRANSCRIBE_TIMEOUT_S", 0.2)
    c = make_client(transcriber=Slow("picture_ru"), seed_demo=False)
    sid = new_session(c, new_patient(c))
    t0 = time.time()
    with c:  # persistent event loop, like uvicorn (a one-shot loop would wait for the worker thread)
        r = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
                   files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "ru"})
        took = time.time() - t0
    assert took < 1.0
    assert r.status_code == 503 and r.json()["error"]["details"] == {"reason": "timeout"}


# ---- demo numbers (R12) ----
def test_demo_numbers_pending_and_agreement(make_client, tmp_path):
    c = make_client()
    n = c.get("/demo/numbers").json()
    assert n["adress"]["status"] == "pending" and n["adress"]["accuracy"] is None
    assert n["adress"]["test_n"] == 48 and n["adress"]["baseline"] == 0.75
    assert n["agreement"] == {"status": "pending", "value": None, "method": None}
    raw = json.loads(JsonMatrixLoader(DATA / "load_matrix.placeholder.json").path.read_text())
    raw["source"] = "TRIBE v2 test file"
    p = tmp_path / "real.json"
    p.write_text(json.dumps(raw))
    from es_api.main import create_app
    from fastapi.testclient import TestClient
    c2 = TestClient(create_app(tmp_path / "x.db", matrix_loader=JsonMatrixLoader(p), seed_demo=False))
    ag = c2.get("/demo/numbers").json()["agreement"]
    assert ag["status"] == "ready" and ag["value"] == pytest.approx(1.0) and "Spearman" in ag["method"]
    assert c2.get("/health").json()["load_is_placeholder"] is False
    # inverted matrix: strongly negative
    for row in raw["loads"].values():
        for d in row:
            row[d] = round(1 - row[d], 3)
    p.write_text(json.dumps(raw))
    c3 = TestClient(create_app(tmp_path / "y.db", matrix_loader=JsonMatrixLoader(p), seed_demo=False))
    assert c3.get("/demo/numbers").json()["agreement"]["value"] < -0.9


# ---- playable / only (R15) ----
def test_playable_and_only(make_client):
    c = make_client()
    ex = c.get("/exercises").json()["exercises"]
    assert {e["id"] for e in ex if e["playable"]} == set(PLAYABLE) and len(PLAYABLE) == 5
    assert {"spatial_sequence_recall", "delayed_picture_recognition"} < PLAYABLE
    prog = c.get("/patients/demo-bypass-b/program/today", params={"target": "episodic_memory", "only": "playable"}).json()
    got = [i["exercise_id"] for i in prog["items"]]
    assert got and set(got) <= PLAYABLE and "spatial_sequence_recall" in got and not any(i["speech_output"] for i in prog["items"])
    one = c.get("/patients/demo-bypass-b/program/today", params={"only": "delayed_picture_recognition,spatial_sequence_recall",
                                                                  "target": "episodic_memory"}).json()
    assert {i["exercise_id"] for i in one["items"]} <= {"delayed_picture_recognition", "spatial_sequence_recall"}
    bad = c.get("/patients/demo-bypass-b/program/today", params={"only": "nope"})
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_only"
    # active days for P1 do not depend on the share consent
    assert "active_days_last_7" in prog


# ---- switching to the TRIBE v2 matrix by one variable ----
def fake_tribe_matrix(path):
    """A stand-in for es/tribe/out/load_matrix.tribe_v2.json (temporary file, never committed)."""
    import random
    rnd = random.Random(5)
    raw = json.loads((DATA / "load_matrix.placeholder.json").read_text())
    raw.update({"source": "TRIBE v2 predicted load", "label_ru": "Предсказанная нагрузка модели TRIBE v2",
                "model_version": "tribev2-fake", "atlas": "fake-atlas"})
    for row in raw["loads"].values():
        for d in row:
            row[d] = round(min(1.0, max(0.0, row[d] + rnd.uniform(-0.25, 0.25))), 3)
    path.write_text(json.dumps(raw, ensure_ascii=False))
    return path


def test_es_load_matrix_switches_source_everywhere(tmp_path, monkeypatch):
    from es_api.main import create_app
    from fastapi.testclient import TestClient
    monkeypatch.setenv("ES_LOAD_MATRIX", str(fake_tribe_matrix(tmp_path / "load_matrix.tribe_v2.json")))
    c = TestClient(create_app(tmp_path / "t.db"))  # default loader: only the env variable decides
    h = c.get("/health").json()
    assert h["load_source"] == "TRIBE v2 predicted load" and h["load_is_placeholder"] is False
    assert h["load_label"] == "Предсказанная нагрузка модели TRIBE v2"
    ex = c.get("/exercises").json()
    assert ex["matrix"]["source"] == "TRIBE v2 predicted load" and ex["matrix"]["model_version"] == "tribev2-fake"
    assert len(ex["exercises"]) == 25
    n = c.get("/demo/numbers").json()
    assert n["load_source"] == "TRIBE v2 predicted load" and n["agreement"]["status"] == "ready"
    assert -1.0 <= n["agreement"]["value"] <= 1.0 and n["agreement"]["atlas"] == "fake-atlas"
    sc = c.get("/demo/bypass-scenario").json()
    assert sc["load_source"] == "TRIBE v2 predicted load" and "предсказанная нагрузка модели TRIBE v2" in sc["explanation"]
    assert "предварительная" not in sc["explanation"] and "predicted load" not in sc["explanation"]
    prog = c.get("/patients/demo-trend/program/today").json()
    assert prog["load_source"] == "TRIBE v2 predicted load" and prog["items"]
    # and back: without the variable the placeholder is honest about itself
    monkeypatch.delenv("ES_LOAD_MATRIX")
    c2 = TestClient(create_app(tmp_path / "t2.db"))
    sc2 = c2.get("/demo/bypass-scenario").json()
    assert sc2["load_source"] == "placeholder, not TRIBE v2" and "предварительная" in sc2["explanation"]
    assert "placeholder" not in sc2["explanation"]
    assert c2.get("/demo/numbers").json()["agreement"]["status"] == "pending"


# ---- no profile from telemetry alone ----
def test_telemetry_alone_gives_no_profile_or_program(make_client):
    c = make_client(seed_demo=False)
    pid = new_patient(c)
    sid = new_session(c, pid)
    c.post(f"/sessions/{sid}/telemetry", json={"events": [{"type": "mic_error", "t": 0, "meta": {"reason": "denied"}},
                                                          {"type": "first_action", "t": 1.0}]})
    prof = c.get(f"/patients/{pid}/profile").json()
    assert prof["has_data"] is False and all(d["score"] is None for d in prof["domains"].values())
    r = c.get(f"/patients/{pid}/program/today", params={"session_id": sid})
    assert r.status_code == 409 and r.json()["error"]["code"] == "no_profile_yet"
    assert c.post(f"/sessions/{sid}/complete").json()["profile"]["has_data"] is False
    # one non-speech result is enough to start (it comes with its telemetry)
    c.post(f"/sessions/{sid}/exercises/spatial_sequence_recall/result", json={"accuracy": 0.8, "duration_s": 90})
    c.post(f"/sessions/{sid}/telemetry", json={"events": [{"type": "first_action", "t": 2.0, "exercise_id": "spatial_sequence_recall"}]})
    assert c.get(f"/patients/{pid}/profile").json()["has_data"] is True
    # a speech exercise also starts it
    pid2 = new_patient(c)
    s2 = new_session(c, pid2)
    c.post(f"/sessions/{s2}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru"))
    assert c.get(f"/patients/{pid2}/profile").json()["has_data"] is True


# ---- V-03: patient path matches the bypass frame ----
def test_patient_b_default_path_is_bypass_with_both_nonspeech(make_client):
    c = make_client()
    prog = c.get("/patients/demo-bypass-b/program/today", params={"only": "playable"}).json()
    ids = [i["exercise_id"] for i in prog["items"]]
    assert prog["target_domain"] == "episodic_memory"          # lowest function that is not damaged
    assert set(prog["avoid_domains"]) == {"word_access", "phrase_building"}
    assert {"spatial_sequence_recall", "delayed_picture_recognition"} <= set(ids)
    assert not any(i["speech_output"] for i in prog["items"]) and prog["dose_total"] > 6
    # same meaning as the D4 frame (full library, same patient)
    d4 = c.get("/demo/bypass-scenario").json()["patients"][1]["program"]
    assert d4["target_domain"] == prog["target_domain"] and d4["avoid_domains"] == prog["avoid_domains"]
    assert {"spatial_sequence_recall", "delayed_picture_recognition"} <= {i["exercise_id"] for i in d4["items"]}
    # patient A and the trend patient keep their meaning
    a = c.get("/patients/demo-bypass-a/program/today").json()
    assert a["target_domain"] == "episodic_memory" and a["avoid_domains"] == []
    t = c.get("/patients/demo-trend/program/today").json()
    assert t["target_domain"] == "word_access" and t["avoid_domains"] == []
    # damaged flag in the profile
    p = c.get("/patients/demo-bypass-b/profile").json()
    assert p["domains"]["word_access"]["damaged"] is True and p["domains"]["episodic_memory"]["damaged"] is False


def test_planner_tops_up_budget_and_default_target_rules():
    from es_core import planner
    from es_core.matrix import load_exercises
    M = JsonMatrixLoader(DATA / "load_matrix.placeholder.json").load()
    E = load_exercises()
    allbad = {"episodic_memory": 10, "word_access": 5, "phrase_building": 20, "attention": 15, "processing_speed": 12}
    t, avoid = planner.pick_target_and_avoid(allbad)
    assert t == "word_access" and set(avoid) == {"episodic_memory", "phrase_building", "attention", "processing_speed"}
    fine = {"episodic_memory": 60, "word_access": 50, "phrase_building": 70, "attention": 80, "processing_speed": 90}
    assert planner.pick_target_and_avoid(fine) == ("word_access", [])
    prog = planner.plan_program(fine, E, M, budget=18)
    assert prog["dose_total"] > 12  # topped up towards the budget


# ---- V-04: silence is not an exercise ----
def test_silence_and_too_short_speech_are_rejected_and_not_stored(make_client):
    from es_core.types import Transcript
    c = make_client(seed_demo=False)
    pid = new_patient(c)
    sid = new_session(c, pid)
    silent = {"language": "ru", "words": [], "duration": 20.0}
    for ex in ("picture_description", "naming_fluency", "story_retell"):
        r = c.post(f"/sessions/{sid}/exercises/{ex}/transcript",
                   json={**silent, "phase": "immediate", "story_id": "apple-tree-ru"})
        assert r.status_code == 422 and r.json()["error"]["code"] == "empty_audio", ex
    short = {"language": "ru", "duration": 5.0, "words": [{"text": "ну", "start": 1, "end": 1.2}, {"text": "вот", "start": 2, "end": 2.2}]}
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=short)
    assert r.status_code == 422 and r.json()["error"]["code"] == "speech_too_short" and r.json()["error"]["details"]["min_words"] == 3
    # nothing was stored: no exercises in the session, no profile
    assert c.get(f"/sessions/{sid}").json()["exercises"] == []
    assert c.get(f"/patients/{pid}/profile").json()["has_data"] is False
    # naming with few words is a real (low) result, not an error
    few = {"language": "ru", "duration": 60.0, "words": [{"text": "собака", "start": 5, "end": 5.5}]}
    assert c.post(f"/sessions/{sid}/exercises/naming_fluency/transcript", json=few).status_code == 200


def test_silent_audio_upload_is_422(make_client):
    from es_core.types import Transcript

    class Silent(FakeTranscriber):
        def transcribe(self, path, language):
            return Transcript(words=[], language=language, duration=20.0, engine="fake")

    c = make_client(transcriber=Silent(), seed_demo=False)
    sid = new_session(c, new_patient(c))
    r = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "ru"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "empty_audio"
    assert c.get(f"/sessions/{sid}").json()["exercises"] == []


# ---- V-13: no server paths in errors ----
def test_503_details_do_not_leak_paths(make_client):
    c = make_client(transcriber=FakeTranscriber(fail=True), seed_demo=False)
    sid = new_session(c, new_patient(c))
    r = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "ru"})
    assert r.status_code == 503
    assert r.json()["error"]["details"] == {"reason": "failed"} and "/" not in r.text.split("details")[1]


# ---- hybrid matrix (TRIBE where validated, task-type estimate elsewhere) ----
def fake_tribe_audio(path):
    """TRIBE-like: z-scored loads squeezed to 0..1, so screen tasks sit near 0.3 on language domains (not 0)."""
    import random
    rnd = random.Random(9)
    raw = json.loads((DATA / "load_matrix.placeholder.json").read_text())
    speech = {"story_retell", "picture_description", "naming_fluency", "word_list_recall_spoken", "naming_from_definition",
              "picture_naming", "sentence_completion_spoken", "describe_daily_routine", "read_aloud_short_text"}
    for ex, row in raw["loads"].items():
        sp = ex in speech
        row["word_access"] = round((0.8 if sp else 0.3) + rnd.uniform(-0.1, 0.1), 4)
        row["phrase_building"] = round((0.8 if sp else 0.3) + rnd.uniform(-0.1, 0.1), 4)
        row["attention"] = round((0.3 if sp else 0.65) + rnd.uniform(-0.1, 0.1), 4)
        row["episodic_memory"] = round(rnd.random(), 4)     # noise, as in the real audio-only run
        row["processing_speed"] = round(rnd.random(), 4)
    raw.update({"source": "TRIBE v2 predicted load", "label_ru": "TRIBE", "model_version": "fake", "atlas": "fake",
                "metadata": {"modalities_computed": ["audio"]}})
    path.write_text(json.dumps(raw, ensure_ascii=False))
    return path


def build_hybrid_for_test(tmp_path, scale="quantile"):
    import importlib.util
    spec = importlib.util.spec_from_file_location("bh", str(DATA.parent.parent / "scripts" / "build_hybrid_matrix.py"))
    bh = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bh)
    tribe = fake_tribe_audio(tmp_path / "tribe.json")
    out = tmp_path / "hybrid.json"
    bh.build(tribe, tmp_path / "val.md", out, bh.DEFAULT_TRIBE_DOMAINS, scale)
    return out


def test_hybrid_matrix_keeps_bypass_demo_and_labels_sources(tmp_path):
    from es_api.main import create_app
    from fastapi.testclient import TestClient
    out = build_hybrid_for_test(tmp_path)
    raw = json.loads(out.read_text())
    ds = raw["metadata"]["domain_sources"]
    assert ds == {"episodic_memory": "task_type_estimate", "word_access": "tribe_v2", "phrase_building": "tribe_v2",
                  "attention": "tribe_v2", "processing_speed": "task_type_estimate"}
    ph = json.loads((DATA / "load_matrix.placeholder.json").read_text())["loads"]
    assert all(raw["loads"][e]["episodic_memory"] == ph[e]["episodic_memory"] for e in ph)   # not from TRIBE
    assert raw["label_ru"] == "Нагрузка на речь и внимание: TRIBE v2; на память и скорость: оценка по типу задания"
    c = TestClient(create_app(tmp_path / "t.db", matrix_loader=JsonMatrixLoader(out)))
    h = c.get("/health").json()
    assert h["load_label"] == raw["label_ru"] and h["load_is_placeholder"] is False
    assert "TRIBE v2" in h["load_source"] and not h["load_source"].isascii()      # Russian text, not a raw code
    sc = c.get("/demo/bypass-scenario").json()
    assert sc["programs_differ"] is True and sc["speech_exercises_b"] == []
    b = sc["patients"][1]["program"]
    assert b["items"] and sc["patients"][0]["program"]["items"]
    assert "Источник нагрузки: нагрузка на речь и внимание" in sc["explanation"]
    pb = c.get("/patients/demo-bypass-b/program/today", params={"only": "playable"}).json()
    assert pb["items"] and not any(i["speech_output"] for i in pb["items"])
    ag = c.get("/demo/numbers").json()["agreement"]
    assert ag["status"] == "ready" and set(ag["domains_in_mean"]) == {"word_access", "phrase_building", "attention"}
    assert ag["domain_sources"]["episodic_memory"] == "task_type_estimate" and "note" in ag
    mean = sum(ag["per_domain"][d] for d in ag["domains_in_mean"]) / 3
    assert ag["value"] == pytest.approx(mean, abs=0.002)
    assert c.get("/exercises").json()["matrix"]["is_hybrid"] is True


def test_raw_scale_hybrid_shows_why_the_default_rescales(tmp_path):
    """Raw TRIBE magnitudes put 0.3 of 'word_access' on screen tasks and empty patient B's program."""
    from es_api.main import create_app
    from fastapi.testclient import TestClient
    out = build_hybrid_for_test(tmp_path, scale="raw")
    c = TestClient(create_app(tmp_path / "t.db", matrix_loader=JsonMatrixLoader(out)))
    assert c.get("/demo/bypass-scenario").json()["patients"][1]["program"]["items"] == []


def test_real_hybrid_file_if_present():
    real = DATA.parent.parent.parent / "tribe" / "out" / "load_matrix.hybrid.json"
    if not real.exists():
        pytest.skip("no es/tribe/out/load_matrix.hybrid.json")
    import tempfile
    from es_api.main import create_app
    from fastapi.testclient import TestClient
    with tempfile.TemporaryDirectory() as d:
        c = TestClient(create_app(f"{d}/t.db", matrix_loader=JsonMatrixLoader(real)))
        sc = c.get("/demo/bypass-scenario").json()
        assert sc["programs_differ"] and sc["speech_exercises_b"] == [] and sc["patients"][1]["program"]["items"]


def test_unknown_or_foreign_session_id_is_ignored_in_program(make_client):
    c = make_client()
    base = c.get("/patients/demo-bypass-a/program/today").json()
    assert base["session_ignored"] is False
    for sid in ("ss_doesnotexist", None):
        if sid is None:  # a real session of another patient
            other = new_session(c, "demo-bypass-b")
            sid = other
        r = c.get("/patients/demo-bypass-a/program/today", params={"session_id": sid})
        assert r.status_code == 200
        j = r.json()
        assert j["session_ignored"] is True and j["session_id"] is None
        assert [i["status"] for i in j["items"]] == ["available"] * len(j["items"])
        assert [i["exercise_id"] for i in j["items"]] == [i["exercise_id"] for i in base["items"]]
    # a valid own session still works and is not ignored
    own = new_session(c, "demo-bypass-a")
    ok = c.get("/patients/demo-bypass-a/program/today", params={"session_id": own}).json()
    assert ok["session_ignored"] is False and ok["session_id"] == own
    # GET /sessions/{sid} keeps its 404
    assert c.get("/sessions/ss_doesnotexist").status_code == 404
