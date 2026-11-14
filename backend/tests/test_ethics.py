"""Visible text must not use the banned wording (diagnosis, treatment, Alzheimer risk, disease)."""
import re
from pathlib import Path

from tests.conftest import FakeTranscriber

BANNED = re.compile(r"диагноз|диагностик|лечени|лечить|болезн|альцгеймер|alzheimer|diagnos|disease|treatment", re.I)
ROOT = Path(__file__).resolve().parent.parent


def test_api_responses_have_no_banned_words(make_client):
    c = make_client()
    urls = ["/health", "/exercises", "/stories", "/demo/patients", "/demo/bypass-scenario",
            "/patients/demo-trend/profile", "/patients/demo-trend/program/today", "/patients/demo-trend/trajectory",
            "/patients/demo-bypass-b/program/today"]
    for u in urls:
        text = c.get(u).text
        assert not BANNED.search(text), (u, BANNED.search(text).group(0))


def test_source_and_data_files_have_no_banned_words():
    files = [p for d in ("es_core", "es_api", "scripts") for p in (ROOT / d).rglob("*") if p.suffix in (".py", ".json")]
    files += [ROOT / "README.md", ROOT.parent / "docs" / "API-CONTRACT.md"]
    for p in files:
        if p.exists():
            m = BANNED.search(p.read_text())
            assert not m, (str(p), m.group(0))
