"""Pre-LLM lexical scorer for the Planner agent.

Loads a bilingual UK/EN keyword dictionary once and scores a user query
against per-topic phrase lists. The result is injected into the Planner
system prompt as a hint block — it never gates the LLM's decision.

The dictionary lives at ``settings.routing_dictionaries_path`` (default
``data/agent_routing_dictionaries_uk_en.json``). Its own metadata says
the keywords are *lexical signals*, not directives, so the formatted
prompt block follows that contract.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TypedDict

from config import settings

logger = logging.getLogger(__name__)

_TOPICS: tuple[str, ...] = ("legal", "procurement_general", "technical_system")
_TIER_TO_KIND: tuple[tuple[str, str], ...] = (
    ("official_uk", "official"),
    ("official_en", "official"),
    ("slang_uk", "slang"),
    ("slang_en", "slang"),
)

_dictionaries_cache: dict | None = None


class KeywordSignals(TypedDict):
    raw_scores: dict[str, float]
    normalized_scores: dict[str, float]
    top_matches: dict[str, list[str]]


def _zero_signals() -> KeywordSignals:
    return KeywordSignals(
        raw_scores={t: 0.0 for t in _TOPICS},
        normalized_scores={t: 0.0 for t in _TOPICS},
        top_matches={t: [] for t in _TOPICS},
    )


def reset_cache() -> None:
    """Drop the module-level dictionary cache. Intended for tests."""
    global _dictionaries_cache
    _dictionaries_cache = None


def _load_dictionaries() -> dict:
    global _dictionaries_cache
    if _dictionaries_cache is not None:
        return _dictionaries_cache

    path = Path(settings.routing_dictionaries_path)
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeError(
            f"Routing dictionary not found at '{path}'. "
            "Check ROUTING_DICTIONARIES_PATH or place the file in data/."
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Routing dictionary at '{path}' is not valid JSON: {exc}"
        ) from exc

    agents = raw.get("agents")
    if not isinstance(agents, dict) or not agents:
        raise RuntimeError(
            f"Routing dictionary at '{path}' is missing the 'agents' object."
        )

    covered = {agent.get("topic") for agent in agents.values() if isinstance(agent, dict)}
    missing = set(_TOPICS) - covered
    if missing:
        raise RuntimeError(
            f"Routing dictionary at '{path}' does not cover topics {sorted(missing)}; "
            f"found {sorted(t for t in covered if t)}."
        )

    _dictionaries_cache = raw
    return raw


def _scan_phrases(
    query_lower: str, phrases: list[tuple[str, float]]
) -> tuple[float, list[str]]:
    """Substring scan with longest-first dedup via consumed-span masking.

    ``phrases`` is a list of ``(phrase, weight)`` sorted by descending phrase
    length. A character index in the query can be consumed by at most one
    match per topic, so a shorter phrase fully contained inside a longer one
    cannot double-count.
    """
    consumed = bytearray(len(query_lower))
    total = 0.0
    matches: list[str] = []
    for phrase, weight in phrases:
        phrase_lower = phrase.lower()
        if not phrase_lower:
            continue
        start = 0
        while True:
            idx = query_lower.find(phrase_lower, start)
            if idx == -1:
                break
            end = idx + len(phrase_lower)
            if any(consumed[idx:end]):
                start = idx + 1
                continue
            for i in range(idx, end):
                consumed[i] = 1
            total += weight
            matches.append(phrase)
            start = end
    return total, matches


def score_query(query: str) -> KeywordSignals:
    """Score ``query`` against the keyword dictionary.

    Returns zero signals when keyword routing is disabled, the query is
    empty or whitespace-only, or no dictionary phrase matches.
    """
    if not settings.planner_keyword_routing_enabled:
        return _zero_signals()
    if not query or not query.strip():
        return _zero_signals()

    raw = _load_dictionaries()
    query_lower = query.lower()

    official_w = float(settings.planner_keyword_official_weight)
    slang_w = float(settings.planner_keyword_slang_weight)

    raw_scores: dict[str, float] = {t: 0.0 for t in _TOPICS}
    top_matches: dict[str, list[str]] = {t: [] for t in _TOPICS}

    for agent in raw["agents"].values():
        if not isinstance(agent, dict):
            continue
        topic = agent.get("topic")
        if topic not in _TOPICS:
            continue
        phrases: list[tuple[str, float]] = []
        for tier_key, kind in _TIER_TO_KIND:
            weight = official_w if kind == "official" else slang_w
            for phrase in agent.get(tier_key, []) or []:
                if isinstance(phrase, str) and phrase.strip():
                    phrases.append((phrase, weight))
        phrases.sort(key=lambda item: len(item[0]), reverse=True)
        score, matches = _scan_phrases(query_lower, phrases)
        raw_scores[topic] += score
        top_matches[topic].extend(matches)

    total = sum(raw_scores.values())
    if total > 0:
        normalized = {t: raw_scores[t] / total for t in _TOPICS}
    else:
        normalized = {t: 0.0 for t in _TOPICS}

    logger.debug(
        "keyword_router: query_len=%d raw=%s normalized=%s",
        len(query),
        raw_scores,
        normalized,
    )

    return KeywordSignals(
        raw_scores=raw_scores,
        normalized_scores=normalized,
        top_matches=top_matches,
    )


def format_signals_block(signals: KeywordSignals, top_n: int) -> str:
    """Render a Ukrainian hint block for the Planner system prompt.

    Returns ``""`` when no phrase matched (raw sum is 0). When non-empty,
    topics are listed in descending order of normalized score.
    """
    if not any(v > 0 for v in signals["raw_scores"].values()):
        return ""

    lines = ["Лексичні сигнали з користувацького запиту (підказка, не директива):"]
    sorted_topics = sorted(
        _TOPICS,
        key=lambda t: signals["normalized_scores"][t],
        reverse=True,
    )
    cap = max(0, int(top_n))
    for topic in sorted_topics:
        pct = round(signals["normalized_scores"][topic] * 100)
        matches = signals["top_matches"][topic][:cap]
        if matches:
            quoted = ", ".join(f"«{m}»" for m in matches)
            lines.append(f"- {topic}: {pct}% (матчі: {quoted})")
        else:
            lines.append(f"- {topic}: {pct}%")
    return "\n".join(lines)
