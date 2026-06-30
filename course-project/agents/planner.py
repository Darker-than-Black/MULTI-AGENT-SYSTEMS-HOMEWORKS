"""Planner agent: classify procurement-support queries into a multi-topic ResearchPlan."""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from agents import keyword_router
from agents.lawyer import get_llm
from config import settings
from observability.langfuse_client import load_prompt
from schemas import ResearchPlan

_MAX_SUBTASKS_PLACEHOLDER = "__PLANNER_MAX_SUBTASKS__"
_KEYWORD_SIGNALS_PLACEHOLDER = "__KEYWORD_SIGNALS__"


def _load_system_prompt(signals_block: str = "") -> str:
    prompt = load_prompt(name="procurement-planner")
    prompt = prompt.replace(
        _MAX_SUBTASKS_PLACEHOLDER, str(settings.planner_max_subtasks)
    )
    prompt = prompt.replace(_KEYWORD_SIGNALS_PLACEHOLDER, signals_block)
    return prompt


def _normalize_plan(plan: ResearchPlan) -> ResearchPlan:
    if plan.needs_human and plan.subtasks:
        return plan.model_copy(update={"subtasks": []})
    if len(plan.subtasks) > settings.planner_max_subtasks:
        return plan.model_copy(
            update={"subtasks": plan.subtasks[: settings.planner_max_subtasks]}
        )
    return plan


def invoke_planner(query: str) -> ResearchPlan:
    signals = keyword_router.score_query(query)
    block = keyword_router.format_signals_block(
        signals, settings.planner_keyword_top_matches
    )
    llm = get_llm().with_structured_output(ResearchPlan)
    plan = llm.invoke(
        [
            SystemMessage(content=_load_system_prompt(block)),
            HumanMessage(content=query),
        ]
    )
    plan = _normalize_plan(plan)
    if any(v > 0 for v in signals["normalized_scores"].values()):
        plan = plan.model_copy(
            update={"keyword_signals": signals["normalized_scores"]}
        )
    return plan
