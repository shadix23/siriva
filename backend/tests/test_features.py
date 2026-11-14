import pytest
from es_core.features import extract_speech_features, mattr
from es_core.synthetic import timed
from tests.conftest import load_fixture as fixture


def test_pauses_and_latency_exact():
    tr = timed("one two three four", wps=2.0, gap_after={1: 1.0}, start=2.0, word_s=0.4)
    f = extract_speech_features(tr, "en")
    assert f["first_word_latency"] == pytest.approx(2.0)
    assert f["pause_count"] == 1 or f["pause_count"] == 2  # 0.1 s gaps are below the pause threshold
    assert f["pause_ratio"] > 0.3
    assert f["word_count"] == 4


def test_hesitant_vs_fluent_ordering():
    fl = extract_speech_features(fixture("picture_en_fluent"))
    hs = extract_speech_features(fixture("picture_en_hesitant"))
    assert hs["first_word_latency"] > fl["first_word_latency"]
    assert hs["pause_ratio"] > fl["pause_ratio"]
    assert hs["pause_before_content_mean"] > fl["pause_before_content_mean"]
    assert hs["speech_rate_wpm"] < fl["speech_rate_wpm"]
    assert hs["pronoun_share"] > fl["pronoun_share"]
    assert hs["disfluency_per100"] > fl["disfluency_per100"]
    assert hs["filler_count"] >= 2 and hs["repetition_count"] >= 3
    assert fl["subordination_per100"] > 0


def test_mattr_properties():
    assert mattr(["a"] * 30) == pytest.approx(1 / 20)
    assert mattr([str(i) for i in range(30)]) == 1.0
    assert mattr([]) is None


def test_russian_and_language_independent_timing():
    ru = extract_speech_features(fixture("picture_ru"))
    assert ru["word_count"] > 10 and ru["mattr"] > 0.8
    assert ru["subordination_per100"] > 0  # "потому что" / "а"
    # timing features do not depend on the language argument
    tr = fixture("picture_en_fluent")
    a, b = extract_speech_features(tr, "en"), extract_speech_features(tr, "ru")
    for k in ("first_word_latency", "pause_ratio", "speech_rate_wpm", "pause_count"):
        assert a[k] == b[k]


def test_empty_transcript_and_bad_language():
    from es_core.types import Transcript
    f = extract_speech_features(Transcript(words=[], language="en"))
    assert f["word_count"] == 0 and f["pause_ratio"] is None
    with pytest.raises(ValueError):
        extract_speech_features(Transcript(words=[], language="de"))
