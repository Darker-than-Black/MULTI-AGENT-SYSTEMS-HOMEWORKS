from __future__ import annotations

from schemas import GraphState, WorkerResponse
from supervisor import aggregate_responses_node


def _state(responses: list[WorkerResponse]) -> GraphState:
    return {
        "user_message": "test",
        "session_id": "s",
        "user_id": "u",
        "plan": None,
        "worker_responses": responses,
        "critic_history": [],
        "retry_count": 0,
        "aggregated_response": None,
        "escalated": False,
        "final_response": None,
    }


def _resp(topic: str, answer: str | None, found: bool = True) -> WorkerResponse:
    return WorkerResponse(
        topic=topic,
        found=found,
        answer=answer,
        confidence=0.8,
    )


def test_single_topic_returns_answer_text() -> None:
    state = _state([_resp("legal", "Юридична відповідь")])

    out = aggregate_responses_node(state)

    assert out["aggregated_response"] == "Юридична відповідь"


def test_multi_topic_joined_in_fixed_order() -> None:
    state = _state(
        [
            _resp("technical_system", "Технічно"),
            _resp("legal", "Юридично"),
            _resp("procurement_general", "Загально"),
        ]
    )

    out = aggregate_responses_node(state)

    assert out["aggregated_response"] == "Юридично\n\n---\n\nЗагально\n\n---\n\nТехнічно"


def test_multi_round_dedup_keeps_last_per_topic() -> None:
    round1 = [
        _resp("legal", "Round1 legal"),
        _resp("procurement_general", "Round1 general"),
        _resp("technical_system", "Round1 technical"),
    ]
    round2 = [
        _resp("legal", "Round2 legal revised"),
        _resp("technical_system", "Round2 technical revised"),
    ]
    state = _state(round1 + round2)

    out = aggregate_responses_node(state)

    text = out["aggregated_response"]
    assert "Round2 legal revised" in text
    assert "Round2 technical revised" in text
    assert "Round1 general" in text
    assert "Round1 legal" not in text
    assert "Round1 technical" not in text


def test_all_not_found_returns_empty_string() -> None:
    state = _state(
        [
            _resp("legal", None, found=False),
            _resp("technical_system", "should be ignored", found=False),
        ]
    )

    out = aggregate_responses_node(state)

    assert out["aggregated_response"] == ""


def test_skips_responses_with_empty_answer() -> None:
    state = _state(
        [
            _resp("legal", None, found=True),
            _resp("procurement_general", "Має текст", found=True),
        ]
    )

    out = aggregate_responses_node(state)

    assert out["aggregated_response"] == "Має текст"


def test_no_responses_returns_empty_string() -> None:
    state = _state([])

    out = aggregate_responses_node(state)

    assert out["aggregated_response"] == ""
