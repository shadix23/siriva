from datetime import date

from tests.conftest import FakeTranscriber, load_fixture


def new_patient(c, consent=True, language="ru"):
    return c.post("/patients", json={"language": language, "consent_voice": consent}).json()["id"]


def new_session(c, pid, day=None):
    body = {"day": day} if day else {}
    return c.post(f"/patients/{pid}/sessions", json=body).json()["session_id"]


def transcript_body(name, **extra):
    d = load_fixture(name).to_dict()
    return {"language": d["language"], "words": d["words"], "duration": d["duration"], **extra}


def test_demo_endpoints(make_client):
    c = make_client()
    demo = c.get("/demo/patients").json()["patients"]
    assert {p["id"] for p in demo} == {"demo-trend", "demo-bypass-a", "demo-bypass-b"}
    sc = c.get("/demo/bypass-scenario").json()
    assert sc["same_memory_score"] and sc["programs_differ"]
    assert sc["speech_exercises_b"] == [] and sc["speech_exercises_a"]
    tr = c.get("/patients/demo-trend/trajectory").json()
    assert len(tr["weeks"]) == 12 and tr["trend_flag"]["active"]
    assert tr["trend_flag"]["domains"] == ["word_access"]
    prof = c.get("/patients/demo-trend/profile").json()
    assert prof["calibration"] == "before_adress_calibration" and prof["has_data"]
    prog = c.get("/patients/demo-trend/program/today").json()
    assert prog["load_source"] == "placeholder, not TRIBE v2" and prog["items"]
    assert c.get("/exercises").json()["matrix"]["is_placeholder"] is True
    assert c.post("/demo/reset").json()["reset"] is True


def test_full_live_flow_with_transcripts(make_client):
    c = make_client(seed_demo=False)
    pid = new_patient(c)
    assert c.get(f"/patients/{pid}/profile").json()["has_data"] is False
    assert c.get(f"/patients/{pid}/program/today").status_code == 409
    sid = new_session(c, pid)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_ru"))
    assert r.status_code == 200
    assert r.json()["features"]["pause_ratio"] is not None and "words" in r.json()["transcript"]
    r = c.post(f"/sessions/{sid}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru"))
    assert r.json()["features"]["fluency_count"] == 13
    imm = c.post(f"/sessions/{sid}/exercises/story_retell/transcript",
                 json=transcript_body("retell_ru_immediate", phase="immediate", story_id="apple-tree-ru"))
    dly = c.post(f"/sessions/{sid}/exercises/story_retell/transcript",
                 json=transcript_body("retell_ru_delayed", phase="delayed", story_id="apple-tree-ru"))
    assert imm.json()["features"]["retell_immediate_frac"] > dly.json()["features"]["retell_delayed_frac"]
    assert 0 < dly.json()["features"]["retell_retention"] < 1
    t = c.post(f"/sessions/{sid}/telemetry", json={"events": [
        {"type": "first_action", "t": 2.5}, {"type": "hint", "t": 10}, {"type": "pause", "t": 12, "value": 3.1},
        {"type": "answer", "t": 20, "value": 1.2}, {"type": "answer", "t": 30, "value": 2.0},
        {"type": "answer", "t": 40, "value": 3.1}, {"type": "interrupt", "t": 50}]})
    assert t.status_code == 201
    sf = t.json()["session_features"]
    assert sf["time_to_first_action_s"] == 2.5 and sf["hints_per_session"] == 1 and "rt_cv" in sf
    done = c.post(f"/sessions/{sid}/complete").json()
    assert done["completed"] and done["profile"]["domains"]["episodic_memory"]["score"] is not None
    prog = c.get(f"/patients/{pid}/program/today").json()
    assert prog["items"] and prog["dose_total"] <= prog["dose_budget"]
    res = c.post(f"/sessions/{sid}/exercises/picture_pair_memory/result", json={"accuracy": 0.9}).json()
    assert res["difficulty_after"] == res["difficulty_before"] + 1


