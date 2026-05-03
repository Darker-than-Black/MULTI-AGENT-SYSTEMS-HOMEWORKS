"""Lawyer agent: legal domain specialist for Ukrainian procurement law."""

from __future__ import annotations

from pathlib import Path

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI
from langgraph.prebuilt import create_react_agent

from config import settings
from schemas import WorkerResponse
from tools.rag import rag_search

_PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


def get_llm() -> BaseChatModel:
    if settings.llm_provider == "openai":
        assert settings.openai_api_key, "OPENAI_API_KEY required"
        return ChatOpenAI(
            model=settings.llm_model,
            api_key=settings.openai_api_key.get_secret_value(),
        )
    assert settings.anthropic_api_key, "ANTHROPIC_API_KEY required"
    return ChatAnthropic(
        model=settings.llm_model,
        api_key=settings.anthropic_api_key.get_secret_value(),
    )


def _load_system_prompt() -> str:
    # Phase 1: local file. Phase 3 migrates to langfuse.get_prompt("lawyer").compile()
    return (_PROMPTS_DIR / "lawyer.md").read_text(encoding="utf-8")


def build_lawyer_agent():  # type: ignore[return]
    return create_react_agent(
        model=get_llm(),
        tools=[rag_search],
        prompt=_load_system_prompt(),
        response_format=WorkerResponse,
    )


_lawyer = None


def get_lawyer_agent():  # type: ignore[return]
    global _lawyer
    if _lawyer is None:
        _lawyer = build_lawyer_agent()
    return _lawyer


def invoke_lawyer(query: str) -> WorkerResponse:
    result = get_lawyer_agent().invoke(
        {"messages": [HumanMessage(content=query)]}
    )
    return result["structured_response"]
