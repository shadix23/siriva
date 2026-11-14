"""Siriva API (FastAPI + SQLite). Contract: es/docs/API-CONTRACT.md. No accounts: a patient is a record with an id."""
from __future__ import annotations

import asyncio
import json
import os
import statistics
import tempfile
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, Form, Query, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator

from es_core import config, forgetting, irt, planner, research_classifier as rc, retell, trend
from es_core.texts import num_ru
from es_core.agreement import METHOD as METHOD_AGREEMENT, spearman_agreement
from es_core.pictures import SCENES, get_scene, score_picture
from es_core.features import extract_speech_features
from es_core.fluency import analyze_fluency
from es_core.matrix import DATA, PLAYABLE, MatrixLoader, JsonMatrixLoader, load_exercises
from es_core.profile import build_profile, median_features, scores, DOMAIN_LABEL_RU
from es_core.stories import STORIES, get_story
from es_core.synthetic import demo_bypass_histories, demo_trend_history
from es_core.transcribe import Transcriber, TranscriptionError, get_transcriber
from es_core.types import DOMAINS, SUPPORTED_LANGUAGES, Transcript, Word

from .db import Db, dumps, now

Language = Literal["en", "ru"]
MAX_AUDIO_BYTES = 25 * 1024 * 1024
PROFILE_WINDOW_DAYS = config.PROFILE_WINDOW_DAYS
MAX_WEEKS = config.MAX_WEEKS
DEMO_IDS = {"trend": "demo-trend", "a": "demo-bypass-a", "b": "demo-bypass-b"}
TRAJECTORY_METRICS = ("pause_before_content_mean", "fluency_count", "retell_retention", "speech_rate_wpm",
                      "time_to_first_action_s")
SPEECH_MEASURES = ("picture_description", "naming_fluency", "story_retell")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status, self.code, self.message, self.details = status, code, message, details


# ---------- request bodies ----------
class PatientIn(BaseModel):
    language: Language = "ru"
    label: str | None = Field(None, max_length=80)
    consent_voice: bool = False
    consent_share: bool = False  # may a close person see the dynamics
    consent_version: str | None = Field(None, max_length=40)  # version of the consent text shown


class PatientPatch(BaseModel):
    consent_voice: bool | None = None
    consent_share: bool | None = None
    consent_version: str | None = Field(None, max_length=40)


class SessionIn(BaseModel):
    day: date | None = None  # for demos and tests; default is today


EVENT_TYPES = ("first_action", "pause", "hint", "interrupt", "answer", "hint_offered", "hint_used",
               "story_replayed", "story_text_shown", "mic_error", "stop_reason")
META_REASONS = {"stop_reason": {"user", "timeout", "interrupted", "idle_timeout"}, "mic_error": {"denied", "not_found", "busy"}}


class TelemetryEvent(BaseModel):
    type: Literal["first_action", "pause", "hint", "interrupt", "answer", "hint_offered", "hint_used",
                  "story_replayed", "story_text_shown", "mic_error", "stop_reason"]
    t: float = Field(ge=0, description="seconds since the start of the exercise")
    value: float | None = Field(None, ge=0, description="pause: seconds; answer: latency in seconds")
    exercise_id: str | None = None
    meta: dict[str, str | int | float | bool] | None = Field(None, max_length=10)

    @model_validator(mode="after")
    def _meta_reason(self):
        allowed = META_REASONS.get(self.type)
        if allowed and (not self.meta or self.meta.get("reason") not in allowed):
            raise ValueError(f"meta.reason for {self.type} must be one of {sorted(allowed)}")
        return self


class TelemetryIn(BaseModel):
    events: list[TelemetryEvent] = Field(min_length=1, max_length=500)


class WordIn(BaseModel):
    text: str
    start: float = Field(ge=0)
    end: float = Field(ge=0)


class TranscriptIn(BaseModel):
    language: Language
    words: list[WordIn] = Field(max_length=3000)
    duration: float | None = None
    phase: Literal["immediate", "delayed"] | None = None
    story_id: str | None = None
    picture_id: str | None = None
    category: Literal["animals"] = "animals"


class ResultIn(BaseModel):
    accuracy: float = Field(ge=0, le=1)
    duration_s: float | None = Field(None, ge=0)
    level: int | None = Field(None, ge=1, le=5, description="difficulty level that was played (the program's `difficulty`)")
    trials: int | None = Field(None, ge=1, le=60, description="how many attempts the accuracy is based on (default 6)")
    material_id: str | None = Field(None, max_length=60, description="fixed material that is repeated (picture set, sequence)")


# ---------- helpers ----------
def _err(status, code, message, details=None):
    raise ApiError(status, code, message, details)