def test_audio_upload_uses_transcriber_and_deletes_file(make_client):
    ft = FakeTranscriber("picture_en_fluent")
    c = make_client(transcriber=ft, seed_demo=False)
    pid = new_patient(c, language="en")
    sid = new_session(c, pid)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("rec.webm", b"fake-bytes", "audio/webm")}, data={"language": "en"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["engine"] == "synthetic" and body["transcript_stored"] is False
    import os
    assert ft.calls and not os.path.exists(ft.calls[0][0])  # raw audio is not kept
    assert body["features"]["word_count"] > 20


def test_errors_bad_data(make_client):
    c = make_client(transcriber=FakeTranscriber("picture_en_fluent"), seed_demo=False)
    pid = new_patient(c)
    sid = new_session(c, pid)
    e = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"", "audio/webm")}, data={"language": "en"})
    assert e.status_code == 422 and e.json()["error"]["code"] == "empty_audio"
    e = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "de"})
    assert e.status_code == 422 and e.json()["error"]["code"] == "validation_error"
    e = c.post(f"/sessions/{sid}/exercises/reaction_tap/transcript", json=transcript_body("picture_en_fluent"))
    assert e.json()["error"]["code"] == "exercise_not_speech_measure"
    e = c.post(f"/sessions/{sid}/exercises/nope/transcript", json=transcript_body("picture_en_fluent"))
    assert e.status_code == 404
    e = c.post(f"/sessions/{sid}/exercises/story_retell/transcript",
               json=transcript_body("retell_ru_delayed", phase="delayed", story_id="apple-tree-ru"))
    assert e.status_code == 409 and e.json()["error"]["code"] == "immediate_missing"
    e = c.post(f"/sessions/{sid}/exercises/story_retell/transcript",
               json=transcript_body("retell_ru_immediate", phase="immediate", story_id="lantern-keeper-en"))
    assert e.json()["error"]["code"] == "story_language_mismatch"
    e = c.post(f"/sessions/{sid}/telemetry", json={"events": []})
    assert e.status_code == 422
    e = c.post(f"/sessions/{sid}/telemetry", json={"events": [{"type": "bogus", "t": 1}]})
    assert e.status_code == 422
    assert c.get("/patients/zzz/profile").json()["error"]["code"] == "patient_not_found"
    assert c.post("/sessions/zzz/complete").status_code == 404


def test_transcription_failure_is_503(make_client):
    c = make_client(transcriber=FakeTranscriber(fail=True), seed_demo=False)
    pid = new_patient(c)
    sid = new_session(c, pid)
    e = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "en"})
    assert e.status_code == 503 and e.json()["error"]["code"] == "transcription_failed"


def test_consent_required_and_withdrawal(make_client):
    c = make_client(transcriber=FakeTranscriber("picture_en_fluent"), seed_demo=False)
    pid = new_patient(c, consent=False)
    sid = new_session(c, pid)
    e = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "en"})
    assert e.status_code == 403 and e.json()["error"]["code"] == "consent_required"
    e = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_en_fluent"))
    assert e.status_code == 403
    assert c.patch(f"/patients/{pid}", json={"consent_voice": True}).json()["consent_voice"] is True


def test_other_patient_cannot_see_foreign_session_data_and_delete_removes_all(make_client):
    """No accounts in MVP: isolation is by ids. A patient's data is reachable only by its own ids; delete wipes it."""
    c = make_client(seed_demo=False)
    p1, p2 = new_patient(c), new_patient(c)
    s1 = new_session(c, p1)
    c.post(f"/sessions/{s1}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru"))
    c.post(f"/sessions/{s1}/telemetry", json={"events": [{"type": "hint", "t": 1}]})
    assert c.get(f"/patients/{p2}/profile").json()["has_data"] is False  # p2 sees nothing of p1
    r = c.delete(f"/patients/{p1}")
    assert r.status_code == 200 and r.json()["removed"] == {"sessions": 1, "exercise_results": 1, "telemetry_events": 1}
    assert c.get(f"/patients/{p1}").status_code == 404
    assert c.post(f"/sessions/{s1}/complete").status_code == 404
    assert c.delete(f"/patients/{p1}").status_code == 404
    assert c.get(f"/patients/{p2}").status_code == 200


def test_delete_demo_then_reset(make_client):
    c = make_client()
    assert c.delete("/patients/demo-trend").status_code == 200
    assert c.get("/patients/demo-trend/trajectory").status_code == 404
    c.post("/demo/reset")
    assert c.get("/patients/demo-trend/trajectory").status_code == 200
