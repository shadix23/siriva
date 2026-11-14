"""SQLite storage (stdlib). Postgres / Supabase later: the SQL here is plain and the schema is small."""
from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY, label TEXT, language TEXT NOT NULL, consent_voice INTEGER NOT NULL,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
  consent_share INTEGER NOT NULL DEFAULT 0, consent_version TEXT, consent_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  day TEXT NOT NULL, started_at TEXT NOT NULL, completed_at TEXT, features_json TEXT NOT NULL DEFAULT '{}');
CREATE INDEX IF NOT EXISTS ix_sessions_patient_day ON sessions(patient_id, day);
CREATE TABLE IF NOT EXISTS exercise_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id TEXT NOT NULL, phase TEXT NOT NULL, story_id TEXT, features_json TEXT NOT NULL,
  transcript_json TEXT, created_at TEXT NOT NULL, available_at TEXT);
CREATE INDEX IF NOT EXISTS ix_results_session ON exercise_results(session_id);
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  exercise_id TEXT, type TEXT NOT NULL, t REAL NOT NULL, value REAL, created_at TEXT NOT NULL, meta_json TEXT);
CREATE INDEX IF NOT EXISTS ix_telemetry_session ON telemetry(session_id);
CREATE TABLE IF NOT EXISTS ability_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT, patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  domain TEXT NOT NULL, level INTEGER NOT NULL, accuracy REAL NOT NULL, trials REAL NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS ix_ability_patient ON ability_results(patient_id, domain);
CREATE TABLE IF NOT EXISTS memory_items (
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, material_id TEXT NOT NULL, kind TEXT NOT NULL,
  half_life_days REAL NOT NULL, last_review_at TEXT NOT NULL, reviews INTEGER NOT NULL, best_frac REAL NOT NULL,
  PRIMARY KEY (patient_id, material_id));
CREATE TABLE IF NOT EXISTS difficulty (
  patient_id TEXT NOT NULL REFERENCES patients(id) ON DELETE CASCADE, domain TEXT NOT NULL,
  level INTEGER NOT NULL, PRIMARY KEY (patient_id, domain));
"""


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Db:
    def __init__(self, path: str | Path):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as c:
            c.executescript(SCHEMA)
            # tiny migration for databases created by v0.1
            for table, col, ddl in (("patients", "consent_share", "INTEGER NOT NULL DEFAULT 0"),
                                    ("patients", "consent_version", "TEXT"), ("patients", "consent_at", "TEXT"),
                                    ("exercise_results", "available_at", "TEXT"), ("telemetry", "meta_json", "TEXT")):
                cols = [r["name"] for r in c.execute(f"PRAGMA table_info({table})")]
                if col not in cols:
                    c.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()


def dumps(o) -> str:
    return json.dumps(o, ensure_ascii=False)