def create_app(db_path: str | Path | None = None, transcriber: Transcriber | None = None,
               matrix_loader: MatrixLoader | None = None, seed_demo: bool = True,
               research_classifier="auto") -> FastAPI:
    db_path = db_path or os.environ.get("ES_DB_PATH") or Path(__file__).resolve().parent.parent / "data" / "es.sqlite3"
    db = Db(db_path)
    matrix = (matrix_loader or JsonMatrixLoader()).load()
    exercises = {e.id: e for e in load_exercises()}
    store_transcripts = os.environ.get("ES_STORE_TRANSCRIPTS") == "1"
    state = {"transcriber": transcriber}
    if research_classifier == "auto":  # real model only when enabled and the weights are on disk
        research_classifier = rc.ResearchClassifier() if rc.enabled() and (rc.MODEL_DIR / "model.safetensors").exists() else None
    clf = research_classifier

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        # warm the speech model in the background so the first request on stage is not slow
        tr = get_tr()
        if os.environ.get("ES_WARMUP", "1") != "0" and hasattr(tr, "warmup"):
            def _warm():
                try:
                    tr.warmup()
                except Exception as e:  # reported in /health
                    print(f"[es] model warm-up failed: {e}", flush=True)
            threading.Thread(target=_warm, name="es-warmup", daemon=True).start()
        if clf is not None and hasattr(clf, "warmup") and os.environ.get("ES_WARMUP", "1") != "0":
            def _warm_clf():
                try:
                    clf.warmup()
                except Exception as e:
                    print(f"[es] research classifier warm-up failed: {e}", flush=True)
            threading.Thread(target=_warm_clf, name="es-warmup-clf", daemon=True).start()
        yield

    app = FastAPI(title="Siriva API", version="0.2.0", lifespan=lifespan)
    origins = os.environ.get("ES_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, e: ApiError):
        body = {"code": e.code, "message": e.message}
        if e.details is not None:
            body["details"] = e.details
        return JSONResponse({"error": body}, status_code=e.status)

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, e: RequestValidationError):
        det = [{"field": ".".join(str(x) for x in err["loc"][1:]), "problem": err["msg"]} for err in e.errors()]
        return JSONResponse({"error": {"code": "validation_error", "message": "Некорректные данные запроса",
                                       "details": det}}, status_code=422)

    # ----- data access -----
    def get_patient(c, pid):
        row = c.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone()
        if not row:
            _err(404, "patient_not_found", "Пациент не найден")
        return row

    def get_session(c, sid):
        row = c.execute("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
        if not row:
            _err(404, "session_not_found", "Сессия не найдена")
        return row

    def patient_json(r):
        return {"id": r["id"], "label": r["label"], "language": r["language"],
                "consent_voice": bool(r["consent_voice"]), "consent_share": bool(r["consent_share"]),
                "consent_version": r["consent_version"], "consent_at": r["consent_at"],
                "is_demo": bool(r["is_demo"]), "created_at": r["created_at"]}

    def numeric(d: dict) -> dict:
        return {k: v for k, v in d.items() if isinstance(v, (int, float)) and not isinstance(v, bool)}

    def telemetry_features(c, sid) -> dict:
        ev = c.execute("SELECT type, t, value FROM telemetry WHERE session_id=?", (sid,)).fetchall()
        if not ev:
            return {}
        firsts = [e["t"] for e in ev if e["type"] == "first_action"]
        ans = [e["value"] for e in ev if e["type"] == "answer" and e["value"] is not None]
        cnt = lambda *types: float(sum(1 for e in ev if e["type"] in types))
        out: dict[str, float] = {
            "hints_per_session": cnt("hint", "hint_used"),
            "hints_offered_count": cnt("hint_offered"),
            "story_replayed_count": cnt("story_replayed"),
            "story_text_shown_count": cnt("story_text_shown"),
            "mic_error_count": cnt("mic_error"),
            "interruptions_per_session": float(sum(1 for e in ev if e["type"] == "interrupt")),
            "telemetry_pause_count": float(sum(1 for e in ev if e["type"] == "pause")),
        }
        if firsts:
            out["time_to_first_action_s"] = float(statistics.median(firsts))
        if len(ans) >= 3 and statistics.mean(ans) > 0:
            out["rt_cv"] = statistics.pstdev(ans) / statistics.mean(ans)
        return out

    def recompute_session(c, sid):
        feats: dict[str, float] = {}
        for r in c.execute("SELECT features_json FROM exercise_results WHERE session_id=? AND phase!='result' "
                           "ORDER BY id", (sid,)):
            feats.update(numeric(json.loads(r["features_json"])))
        feats.update(telemetry_features(c, sid))
        c.execute("UPDATE sessions SET features_json=? WHERE id=?", (dumps(feats), sid))
        return feats

    TELEMETRY_ONLY = {"hints_per_session", "hints_offered_count", "story_replayed_count", "story_text_shown_count",
                      "mic_error_count", "interruptions_per_session", "telemetry_pause_count",
                      "time_to_first_action_s", "rt_cv"}

    def patient_rows(c, pid):
        """Sessions that may feed the profile: at least one exercise with a result (speech or non-speech) or
        non-telemetry features (synthetic history). Telemetry alone (e.g. one mic_error) never gives scores."""
        rows = c.execute("SELECT s.day, s.features_json, (SELECT COUNT(*) FROM exercise_results r "
                         "WHERE r.session_id=s.id) AS n_ex FROM sessions s WHERE s.patient_id=? "
                         "ORDER BY s.day, s.started_at", (pid,)).fetchall()
        return [r for r in rows if r["n_ex"] or (set(json.loads(r["features_json"])) - TELEMETRY_ONLY)]

    def current_profile(c, pid) -> dict:
        rows = patient_rows(c, pid)
        if not rows:
            p = build_profile({})
            p.update({"has_data": False, "sessions_used": 0, "window_days": PROFILE_WINDOW_DAYS})
            return p
        last = date.fromisoformat(rows[-1]["day"])
        lo = last - timedelta(days=PROFILE_WINDOW_DAYS - 1)
        used = [json.loads(r["features_json"]) for r in rows if date.fromisoformat(r["day"]) >= lo]
        feats = median_features(used)
        p = build_profile(feats)
        p.update({"has_data": True, "sessions_used": len(used), "window_days": PROFILE_WINDOW_DAYS,
                  "as_of": last.isoformat(), "features": {k: round(v, 4) for k, v in sorted(feats.items())}})
        return p

    def difficulty_map(c, pid):
        return {r["domain"]: r["level"] for r in c.execute("SELECT domain, level FROM difficulty WHERE patient_id=?", (pid,))}

    irt_cal = irt.load_calibration()

    def ability_rows(c, pid, domain):
        return [(r["level"], r["accuracy"], r["trials"]) for r in c.execute(
            "SELECT level, accuracy, trials FROM ability_results WHERE patient_id=? AND domain=? ORDER BY id",
            (pid, domain))]

    def level_plan(c, pid, domain, rule_levels=None):
        rule = (rule_levels if rule_levels is not None else difficulty_map(c, pid)).get(domain, planner.DEFAULT_DIFFICULTY)
        return irt.plan_level(ability_rows(c, pid, domain), irt_cal[domain], rule)

    MATERIAL_TITLES = {"pictures-kitchen": "Набор картинок «Кухня»"}
    MATERIAL_KINDS = (("pictures-", "pictures"), ("seq-", "sequence"), ("story:", "story"))

    def material_kind(material_id: str) -> str:
        return next((k for p, k in MATERIAL_KINDS if material_id.startswith(p)), "other")

    def material_title(material_id: str) -> str:
        if material_id.startswith("story:") and material_id[6:] in STORIES:
            return STORIES[material_id[6:]].title
        return MATERIAL_TITLES.get(material_id, material_id)

    def review_memory(c, pid, material_id, q, strength=None, at=None):
        """First contact creates the state from the encoding strength; later checks update the half-life."""
        at = at or datetime.now(timezone.utc)
        row = c.execute("SELECT * FROM memory_items WHERE patient_id=? AND material_id=?", (pid, material_id)).fetchone()
        if row is None:
            st = forgetting.init_state(q if strength is None else strength, at)
        else:
            st = forgetting.update(forgetting.MemoryState(row["half_life_days"], datetime.fromisoformat(row["last_review_at"]),
                                                          row["reviews"], row["best_frac"]), q, at)
        c.execute("INSERT OR REPLACE INTO memory_items VALUES (?,?,?,?,?,?,?)",
                  (pid, material_id, material_kind(material_id), st.half_life_days, st.last_review_at.isoformat(),
                   st.reviews, st.best_frac))

    def review_story(c, pid, story_id, phase, feats):
        """Immediate retell: first contact creates the memory state (strength = share of units), later days check it.
        Delayed retell (20 min): checks it with the retention. Absolute best share is kept for later comparisons."""
        mid, now_dt = f"story:{story_id}", datetime.now(timezone.utc)
        row = c.execute("SELECT * FROM memory_items WHERE patient_id=? AND material_id=?", (pid, mid)).fetchone()
        frac = feats.get("retell_immediate_frac") or 0.0
        if row is None:
            st = forgetting.init_state(frac, now_dt)
        else:
            old = forgetting.MemoryState(row["half_life_days"], datetime.fromisoformat(row["last_review_at"]),
                                         row["reviews"], row["best_frac"])
            if phase == "immediate":
                q = min(1.0, frac / max(old.best_frac, 0.05))
            else:
                q = feats.get("retell_retention")
                q = 0.0 if q is None else q
            st = forgetting.update(old, q, now_dt)
            st.best_frac = max(old.best_frac, frac)
        c.execute("INSERT OR REPLACE INTO memory_items VALUES (?,?,?,?,?,?,?)",
                  (pid, mid, "story", st.half_life_days, st.last_review_at.isoformat(), st.reviews, st.best_frac))

    def reviews_for(c, pid, now_dt=None):
        now_dt = now_dt or datetime.now(timezone.utc)
        out = []
        for r in c.execute("SELECT * FROM memory_items WHERE patient_id=?", (pid,)):
            st = forgetting.MemoryState(r["half_life_days"], datetime.fromisoformat(r["last_review_at"]),
                                        r["reviews"], r["best_frac"])
            d = forgetting.describe(st, now_dt)
            title = material_title(r["material_id"])
            d.update({"material_id": r["material_id"], "kind": r["kind"], "title": title,
                      "reason_code": "recall_below_target" if d["due"] else "scheduled",
                      "reason_params": {"predicted_recall": d["predicted_recall"],
                                        "target_recall": config.FORGET_TARGET_RECALL,
                                        "half_life_days": d["half_life_days"]},
                      "reason": (f"«{title}»: ожидаемое припоминание {num_ru(d['predicted_recall'])}, ниже "
                                 f"{num_ru(config.FORGET_TARGET_RECALL)}. Пора повторить." if d["due"] else
                                 f"«{title}»: ожидаемое припоминание {num_ru(d['predicted_recall'])}. "
                                 f"Повтор запланирован.")})
            out.append(d)
        out.sort(key=lambda d: (not d["due"], d["next_review_at"]))
        return out

    def program_for(c, pid, target=None, budget=None, only=None):
        prof = current_profile(c, pid)
        if not prof["has_data"]:
            _err(409, "no_profile_yet", "Пока нет данных для профиля: пройдите хотя бы одну сессию")
        sc = scores(prof)
        if all(v is None for v in sc.values()):
            _err(409, "no_profile_yet", "В сессиях пока нет признаков для профиля")
        try:
            prog = planner.plan_program(sc, list(exercises.values()), matrix, difficulty_map(c, pid), target=target,
                                        budget=budget or planner.DOSE_BUDGET, only=only)
        except ValueError as e:
            _err(422, "invalid_target", str(e))
        plans = {}
        for it in prog["items"]:
            dom = it["difficulty_domain"]
            if dom not in plans:
                plans[dom] = level_plan(c, pid, dom)
            p = plans[dom]
            it.update({"difficulty": p["level"], "predicted_success": p["predicted_success"],
                       "difficulty_source": p["source"]})
        prog["ability"] = {d: level_plan(c, pid, d) for d in DOMAINS}
        reviews = reviews_for(c, pid)
        prog["reviews"] = reviews
        due_story = next((r for r in reviews if r["kind"] == "story" and r["due"]), None)
        for it in prog["items"]:
            if it["exercise_id"] == "story_retell":
                lang = get_patient(c, pid)["language"]
                default = next((s.id for s in STORIES.values() if s.language == lang), None)
                it["story_id"] = due_story["material_id"][6:] if due_story else default
                it["review"] = due_story
        return prof, prog

    def trajectory_for(c, pid) -> dict:
        rows = patient_rows(c, pid)
        if not rows:
            return {"has_data": False, "weeks": [], "series": {d: [] for d in DOMAINS},
                    "trend_flag": trend.trend_flag({})}
        last = date.fromisoformat(rows[-1]["day"])
        first = date.fromisoformat(rows[0]["day"])
        n_weeks = min(MAX_WEEKS, (last - first).days // 7 + 1)
        weeks = []
        for k in range(n_weeks):
            end = last - timedelta(days=7 * (n_weeks - 1 - k))
            start = end - timedelta(days=6)
            chunk = [json.loads(r["features_json"]) for r in rows if start <= date.fromisoformat(r["day"]) <= end]
            if not chunk:
                weeks.append({"week": k + 1, "start": start.isoformat(), "end": end.isoformat(), "sessions": 0,
                              "scores": {d: None for d in DOMAINS}, "metrics": {}})
                continue
            feats = median_features(chunk)
            weeks.append({"week": k + 1, "start": start.isoformat(), "end": end.isoformat(), "sessions": len(chunk),
                          "scores": scores(build_profile(feats)),
                          "metrics": {m: round(feats[m], 3) for m in TRAJECTORY_METRICS if m in feats}})
        series = {d: [w["scores"][d] for w in weeks] for d in DOMAINS}
        return {"has_data": True, "weeks": weeks, "series": series, "trend_flag": trend.trend_flag(series),
                "labels_ru": DOMAIN_LABEL_RU}

    def delete_patient(c, pid) -> dict:
        counts = {
            "sessions": c.execute("SELECT COUNT(*) n FROM sessions WHERE patient_id=?", (pid,)).fetchone()["n"],
            "exercise_results": c.execute("SELECT COUNT(*) n FROM exercise_results WHERE session_id IN "
                                          "(SELECT id FROM sessions WHERE patient_id=?)", (pid,)).fetchone()["n"],
            "telemetry_events": c.execute("SELECT COUNT(*) n FROM telemetry WHERE session_id IN "
                                          "(SELECT id FROM sessions WHERE patient_id=?)", (pid,)).fetchone()["n"],
        }
        c.execute("DELETE FROM patients WHERE id=?", (pid,))  # cascades to everything else
        return counts

    def item_statuses(c, sid) -> dict[str, dict]:
        rows = c.execute("SELECT exercise_id, phase, created_at, available_at FROM exercise_results WHERE session_id=? "
                         "ORDER BY id", (sid,)).fetchall()
        out: dict[str, dict] = {}
        for r in rows:
            ex = r["exercise_id"]
            if ex == "story_retell":
                if r["phase"] == "immediate":
                    ready = r["available_at"] and datetime.fromisoformat(r["available_at"]) <= datetime.now(timezone.utc)
                    if out.get(ex, {}).get("status") != "done":
                        out[ex] = {"status": "available" if ready else "waiting", "done_at": None, "part": "delayed",
                                   "available_at": r["available_at"]}
                elif r["phase"] == "delayed":
                    out[ex] = {"status": "done", "done_at": r["created_at"], "part": None,
                               "available_at": r["available_at"]}
            else:
                out[ex] = {"status": "done", "done_at": r["created_at"], "part": None, "available_at": None}
        out.setdefault("story_retell", {"status": "available", "done_at": None, "part": "immediate", "available_at": None})
        return out

    def active_days(c, pid) -> int:
        lo = (date.today() - timedelta(days=6)).isoformat()
        return c.execute("SELECT COUNT(DISTINCT day) n FROM sessions WHERE patient_id=? AND day>=?",
                         (pid, lo)).fetchone()["n"]

    def seed_ability_and_memory(c, pid, hist):
        """Synthetic result history (so levels come from IRT in the demo) and a few materials with forgetting state."""
        import random
        rng = random.Random(f"abil:{pid}")
        sc = scores(build_profile(median_features([f for _, f in hist])))
        start = date.today() - timedelta(days=len(hist))
        for d in DOMAINS:
            if sc[d] is None:
                continue
            theta, level = (sc[d] - 50.0) / 30.0, 2
            for k in range(12):
                p = irt.success_probability(theta, irt_cal[d][level - 1])
                acc = sum(rng.random() < p for _ in range(irt.TRIALS_DEFAULT)) / irt.TRIALS_DEFAULT
                day = (start + timedelta(days=int((k + 1) * len(hist) / 13))).isoformat() + "T09:00:00+00:00"
                c.execute("INSERT INTO ability_results (patient_id, domain, level, accuracy, trials, created_at) "
                          "VALUES (?,?,?,?,?,?)", (pid, d, level, acc, irt.TRIALS_DEFAULT, day))
                level = planner.adapt_difficulty(level, acc)
        t0 = datetime.now(timezone.utc)
        states = {  # material: (days since last review, half-life days, reviews, best share)
            DEMO_IDS["trend"]: {"story:apple-tree-ru": (4.0, 3.0, 3, 0.55), "pictures-kitchen": (1.0, 6.0, 2, 0.8)},
            DEMO_IDS["a"]: {"story:apple-tree-ru": (0.5, 5.0, 2, 0.45)},
            DEMO_IDS["b"]: {"story:apple-tree-ru": (5.0, 4.0, 2, 0.35), "pictures-kitchen": (2.0, 5.0, 2, 0.6)},
        }[pid]
        for mid, (ago, h, n, best) in states.items():
            c.execute("INSERT INTO memory_items VALUES (?,?,?,?,?,?,?)",
                      (pid, mid, material_kind(mid), h, (t0 - timedelta(days=ago)).isoformat(timespec="seconds"), n, best))

    def seed_demo_data():
        anchor = date.today()
        a, b = demo_bypass_histories(anchor=anchor)
        spec = [(DEMO_IDS["trend"], "Сауле, 68 лет", demo_trend_history(anchor=anchor)),
                (DEMO_IDS["a"], "Демо: дефицит памяти, речь сохранна", a),
                (DEMO_IDS["b"], "Демо: дефицит памяти, речь снижена", b)]
        with db.connect() as c:
            for pid, label, hist in spec:
                c.execute("DELETE FROM patients WHERE id=?", (pid,))
                c.execute("INSERT INTO patients (id, label, language, consent_voice, is_demo, created_at, consent_share,"
                          " consent_version, consent_at) VALUES (?,?,?,?,?,?,?,?,?)",
                          (pid, label, "ru", 1, 1, now(), 1, "demo", now()))
                for day, feats in hist:
                    c.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?)",
                              (f"{pid}-{day.isoformat()}", pid, day.isoformat(), now(), now(), dumps(feats)))
                seed_ability_and_memory(c, pid, hist)

    if seed_demo:
        seed_demo_data()

    def get_tr() -> Transcriber:
        if state["transcriber"] is None:
            state["transcriber"] = get_transcriber()
        return state["transcriber"]

    # ----- core exercise processing -----
    def process(c, session, exercise_id: str, tr: Transcript, phase: str | None, story_id: str | None,
                picture_id: str | None = None, category: str = "animals") -> dict:
        sid = session["id"]
        if exercise_id not in SPEECH_MEASURES:
            _err(422, "exercise_not_speech_measure",
                 "Для этого упражнения нет анализа речи: используйте /result и /telemetry",
                 {"speech_exercises": list(SPEECH_MEASURES)})
        lang = tr.language
        n_words = sum(1 for w in tr.words if w.text.strip(" .,!?-"))
        if n_words < config.MIN_WORDS_EMPTY:
            _err(422, "empty_audio", "В записи нет речи: проверьте микрофон и повторите", {"words": n_words})
        if exercise_id != "naming_fluency" and n_words < config.MIN_WORDS_SPEECH:
            _err(422, "speech_too_short", "Запись слишком короткая, повторите",
                 {"words": n_words, "min_words": config.MIN_WORDS_SPEECH})
        row_phase, row_story = "single", None
        extra: dict = {}
        available_at = None
        if exercise_id == "picture_description":
            feats = extract_speech_features(tr, lang)
            if picture_id:
                if picture_id not in SCENES:
                    _err(404, "picture_not_found", "Картинка не найдена", {"available": list(SCENES)})
                feats.update(score_picture(tr, get_scene(picture_id), lang))
        elif exercise_id == "naming_fluency":
            if category not in config.FLUENCY_CATEGORIES:
                _err(422, "unsupported_category", "Категория беглости не поддерживается",
                     {"supported": list(config.FLUENCY_CATEGORIES)})
            feats = analyze_fluency(tr, lang)
            extra["category"] = category
        else:
            if phase not in ("immediate", "delayed") or not story_id:
                _err(422, "retell_params_required", "Для пересказа нужны phase (immediate или delayed) и story_id")
            if story_id not in STORIES:
                _err(404, "story_not_found", "Рассказ не найден", {"available": list(STORIES)})
            story = get_story(story_id)
            if story.language != lang:
                _err(422, "story_language_mismatch", f"Рассказ на языке {story.language}, речь передана на {lang}")
            sc = retell.score_retell(tr, story)
            row_phase, row_story = phase, story_id
            if phase == "immediate":
                available_at = (datetime.now(timezone.utc)
                                + timedelta(minutes=config.DELAYED_RETELL_MINUTES)).isoformat(timespec="seconds")
                feats = {"retell_immediate_frac": sc["retell_frac"], "retell_units_found": sc["retell_units_found"],
                         "retell_units_total": sc["retell_units_total"]}
            else:
                imm = c.execute("SELECT features_json, available_at, created_at FROM exercise_results WHERE session_id=? AND exercise_id=? "
                                "AND phase='immediate' AND story_id=?", (sid, exercise_id, story_id)).fetchone()
                if not imm:
                    _err(409, "immediate_missing", "Сначала нужен пересказ сразу (phase=immediate) в этой же сессии")
                found_imm = json.loads(imm["features_json"])["retell_units_found"]
                available_at = imm["available_at"]
                delay = (datetime.now(timezone.utc) - datetime.fromisoformat(imm["created_at"])).total_seconds() / 60
                feats = retell.compare_phases(found_imm, sc["retell_units_found"], sc["retell_units_total"])
                feats["retell_units_found_delayed"] = sc["retell_units_found"]
                feats["retell_delay_min"] = round(delay, 1)
        c.execute("DELETE FROM exercise_results WHERE session_id=? AND exercise_id=? AND phase=? AND IFNULL(story_id,'')=?",
                  (sid, exercise_id, row_phase, row_story or ""))
        c.execute("INSERT INTO exercise_results (session_id, exercise_id, phase, story_id, features_json, transcript_json,"
                  " created_at, available_at) VALUES (?,?,?,?,?,?,?,?)",
                  (sid, exercise_id, row_phase, row_story, dumps(feats),
                   dumps(tr.to_dict()) if store_transcripts else None, now(), available_at))
        session_feats = recompute_session(c, sid)
        if exercise_id == "story_retell":
            review_story(c, session["patient_id"], row_story, row_phase, feats)
        resp = {"session_id": sid, "exercise_id": exercise_id, "phase": row_phase, "language": lang,
                "engine": tr.engine, "transcript": tr.to_dict(), "features": feats,
                "session_features": session_feats, "transcript_stored": store_transcripts, **extra}
        if exercise_id == "story_retell":
            resp["delayed_available_at"] = available_at
        if exercise_id == "picture_description":
            # demo only: never stored, never in features, profile or program
            resp.update(rc.for_transcript(clf, tr.text, lang))
        return resp

    def require_consent(c, session):
        pat = get_patient(c, session["patient_id"])
        if not pat["consent_voice"]:
            _err(403, "consent_required", "Нужно согласие на запись голоса")
        return pat

    # ----- endpoints -----
    @app.get("/health")
    def health():
        tr = get_tr()
        ready = getattr(tr, "ready", lambda: True)()
        return {"status": "ok", "load_source": matrix.source, "load_is_placeholder": matrix.is_placeholder,
                "load_label": matrix.label,
                "languages": list(SUPPORTED_LANGUAGES), "transcriber": os.environ.get("ES_TRANSCRIBER", "local"),
                "transcriber_ready": bool(ready), "transcriber_engine": getattr(tr, "name", "unknown"),
                "transcriber_state": getattr(tr, "state", "ready" if ready else "cold"),
                "transcriber_model": getattr(tr, "model_size", None),
                "transcriber_error": getattr(tr, "error", None),
                "research_classifier_state": ("disabled" if clf is None else getattr(clf, "state", "ready")),
                "research_classifier_ready": bool(clf is not None and clf.ready())}

    @app.get("/exercises")
    def list_exercises():
        items = [{"id": e.id, "kind": e.kind, "channel": e.channel, "title": e.title_ru,
                  "duration_min": e.duration_min, "measures": e.measures, "speech_output": e.speech_output,
                  "playable": e.id in PLAYABLE, "predicted_load": matrix.load(e.id),
                  "dose": planner.dose(e, matrix.load(e.id))}
                 for e in exercises.values() if e.id in matrix.loads]
        return {"matrix": matrix.meta(), "exercises": items}

    @app.get("/stories")
    def list_stories(language: Language | None = None):
        return {"stories": [{"id": s.id, "language": s.language, "title": s.title, "text": s.text,
                             "units_total": len(s.units)} for s in STORIES.values()
                            if language in (None, s.language)]}

    @app.post("/patients", status_code=201)
    def create_patient(body: PatientIn):
        pid = "pt_" + uuid.uuid4().hex[:10]
        with db.connect() as c:
            given = body.consent_voice or body.consent_share
            c.execute("INSERT INTO patients (id, label, language, consent_voice, is_demo, created_at, consent_share,"
                      " consent_version, consent_at) VALUES (?,?,?,?,?,?,?,?,?)",
                      (pid, body.label, body.language, int(body.consent_voice), 0, now(), int(body.consent_share),
                       body.consent_version, now() if given else None))
            return patient_json(get_patient(c, pid))

    @app.get("/patients/{pid}")
    def read_patient(pid: str):
        with db.connect() as c:
            return patient_json(get_patient(c, pid))

    @app.patch("/patients/{pid}")
    def patch_patient(pid: str, body: PatientPatch):
        with db.connect() as c:
            get_patient(c, pid)
            cur = get_patient(c, pid)
            voice = cur["consent_voice"] if body.consent_voice is None else int(body.consent_voice)
            share = cur["consent_share"] if body.consent_share is None else int(body.consent_share)
            version = cur["consent_version"] if body.consent_version is None else body.consent_version
            changed = (voice, share, version) != (cur["consent_voice"], cur["consent_share"], cur["consent_version"])
            c.execute("UPDATE patients SET consent_voice=?, consent_share=?, consent_version=?, consent_at=? WHERE id=?",
                      (voice, share, version, now() if changed else cur["consent_at"], pid))
            return patient_json(get_patient(c, pid))

    @app.delete("/patients/{pid}")
    def remove_patient(pid: str):
        with db.connect() as c:
            get_patient(c, pid)
            return {"deleted": True, "patient_id": pid, "removed": delete_patient(c, pid)}

    @app.post("/patients/{pid}/sessions", status_code=201)
    def start_session(pid: str, body: SessionIn | None = None):
        day = (body.day if body and body.day else date.today()).isoformat()
        sid = "ss_" + uuid.uuid4().hex[:10]
        with db.connect() as c:
            get_patient(c, pid)
            c.execute("INSERT INTO sessions (id, patient_id, day, started_at) VALUES (?,?,?,?)", (sid, pid, day, now()))
            return {"session_id": sid, "patient_id": pid, "day": day, "started_at": now()}

    @app.post("/sessions/{sid}/exercises/{exercise_id}/audio")
    async def upload_audio(sid: str, exercise_id: str, file: UploadFile = File(...), language: Language = Form(...),
                           phase: Literal["immediate", "delayed"] | None = Form(None), story_id: str | None = Form(None),
                           picture_id: str | None = Form(None), category: Literal["animals"] = Form("animals")):
        data = await file.read(MAX_AUDIO_BYTES + 1)
        with db.connect() as c:
            session = get_session(c, sid)
            require_consent(c, session)
        if exercise_id not in exercises:
            _err(404, "exercise_not_found", "Упражнение не найдено")
        if not data:
            _err(422, "empty_audio", "Пустой аудиофайл")
        if len(data) > MAX_AUDIO_BYTES:
            _err(413, "audio_too_large", "Аудио больше 25 МБ")
        if exercise_id not in SPEECH_MEASURES:
            _err(422, "exercise_not_speech_measure", "Для этого упражнения нет анализа речи",
                 {"speech_exercises": list(SPEECH_MEASURES)})
        suffix = Path(file.filename or "audio.webm").suffix or ".webm"
        tmp = tempfile.NamedTemporaryFile(suffix=suffix, delete=False)
        try:
            tmp.write(data)
            tmp.close()
            try:
                tr = await asyncio.wait_for(asyncio.to_thread(get_tr().transcribe, tmp.name, language),
                                            timeout=config.TRANSCRIBE_TIMEOUT_S)
            except asyncio.TimeoutError:
                print(f"[es] transcription timeout after {config.TRANSCRIBE_TIMEOUT_S:g} s", flush=True)
                _err(503, "transcription_failed", "Не удалось распознать речь", {"reason": "timeout"})
            except TranscriptionError as e:
                print(f"[es] transcription failed ({e.code}): {e}", flush=True)  # full text only in the server log
                _err(503, "transcription_failed", "Не удалось распознать речь", {"reason": e.code})
        finally:
            if os.environ.get("ES_KEEP_AUDIO") != "1":
                os.unlink(tmp.name)  # features are kept, raw audio is not
        with db.connect() as c:
            return process(c, get_session(c, sid), exercise_id, tr, phase, story_id, picture_id, category)

    @app.post("/sessions/{sid}/exercises/{exercise_id}/transcript")
    def upload_transcript(sid: str, exercise_id: str, body: TranscriptIn):
        """Same as /audio but with a ready transcript with word timings (demo without a model, tests)."""
        if exercise_id not in exercises:
            _err(404, "exercise_not_found", "Упражнение не найдено")
        tr = Transcript(words=[Word(w.text, w.start, w.end) for w in body.words], language=body.language,
                        duration=body.duration, engine="client-transcript")
        with db.connect() as c:
            session = get_session(c, sid)
            require_consent(c, session)
            return process(c, session, exercise_id, tr, body.phase, body.story_id, body.picture_id, body.category)

    @app.post("/sessions/{sid}/exercises/{exercise_id}/result")
    def exercise_result(sid: str, exercise_id: str, body: ResultIn):
        if exercise_id not in exercises or exercise_id not in matrix.loads:
            _err(404, "exercise_not_found", "Упражнение не найдено")
        with db.connect() as c:
            session = get_session(c, sid)
            prim = planner.primary_domain(matrix.load(exercise_id))
            pid = session["patient_id"]
            before = level_plan(c, pid, prim)
            level_used = body.level or before["level"]
            c.execute("INSERT INTO ability_results (patient_id, domain, level, accuracy, trials, created_at) "
                      "VALUES (?,?,?,?,?,?)", (pid, prim, level_used, body.accuracy,
                                               body.trials or irt.TRIALS_DEFAULT, now()))
            rule_old = difficulty_map(c, pid).get(prim, planner.DEFAULT_DIFFICULTY)
            rule_new = planner.adapt_difficulty(rule_old, body.accuracy)
            c.execute("INSERT OR REPLACE INTO difficulty VALUES (?,?,?)", (pid, prim, rule_new))
            c.execute("INSERT INTO exercise_results (session_id, exercise_id, phase, features_json, created_at) "
                      "VALUES (?,?,?,?,?)", (sid, exercise_id, "result",
                                             dumps({"accuracy": body.accuracy, "duration_s": body.duration_s,
                                                    "level": level_used}), now()))
            if body.material_id:
                review_memory(c, pid, body.material_id, body.accuracy)
            after = level_plan(c, pid, prim)
            return {"exercise_id": exercise_id, "difficulty_domain": prim, "difficulty_before": level_used,
                    "difficulty_after": after["level"], "target_accuracy": [planner.ACC_LOW, planner.ACC_HIGH],
                    "next_level": {"level": after["level"], "predicted_success": after["predicted_success"],
                                   "source": after["source"]},
                    "ability": {"theta_before": before["theta"], "theta_after": after["theta"],
                                "theta_sd": after["theta_sd"], "results": after["results"]},
                    "memory_reviewed": bool(body.material_id)}

    @app.post("/sessions/{sid}/telemetry", status_code=201)
    def post_telemetry(sid: str, body: TelemetryIn):
        with db.connect() as c:
            get_session(c, sid)
            c.executemany("INSERT INTO telemetry (session_id, exercise_id, type, t, value, created_at, meta_json)"
                          " VALUES (?,?,?,?,?,?,?)",
                          [(sid, e.exercise_id, e.type, e.t, e.value, now(), dumps(e.meta) if e.meta else None)
                           for e in body.events])
            feats = recompute_session(c, sid)
            return {"accepted": len(body.events), "session_features": feats}

    @app.post("/sessions/{sid}/complete")
    def complete_session(sid: str):
        with db.connect() as c:
            s = get_session(c, sid)
            c.execute("UPDATE sessions SET completed_at=COALESCE(completed_at, ?) WHERE id=?", (now(), sid))
            feats = recompute_session(c, sid)
            return {"session_id": sid, "completed": True, "session_features": feats,
                    "profile": current_profile(c, s["patient_id"])}

    @app.get("/patients/{pid}/profile")
    def read_profile(pid: str):
        with db.connect() as c:
            get_patient(c, pid)
            return {"patient_id": pid, **current_profile(c, pid)}

    @app.get("/patients/{pid}/program/today")
    def program_today(pid: str, target: str | None = Query(None, description="domain id; default: the lowest"),
                      budget: float | None = Query(None, gt=0, le=60),
                      session_id: str | None = Query(None, description="adds status of each item for this session"),
                      only: str | None = Query(None, description="comma-separated exercise ids, or 'playable'")):
        only_set = None
        if only:
            only_set = set(PLAYABLE) if only == "playable" else {x.strip() for x in only.split(",") if x.strip()}
            unknown = only_set - set(exercises)
            if unknown:
                _err(422, "invalid_only", "Неизвестные упражнения в only", {"unknown": sorted(unknown)})
        with db.connect() as c:
            get_patient(c, pid)
            session_ignored = False
            if session_id:
                s = c.execute("SELECT patient_id FROM sessions WHERE id=?", (session_id,)).fetchone()
                if s is None or s["patient_id"] != pid:  # stale id in the browser (e.g. after a demo reset)
                    session_id, session_ignored = None, True
            prof, prog = program_for(c, pid, target, budget, only_set)
            statuses = item_statuses(c, session_id) if session_id else {}
            for it in prog["items"]:
                it.update(statuses.get(it["exercise_id"], {"status": "available", "done_at": None, "part": None,
                                                           "available_at": None}))
            nxt = next((i["exercise_id"] for i in prog["items"] if i["status"] == "available"), None)
            return {"patient_id": pid, "session_id": session_id, "session_ignored": session_ignored,
                    "profile_scores": scores(prof),
                    "next_exercise_id": nxt, "active_days_last_7": active_days(c, pid), **prog}

    @app.get("/sessions/{sid}")
    def read_session(sid: str):
        with db.connect() as c:
            s = get_session(c, sid)
            rows = c.execute("SELECT exercise_id, phase, story_id, created_at, available_at FROM exercise_results "
                             "WHERE session_id=? ORDER BY id", (sid,)).fetchall()
            retell = None
            imm = next((r for r in rows if r["exercise_id"] == "story_retell" and r["phase"] == "immediate"), None)
            if imm:
                dly = next((r for r in rows if r["exercise_id"] == "story_retell" and r["phase"] == "delayed"), None)
                retell = {"story_id": imm["story_id"], "immediate_done_at": imm["created_at"],
                          "delayed_available_at": imm["available_at"],
                          "delayed_done_at": dly["created_at"] if dly else None}
            n_ev = c.execute("SELECT COUNT(*) n FROM telemetry WHERE session_id=?", (sid,)).fetchone()["n"]
            return {"session_id": sid, "patient_id": s["patient_id"], "day": s["day"], "started_at": s["started_at"],
                    "completed_at": s["completed_at"],
                    "exercises": [{"exercise_id": r["exercise_id"], "phase": r["phase"], "story_id": r["story_id"],
                                   "done_at": r["created_at"]} for r in rows],
                    "retell": retell, "telemetry_events": n_ev,
                    "session_features": json.loads(s["features_json"])}

    @app.get("/pictures")
    def list_pictures():
        return {"pictures": [{"id": s.id, "title": s.title_ru, "title_en": s.title_en, "image_file": s.image_file,
                              "units_total": len(s.units),
                              "units": [{"id": u.id, "kind": u.kind, "label": u.label_ru, "label_en": u.label_en}
                                        for u in s.units]} for s in SCENES.values()]}

    @app.get("/patients/{pid}/trajectory")
    def read_trajectory(pid: str):
        with db.connect() as c:
            if not get_patient(c, pid)["consent_share"]:
                _err(403, "share_not_allowed", "Разрешение показывать динамику близкому не дано")
            return {"patient_id": pid, **trajectory_for(c, pid)}

    @app.get("/demo/patients")
    def demo_patients():
        with db.connect() as c:
            rows = c.execute("SELECT * FROM patients WHERE is_demo=1 ORDER BY id").fetchall()
            out = []
            for r in rows:
                prof = current_profile(c, r["id"])
                out.append({**patient_json(r), "profile_scores": scores(prof), "sessions": prof["sessions_used"]})
            return {"patients": out}

    @app.post("/demo/reset")
    def demo_reset():
        seed_demo_data()
        return {"reset": True, "patients": list(DEMO_IDS.values())}

    @app.get("/demo/bypass-scenario")
    def bypass_scenario():
        with db.connect() as c:
            res = []
            for key in ("a", "b"):
                pid = DEMO_IDS[key]
                if not c.execute("SELECT 1 FROM patients WHERE id=?", (pid,)).fetchone():
                    _err(404, "demo_missing", "Демо-данные удалены, вызовите POST /demo/reset")
                prof, prog = program_for(c, pid, target="episodic_memory")
                res.append({"patient_id": pid, "label": get_patient(c, pid)["label"], "profile_scores": scores(prof),
                            "program": prog})
        a, b = res
        same_memory = abs(a["profile_scores"]["episodic_memory"] - b["profile_scores"]["episodic_memory"]) < 1.0
        ids_a = [i["exercise_id"] for i in a["program"]["items"]]
        ids_b = [i["exercise_id"] for i in b["program"]["items"]]
        return {
            "target_domain": "episodic_memory", "same_memory_score": same_memory,
            "programs_differ": ids_a != ids_b, "patients": res,
            "speech_exercises_a": [i for i in ids_a if exercises[i].speech_output],
            "speech_exercises_b": [i for i in ids_b if exercises[i].speech_output],
            "load_source": matrix.source,
            "explanation_code": "bypass_demo",
            "explanation_params": {"target_domain": "episodic_memory", "same_memory_score": same_memory,
                                   "avoid_domains_b": b["program"]["avoid_domains"], "load_source": matrix.source},
            "load_label": matrix.label,
            "explanation": ("У обоих одинаково снижена эпизодическая память. У второго снижены ещё и речевые функции, "
                            "поэтому система тренирует память через зрительные и пространственные задания, "
                            "а речевые обходит. Источник нагрузки: " + matrix.label[0].lower() + matrix.label[1:]
                            + ("." if not matrix.label.endswith(".") else "")),
        }

    @app.get("/demo/numbers")
    def demo_numbers():
        """Numbers for the jury screen. Both stay pending until real data / a real matrix exist."""
        out = {"load_source": matrix.source, "load_is_placeholder": matrix.is_placeholder,
               "adress": {"status": "pending", "accuracy": None, "test_n": 48, "baseline": 0.75,
                          "research_model": {**rc.meta(), "ready": bool(clf is not None and clf.ready()),
                                             "state": "disabled" if clf is None else getattr(clf, "state", "ready")},
                          "baseline_source": "ADReSS 2020 test set (Luz et al.), linguistic features baseline"},
               "agreement": {"status": "pending", "value": None, "method": None}}
        if not matrix.is_placeholder:
            ph = JsonMatrixLoader(DATA / "load_matrix.placeholder.json").load()
            ag = spearman_agreement(matrix, ph, matrix.tribe_domains or None)
            out["agreement"] = {"status": "ready" if ag["value"] is not None else "pending",
                                "value": None if ag["value"] is None else round(ag["value"], 3),
                                "method": METHOD_AGREEMENT, "per_domain": {
                                    d: None if v is None else round(v, 3) for d, v in ag["per_domain"].items()},
                                "exercises_compared": ag["exercises_compared"], "source": matrix.source,
                                "domains_in_mean": ag["domains_in_mean"],
                                "domain_sources": matrix.domain_sources or {d: "tribe_v2" for d in matrix.domains},
                                "note": ("Среднее только по доменам из TRIBE v2; остальные домены взяты из оценки "
                                         "по типу задания и с ней совпадают по построению" if matrix.is_hybrid else None),
                                "model_version": matrix.model_version, "atlas": matrix.atlas}
        return out

    return app


def app_factory() -> FastAPI:  # uvicorn --factory es_api.main:app_factory
    return create_app()

