from __future__ import annotations

import json

import pytest

from agents import keyword_router
from agents.keyword_router import (
    KeywordSignals,
    format_signals_block,
    reset_cache,
    score_query,
)
from config import settings


@pytest.fixture(autouse=True)
def _isolate_router_cache():
    reset_cache()
    yield
    reset_cache()


@pytest.fixture(autouse=True)
def _routing_enabled(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "planner_keyword_routing_enabled", True)
    monkeypatch.setattr(settings, "planner_keyword_official_weight", 1.0)
    monkeypatch.setattr(settings, "planner_keyword_slang_weight", 0.7)
    monkeypatch.setattr(settings, "planner_keyword_top_matches", 3)


def test_single_topic_legal_query_uk() -> None:
    signals = score_query("Куди подати скаргу про оскарження?")

    assert signals["raw_scores"]["legal"] > 0
    assert signals["raw_scores"]["procurement_general"] == 0.0
    assert signals["raw_scores"]["technical_system"] == 0.0
    assert signals["normalized_scores"]["legal"] == pytest.approx(1.0)
    assert "оскарження" in signals["top_matches"]["legal"]


def test_single_topic_general_query_en() -> None:
    signals = score_query("How to plan an annual plan in procurement procedure")

    assert signals["raw_scores"]["procurement_general"] > 0
    assert signals["raw_scores"]["legal"] == 0.0
    assert signals["raw_scores"]["technical_system"] == 0.0
    assert signals["normalized_scores"]["procurement_general"] == pytest.approx(1.0)
    assert signals["top_matches"]["procurement_general"]


def test_multi_topic_mixed_query() -> None:
    signals = score_query("оскарження через OpenProcurement API")

    assert signals["raw_scores"]["legal"] > 0
    assert signals["raw_scores"]["technical_system"] > 0
    assert signals["raw_scores"]["procurement_general"] == 0.0
    norm = signals["normalized_scores"]
    assert norm["legal"] + norm["technical_system"] == pytest.approx(1.0)
    assert "оскарження" in signals["top_matches"]["legal"]
    assert "OpenProcurement API" in signals["top_matches"]["technical_system"]


def test_off_topic_query_yields_zero_signals() -> None:
    signals = score_query("Який холодильник купити для дому?")

    assert all(v == 0.0 for v in signals["raw_scores"].values())
    assert all(v == 0.0 for v in signals["normalized_scores"].values())
    assert format_signals_block(signals, top_n=3) == ""


def test_empty_query_yields_zero_signals() -> None:
    signals = score_query("   ")

    assert all(v == 0.0 for v in signals["raw_scores"].values())
    assert format_signals_block(signals, top_n=3) == ""


def test_toggle_off_short_circuits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "planner_keyword_routing_enabled", False)

    signals = score_query("Скільки штраф за статтею 164-14 КУпАП?")

    assert all(v == 0.0 for v in signals["raw_scores"].values())
    assert all(v == 0.0 for v in signals["normalized_scores"].values())
    assert all(matches == [] for matches in signals["top_matches"].values())


def test_longest_first_dedup(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    fixture = {
        "metadata": {"version": "test"},
        "agents": {
            "lawyer_agent": {
                "topic": "legal",
                "official_uk": ["тендер", "тендерна документація"],
                "official_en": [],
                "slang_uk": [],
                "slang_en": [],
            },
            "common_support_agent": {
                "topic": "procurement_general",
                "official_uk": [],
                "official_en": [],
                "slang_uk": [],
                "slang_en": [],
            },
            "technical_support_agent": {
                "topic": "technical_system",
                "official_uk": [],
                "official_en": [],
                "slang_uk": [],
                "slang_en": [],
            },
        },
    }
    path = tmp_path / "dict.json"
    path.write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(settings, "routing_dictionaries_path", str(path))
    reset_cache()

    signals = score_query("Подаємо тендерна документація через систему")

    # Longest-first match consumes the span; shorter "тендер" must not
    # double-count on top of "тендерна документація".
    assert signals["raw_scores"]["legal"] == pytest.approx(1.0)
    assert signals["top_matches"]["legal"] == ["тендерна документація"]


def test_official_and_slang_weights_combine(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    fixture = {
        "metadata": {"version": "test"},
        "agents": {
            "lawyer_agent": {
                "topic": "legal",
                "official_uk": ["офіційний-термін"],
                "official_en": [],
                "slang_uk": ["сленговий-термін"],
                "slang_en": [],
            },
            "common_support_agent": {
                "topic": "procurement_general",
                "official_uk": [],
                "official_en": [],
                "slang_uk": [],
                "slang_en": [],
            },
            "technical_support_agent": {
                "topic": "technical_system",
                "official_uk": [],
                "official_en": [],
                "slang_uk": [],
                "slang_en": [],
            },
        },
    }
    path = tmp_path / "dict.json"
    path.write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
    monkeypatch.setattr(settings, "routing_dictionaries_path", str(path))
    monkeypatch.setattr(settings, "planner_keyword_official_weight", 1.0)
    monkeypatch.setattr(settings, "planner_keyword_slang_weight", 0.7)
    reset_cache()

    signals = score_query("офіційний-термін і сленговий-термін поряд")

    assert signals["raw_scores"]["legal"] == pytest.approx(1.7)


def test_missing_dictionary_raises_runtime_error(
    monkeypatch: pytest.MonkeyPatch, tmp_path
) -> None:
    missing = tmp_path / "does_not_exist.json"
    monkeypatch.setattr(settings, "routing_dictionaries_path", str(missing))
    reset_cache()

    with pytest.raises(RuntimeError, match="Routing dictionary not found"):
        score_query("стаття 17")


def test_format_signals_block_renders_descending_order() -> None:
    signals: KeywordSignals = {
        "raw_scores": {"legal": 2.0, "technical_system": 1.0, "procurement_general": 0.0},
        "normalized_scores": {
            "legal": 2 / 3,
            "technical_system": 1 / 3,
            "procurement_general": 0.0,
        },
        "top_matches": {
            "legal": ["стаття 17", "Закон 922"],
            "technical_system": ["КЕП"],
            "procurement_general": [],
        },
    }

    block = format_signals_block(signals, top_n=3)

    assert block.startswith("Лексичні сигнали з користувацького запиту")
    legal_idx = block.index("- legal:")
    technical_idx = block.index("- technical_system:")
    general_idx = block.index("- procurement_general:")
    assert legal_idx < technical_idx < general_idx
    assert "«стаття 17»" in block
    assert "«КЕП»" in block
    assert "67%" in block
    assert "33%" in block


def test_format_signals_block_empty_when_no_matches() -> None:
    signals = keyword_router._zero_signals()

    assert format_signals_block(signals, top_n=3) == ""
