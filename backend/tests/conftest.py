import json
from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from es_api.main import create_app
from es_core.matrix import DATA, JsonMatrixLoader

PLACEHOLDER = DATA / "load_matrix.placeholder.json"
from es_core.transcribe import TranscriptionError
from es_core.types import Transcript

FIX = Path(__file__).parent / "fixtures"
ANCHOR = date(2026, 11, 14)


def load_fixture(name: str) -> Transcript:
    return Transcript.from_dict(json.loads((FIX / f"{name}.json").read_text()))


class FakeTranscriber:
    """Returns a fixture instead of running a model (tests never download one)."""
    name = "fake"

    def __init__(self, fixture_name: str | None = None, fail: bool = False):
        self.fixture_name, self.fail, self.calls = fixture_name, fail, []

    def transcribe(self, path, language):
        self.calls.append((path, language))
        if self.fail:
            raise TranscriptionError("boom")
        return load_fixture(self.fixture_name)


@pytest.fixture
def make_client(tmp_path):
    def _make(transcriber=None, seed_demo=True, research_classifier=None):
        return TestClient(create_app(tmp_path / "t.sqlite3", transcriber=transcriber, seed_demo=seed_demo,
                                     matrix_loader=JsonMatrixLoader(PLACEHOLDER),
                                     research_classifier=research_classifier))
    return _make
