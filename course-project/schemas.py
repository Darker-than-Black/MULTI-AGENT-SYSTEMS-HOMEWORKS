"""Inter-agent Pydantic contracts. All graph nodes communicate via these models — never free text."""

from __future__ import annotations

import operator
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator
from typing_extensions import TypedDict


class Source(BaseModel):
    title: str
    url: str | None = None
    doc_id: str


class WorkerResponse(BaseModel):
    topic: Literal["legal", "procurement_general", "technical_system"]
    found: bool
    answer: str | None = None
    sources: list[Source] = Field(default_factory=list)
    confidence: float = Field(ge=0.0, le=1.0)
    needs_human: bool = False
    needs_human_reason: str | None = None


class SubTask(BaseModel):
    topic: Literal["legal", "procurement_general", "technical_system"]
    query: str
    rationale: str


class ResearchPlan(BaseModel):
    is_on_topic: bool
    off_topic_reason: str | None = None
    language: Literal["uk", "en"] = "uk"
    original_query: str
    subtasks: list[SubTask] = Field(default_factory=list)
    needs_human: bool = False
    escalation_reason: str | None = None

    @model_validator(mode="after")
    def validate_consistency(self) -> "ResearchPlan":
        if not self.is_on_topic and self.subtasks:
            raise ValueError("off-topic plan must have empty subtasks")
        if self.needs_human and not self.escalation_reason:
            raise ValueError("needs_human=True requires escalation_reason")
        if self.is_on_topic and not self.needs_human and not self.subtasks:
            raise ValueError("on-topic plan must have at least one subtask")
        return self


class CritiqueResult(BaseModel):
    verdict: Literal["approve", "revise", "escalate"]
    revision_requests: list[dict] = Field(default_factory=list)
    dimensions: dict = Field(default_factory=dict)
    summary: str = ""


class EscalationOutput(BaseModel):
    reason: str
    original_query: str
    session_id: str
    timestamp: str


class GraphState(TypedDict):
    user_message: str
    session_id: str
    user_id: str
    plan: ResearchPlan | None
    worker_responses: Annotated[list[WorkerResponse], operator.add]
    critic_history: list[CritiqueResult]
    retry_count: int
    aggregated_response: str | None
    escalated: bool
    final_response: str | None
