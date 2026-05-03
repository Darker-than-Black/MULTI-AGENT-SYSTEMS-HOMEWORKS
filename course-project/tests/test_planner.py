from __future__ import annotations

from typing import Any

import pytest
from langchain_core.runnables import Runnable

from agents.planner import invoke_planner
from schemas import ResearchPlan, SubTask


class StaticPlanRunnable(Runnable[Any, ResearchPlan]):
    def __init__(self, plan: ResearchPlan) -> None:
        self.plan = plan

    def invoke(
        self,
        input: Any,
        config: Any | None = None,
        **kwargs: Any,
    ) -> ResearchPlan:
        return self.plan


class FakeStructuredLLM:
    def __init__(self, plan: ResearchPlan) -> None:
        self.plan = plan
        self.schema = None

    def with_structured_output(self, schema: type[ResearchPlan]) -> StaticPlanRunnable:
        self.schema = schema
        return StaticPlanRunnable(self.plan)


def _plan(
    *,
    query: str,
    topic: str | None = None,
    is_on_topic: bool = True,
    needs_human: bool = False,
    off_topic_reason: str | None = None,
    escalation_reason: str | None = None,
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
        original_query=query,
        subtasks=subtasks,
        needs_human=needs_human,
        escalation_reason=escalation_reason,
    )


@pytest.fixture
def patch_planner_llm(monkeypatch: pytest.MonkeyPatch):
    def _patch(plan: ResearchPlan) -> FakeStructuredLLM:
        fake_llm = FakeStructuredLLM(plan)
        monkeypatch.setattr("agents.planner.get_llm", lambda: fake_llm)
        return fake_llm

    return _patch


def test_planner_returns_research_plan_instance(patch_planner_llm) -> None:
    plan = _plan(query="Що таке тендерна документація?", topic="procurement_general")
    fake_llm = patch_planner_llm(plan)

    result = invoke_planner("Що таке тендерна документація?")

    assert isinstance(result, ResearchPlan)
    assert result == plan
    assert fake_llm.schema is ResearchPlan


def test_planner_off_topic_detection(patch_planner_llm) -> None:
    plan = _plan(
        query="Поясни правила гри в шахи",
        is_on_topic=False,
        topic=None,
        off_topic_reason="Запит не стосується публічних закупівель.",
    )
    patch_planner_llm(plan)

    result = invoke_planner("Поясни правила гри в шахи")

    assert isinstance(result, ResearchPlan)
    assert result.is_on_topic is False
    assert result.off_topic_reason == "Запит не стосується публічних закупівель."
    assert result.subtasks == []


def test_planner_escalation_detection(patch_planner_llm) -> None:
    plan = _plan(
        query="Потрібен висновок юриста щодо судового спору",
        is_on_topic=True,
        topic=None,
        needs_human=True,
        escalation_reason="Потрібна експертна перевірка.",
    )
    patch_planner_llm(plan)

    result = invoke_planner("Потрібен висновок юриста щодо судового спору")

    assert isinstance(result, ResearchPlan)
    assert result.needs_human is True
    assert result.escalation_reason == "Потрібна експертна перевірка."
    assert result.subtasks == []


def test_planner_legal_classification(patch_planner_llm) -> None:
    plan = _plan(query="Що передбачає стаття 17 Закону 922?", topic="legal")
    patch_planner_llm(plan)

    result = invoke_planner("Що передбачає стаття 17 Закону 922?")

    assert isinstance(result, ResearchPlan)
    assert result.is_on_topic is True
    assert result.subtasks[0].topic == "legal"


def test_planner_general_classification(patch_planner_llm) -> None:
    plan = _plan(
        query="Як оприлюднити зміни до договору в Prozorro?",
        topic="procurement_general",
    )
    patch_planner_llm(plan)

    result = invoke_planner("Як оприлюднити зміни до договору в Prozorro?")

    assert isinstance(result, ResearchPlan)
    assert result.is_on_topic is True
    assert result.subtasks[0].topic == "procurement_general"


def test_planner_technical_classification(patch_planner_llm) -> None:
    plan = _plan(
        query="Чому майданчик не дає завантажити файл пропозиції?",
        topic="technical_system",
    )
    patch_planner_llm(plan)

    result = invoke_planner("Чому майданчик не дає завантажити файл пропозиції?")

    assert isinstance(result, ResearchPlan)
    assert result.is_on_topic is True
    assert result.subtasks[0].topic == "technical_system"


def test_planner_single_subtask_enforced(patch_planner_llm) -> None:
    plan = _plan(
        query="Який строк оскарження умов тендерної документації?",
        topic="legal",
    )
    patch_planner_llm(plan)

    result = invoke_planner("Який строк оскарження умов тендерної документації?")

    assert isinstance(result, ResearchPlan)
    assert len(result.subtasks) == 1
    assert result.subtasks[0].topic == "legal"


def test_planner_trims_multiple_subtasks_to_one(patch_planner_llm) -> None:
    plan = ResearchPlan(
        is_on_topic=True,
        original_query="Поясни статтю 17 і як подати пропозицію в системі",
        subtasks=[
            SubTask(topic="legal", query="Поясни статтю 17", rationale="Legal question"),
            SubTask(
                topic="technical_system",
                query="Як подати пропозицію в системі",
                rationale="Technical question",
            ),
        ],
    )
    patch_planner_llm(plan)

    result = invoke_planner("Поясни статтю 17 і як подати пропозицію в системі")

    assert len(result.subtasks) == 1
    assert result.subtasks[0].topic == "legal"


def test_planner_clears_subtasks_for_direct_escalation(patch_planner_llm) -> None:
    plan = ResearchPlan(
        is_on_topic=True,
        original_query="Система видає невідому помилку, потрібна допомога",
        subtasks=[
            SubTask(
                topic="technical_system",
                query="Система видає невідому помилку",
                rationale="Technical incident",
            )
        ],
        needs_human=True,
        escalation_reason="Ймовірний системний інцидент.",
    )
    patch_planner_llm(plan)

    result = invoke_planner("Система видає невідому помилку, потрібна допомога")

    assert result.needs_human is True
    assert result.subtasks == []
