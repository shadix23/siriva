import re
from pathlib import Path

import pytest

from es_core import research_classifier as rc
from tests.conftest import FakeTranscriber, load_fixture
from tests.test_api import new_patient, new_session, transcript_body

BANNED = re.compile(r"диагноз|болезн|деменци|альцгеймер|alzheimer|dementia|diagnos", re.I)


class FakeClf:
    name = rc.MODEL_ID
    state = "ready"

    def __init__(self, score=0.83, ready=True, fail=False):
        self._s, self._ready, self.fail, self.texts = score, ready, fail, []

    def ready(self):
        return self._ready

    def score(self, text):
        self.texts.append(text)
        if self.fail:
            raise RuntimeError("boom")
        return self._s


def en_session(c):
    pid = new_patient(c, language="en")
    return pid, new_session(c, pid)


def test_block_for_english_picture_description(make_client):
    clf = FakeClf(0.83)
    c = make_client(research_classifier=clf)
    pid, sid = en_session(c)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_en_fluent")).json()
    b = r["research_classifier"]
    assert b["model"] == "vjsyong/xlm-roberta-dementia_detection" and b["license"] == "MIT" and b["score"] == 0.83
    assert b["label_ru"] == "Исследовательская модель, точность не подтверждена. Не медицинское заключение"
    assert b["reported"] == "заявлена только точность на обучающих данных 0,896, проверочной оценки нет"
    assert b["class_ru"] == "паттерн нарушений" and b["class_code"] == "pattern"
    assert "woman" in clf.texts[0]
    low = rc.block(0.1)
    assert low["class_ru"] == "контроль" and low["class_code"] == "control"


def test_audio_endpoint_has_the_block_too(make_client):
    c = make_client(transcriber=FakeTranscriber("picture_en_fluent"), research_classifier=FakeClf(0.2))
    pid, sid = en_session(c)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/audio",
               files={"file": ("a.webm", b"x", "audio/webm")}, data={"language": "en"}).json()
    assert r["research_classifier"]["score"] == 0.2 and r["research_classifier"]["class_ru"] == "контроль"


def test_russian_has_no_block_but_a_reason(make_client):
    clf = FakeClf()
    c = make_client(research_classifier=clf)
    pid = new_patient(c)
    sid = new_session(c, pid)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_ru")).json()
    assert r["research_classifier"] is None and r["research_classifier_reason"] == "english_only"
    assert r["research_classifier_reason_ru"] == "Модель только для английской речи" and clf.texts == []


def test_not_ready_disabled_and_error_never_break_the_exercise(make_client):
    for clf, reason in ((FakeClf(ready=False), "model_not_ready"), (None, "disabled"), (FakeClf(fail=True), "error")):
        c = make_client(research_classifier=clf)
        pid, sid = en_session(c)
        r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_en_fluent"))
        assert r.status_code == 200 and r.json()["research_classifier"] is None
        assert r.json()["research_classifier_reason"] == reason


def test_score_never_reaches_profile_program_or_other_exercises(make_client):
    c = make_client(research_classifier=FakeClf(0.99))
    pid, sid = en_session(c)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_en_fluent")).json()
    assert not any("classifier" in k or k == "score" for k in r["features"]) and \
        not any("classifier" in k for k in r["session_features"])
    c.post(f"/sessions/{sid}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru"))
    prof = c.get(f"/patients/{pid}/profile")
    prog = c.get(f"/patients/{pid}/program/today")
    s = c.get(f"/sessions/{sid}")
    for resp in (prof, prog, s):
        assert "classifier" not in resp.text and "0.99" not in resp.text
    nf = c.post(f"/sessions/{sid}/exercises/naming_fluency/transcript", json=transcript_body("animals_ru")).json()
    assert "research_classifier" not in nf
    # the demo patients too
    for u in ("/patients/demo-trend/profile", "/patients/demo-trend/trajectory", "/patients/demo-trend/program/today"):
        assert "classifier" not in c.get(u).text


def test_demo_numbers_research_model_meta_and_own_result_still_pending(make_client):
    c = make_client(research_classifier=FakeClf())
    a = c.get("/demo/numbers").json()["adress"]
    assert a["status"] == "pending" and a["accuracy"] is None
    m = a["research_model"]
    assert m["model"] == rc.MODEL_ID and m["license"] == "MIT" and m["own_result"] is False and m["ready"] is True
    assert m["label_ru"] == rc.LABEL_RU and m["reported"] == rc.REPORTED_RU and "score" not in m


def test_health_reports_classifier_state(make_client):
    assert make_client(research_classifier=None).get("/health").json()["research_classifier_state"] == "disabled"
    h = make_client(research_classifier=FakeClf()).get("/health").json()
    assert h["research_classifier_ready"] is True and h["research_classifier_state"] == "ready"


def test_texts_have_no_banned_words(make_client):
    for text in (rc.LABEL_RU, rc.REPORTED_RU, rc.ONLY_ENGLISH_RU, *rc.CLASS_RU.values()):
        assert not BANNED.search(text)
    c = make_client(research_classifier=FakeClf())
    pid, sid = en_session(c)
    r = c.post(f"/sessions/{sid}/exercises/picture_description/transcript", json=transcript_body("picture_en_fluent"))
    # the technical Hugging Face id in `model` is the only place with the model's own name; screens use `model_display`
    scrub = lambda t: t.replace(rc.MODEL_ID, "")
    assert not BANNED.search(scrub(r.text)) and not BANNED.search(scrub(c.get("/demo/numbers").text))
    assert not BANNED.search(rc.MODEL_DISPLAY)


# manual run on the real model (needs the converted weights in models/, ~20 s warm-up); skipped otherwise
REAL = rc.MODEL_DIR / "model.safetensors"


@pytest.mark.skipif(not REAL.exists(), reason="research classifier weights are not downloaded")
def test_real_model_on_english_fixtures():
    clf = rc.ResearchClassifier()
    clf.warmup()
    assert clf.ready()
    fluent = clf.score(load_fixture("picture_en_fluent").text)
    hesitant = clf.score(load_fixture("picture_en_hesitant").text)
    assert 0 <= fluent <= 1 and 0 <= hesitant <= 1 and hesitant > fluent
    import time
    t = time.time()
    clf.score(load_fixture("picture_en_fluent").text)
    assert time.time() - t < 1.0
