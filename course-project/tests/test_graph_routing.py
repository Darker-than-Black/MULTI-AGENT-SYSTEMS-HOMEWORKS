from __future__ import annotations

from types import SimpleNamespace

import pytest

import supervisor
from schemas import ResearchPlan, SubTask, WorkerResponse


def _state(user_message: str = "test query") -> dict:
    return {
        "user_message": user_message,
        "session_id": "session-1",
        "user_id": "user-1",
        "plan": None,
        "worker_responses": [],
        "critic_history": [],
        "retry_count": 0,
        "aggregated_response": None,
        "escalated": False,
        "final_response": None,
    }


def _plan(
    *,
    query: str,
    topic: str | None = None,
    is_on_topic: bool = True,
    needs_human: bool = False,
    off_topic_reason: str | None = None,
    escalation_reason: str | None = None,
    language: str = "uk",
) -> ResearchPlan:
    subtasks = []
    if topic is not None:
        subtasks.append(
            SubTask(
                topic=topic,
                query=query,
                rationale=f"Route to {topic}",
            )
        )

    return ResearchPlan(
        is_on_topic=is_on_topic,
        off_topic_reason=off_topic_reason,
        language=language,
        original_query=query,
        subtasks=subtasks,
        needs_human=needs_human,
        escalation_reason=escalation_reason,
    )


def _response(topic: str, answer: str) -> WorkerResponse:
    return WorkerResponse(
        topic=topic,
        found=True,
        answer=answer,
        confidence=0.9,
    )


@pytest.fixture
def patch_graph_dependencies(monkeypatch: pytest.MonkeyPatch):
    planner = SimpleNamespace(plan=None)
    lawyer_response = _response("legal", "Legal answer")
    common_response = _response("procurement_general", "General answer")
    technical_response = _response("technical_system", "Technical answer")

    monkeypatch.setattr(
        supervisor,
        "invoke_planner",
        lambda query: planner.plan,
    )
    monkeypatch.setattr(
        supervisor,
        "lawyer_node",
        lambda state: {"worker_responses": [lawyer_response]},
    )
    monkeypatch.setattr(
        supervisor,
        "invoke_common_support",
        lambda query: common_response,
    )
    monkeypatch.setattr(
        supervisor,
        "invoke_technical_support",
        lambda query: technical_response,
    )

    return planner


def test_legal_query_routes_to_lawyer(patch_graph_dependencies) -> None:
    patch_graph_dependencies.plan = _plan(query="Стаття 17", topic="legal")
    graph = supervisor.build_graph()

    result = graph.invoke(
        _state("Стаття 17"),
        {"configurable": {"thread_id": "legal-route"}},
    )

    assert result["worker_responses"][0].topic == "legal"


def test_general_query_routes_to_common_support(patch_graph_dependencies) -> None:
    patch_graph_dependencies.plan = _plan(
        query="Етапи відкритих торгів",
        topic="procurement_general",
    )
    graph = supervisor.build_graph()

    result = graph.invoke(
        _state("Етапи відкритих торгів"),
        {"configurable": {"thread_id": "general-route"}},
    )

    assert result["worker_responses"][0].topic == "procurement_general"


def test_technical_query_routes_to_technical_support(patch_graph_dependencies) -> None:
    patch_graph_dependencies.plan = _plan(
        query="Не завантажується файл",
        topic="technical_system",
    )
    graph = supervisor.build_graph()

    result = graph.invoke(
        _state("Не завантажується файл"),
        {"configurable": {"thread_id": "technical-route"}},
    )

    assert result["worker_responses"][0].topic == "technical_system"


def test_off_topic_query_returns_refusal(patch_graph_dependencies) -> None:
    patch_graph_dependencies.plan = _plan(
        query="Яка погода завтра?",
        is_on_topic=False,
        topic=None,
        off_topic_reason="Запит не стосується публічних закупівель.",
    )
    graph = supervisor.build_graph()

    result = graph.invoke(
        _state("Яка погода завтра?"),
        {"configurable": {"thread_id": "off-topic-route"}},
    )

    assert result["worker_responses"] == []
    assert "поза межами системи ProZorro" in result["final_response"]


def test_escalation_returns_stub_message(patch_graph_dependencies) -> None:
    patch_graph_dependencies.plan = _plan(
        query="Система не працює",
        topic=None,
        needs_human=True,
        escalation_reason="Потрібна перевірка інциденту.",
    )
    graph = supervisor.build_graph()

    result = graph.invoke(
        _state("Система не працює"),
        {"configurable": {"thread_id": "escalation-route"}},
    )

    assert result["escalated"] is True
    assert result["final_response"] == "Запит передано фахівцю для подальшого опрацювання."


@pytest.mark.parametrize(
    ("plan", "thread_id"),
    [
        (_plan(query="Стаття 17", topic="legal"), "final-legal"),
        (
            _plan(query="Етапи відкритих торгів", topic="procurement_general"),
            "final-general",
        ),
        (
            _plan(query="Не завантажується файл", topic="technical_system"),
            "final-technical",
        ),
        (
            _plan(
                query="Яка погода завтра?",
                is_on_topic=False,
                topic=None,
                off_topic_reason="Запит не стосується публічних закупівель.",
            ),
            "final-off-topic",
        ),
        (
            _plan(
                query="Система не працює",
                topic=None,
                needs_human=True,
                escalation_reason="Потрібна перевірка інциденту.",
            ),
            "final-escalation",
        ),
    ],
)
def test_final_response_is_not_none_for_all_routes(
    patch_graph_dependencies,
    plan: ResearchPlan,
    thread_id: str,
) -> None:
    patch_graph_dependencies.plan = plan
    graph = supervisor.build_graph()

    result = graph.invoke(
        _state(plan.original_query),
        {"configurable": {"thread_id": thread_id}},
    )

    assert result["final_response"] is not None
