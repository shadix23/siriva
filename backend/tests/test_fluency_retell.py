import pytest
from es_core.fluency import analyze_fluency
from es_core.retell import compare_phases, match_units, score_retell
from es_core.stories import STORY_EN, STORY_RU
from es_core.synthetic import timed
from tests.conftest import load_fixture as fixture


def test_fluency_en():
    r = analyze_fluency(fixture("animals_en"))
    assert r["fluency_count"] == 19            # 20 words, "cat" said twice
    assert r["fluency_repeats"] == 1
    assert sum(r["fluency_segments"]) == r["fluency_count"]
    assert len(r["fluency_segments"]) == 4
    assert r["fluency_switches"] >= 3
    assert r["fluency_mean_cluster_size"] > 1


def test_fluency_ru_inflections_and_repeat():
    r = analyze_fluency(fixture("animals_ru"))
    assert r["fluency_repeats"] == 1 and r["fluency_count"] == 13


def test_fluency_segments_decline_and_off_category():
    tr = timed("dog cat cow table pig horse", wps=1 / 7, start=1.0)  # 7 s apart
    r = analyze_fluency(tr, "en")
    assert r["fluency_segments"] == [3, 1, 1, 0] or sum(r["fluency_segments"]) == 5
    assert r["fluency_off_category"] == 1
    assert r["fluency_late_early_ratio"] is not None


def test_retell_units_and_loss():
    story = STORY_EN
    imm = score_retell(fixture("retell_en_immediate"), story)
    dly = score_retell(fixture("retell_en_delayed"), story)
    assert len(story.units) == 24
    assert imm["retell_units_count"] > dly["retell_units_count"] >= 6
    cmp = compare_phases(imm["retell_units_found"], dly["retell_units_found"], 24)
    assert 0 < cmp["retell_retention"] < 1
    assert cmp["retell_units_lost_count"] == imm["retell_units_count"] - len(
        set(imm["retell_units_found"]) & set(dly["retell_units_found"]))


def test_retell_full_text_matches_all_units_both_languages():
    for story in (STORY_EN, STORY_RU):
        tr = timed(story.text, language=story.language)
        assert score_retell(tr, story)["retell_units_count"] == len(story.units)
        assert 22 <= len(story.units) <= 25


def test_retell_empty_and_unrelated():
    assert match_units(timed("hello there", language="en"), STORY_EN) == []
    cmp = compare_phases([], [], 24)
    assert cmp["retell_retention"] is None
