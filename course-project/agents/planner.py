"""Planner agent: classify procurement-support queries into a single ResearchPlan."""

from __future__ import annotations

from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate

from agents.lawyer import get_llm
from schemas import ResearchPlan

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def _load_system_prompt() -> str:
    return (_PROMPTS_DIR / "planner.md").read_text(encoding="utf-8")


def _normalize_phase2_plan(plan: ResearchPlan) -> ResearchPlan:
    if plan.needs_human and plan.subtasks:
        return plan.model_copy(update={"subtasks": []})
    if len(plan.subtasks) > 1:
        return plan.model_copy(update={"subtasks": plan.subtasks[:1]})
    return plan


def invoke_planner(query: str) -> ResearchPlan:
    prompt = ChatPromptTemplate.from_messages(
        [
            ("system", _load_system_prompt()),
            ("human", "{query}"),
        ]
    )
    chain = prompt | get_llm().with_structured_output(ResearchPlan)
    plan = chain.invoke({"query": query})
    return _normalize_phase2_plan(plan)
