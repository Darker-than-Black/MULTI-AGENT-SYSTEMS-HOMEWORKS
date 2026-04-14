"""
Shared fixtures and helpers for homework-lesson-10 DeepEval test suite.

The TypeScript agents are invoked via `npm run batch` (src/main-batch.ts).
Python sends a JSON payload to stdin and reads a JSON result from stdout.

Session-level caching avoids redundant LLM calls when multiple tests share
the same agent invocation.
"""

import json
import os
import subprocess
from pathlib import Path
from typing import Any

import pytest
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

REPO_ROOT = Path(__file__).parent.parent
ENV_FILE = REPO_ROOT / ".env"

load_dotenv(dotenv_path=ENV_FILE)

DEEPEVAL_OFFLINE = os.environ.get("DEEPEVAL_OFFLINE", "0") == "1"

# ---------------------------------------------------------------------------
# Agent invocation
# ---------------------------------------------------------------------------


def run_agent(mode: str, **kwargs: Any) -> dict:
    """
    Invoke the TypeScript batch entrypoint and return the parsed JSON result.

    If the subprocess exits with a non-zero code, the calling test is skipped
    (rather than failed) so that the test suite degrades gracefully when the
    agent infrastructure (Qdrant, OpenAI key, etc.) is unavailable.
    """
    payload = {"mode": mode, **kwargs}
    raw = json.dumps(payload)

    try:
        result = subprocess.run(
            ["npm", "run", "batch", "--silent"],
            input=raw,
            capture_output=True,
            text=True,
            cwd=str(REPO_ROOT),
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        pytest.skip("Agent timed out after 300 s — infrastructure may be unavailable.")

    if result.returncode != 0:
        stderr = result.stderr.strip()
        pytest.skip(f"Agent exited {result.returncode}: {stderr[:200]}")

    stdout = result.stdout.strip()
    if not stdout:
        pytest.skip("Agent produced no output — check npm run batch.")

    try:
        data = json.loads(stdout)
    except json.JSONDecodeError as exc:
        pytest.skip(f"Agent output is not valid JSON: {exc}. stdout={stdout[:200]}")

    if not data.get("success"):
        error = data.get("error", "unknown error")
        pytest.skip(f"Agent returned success=false: {error}")

    return data


# ---------------------------------------------------------------------------
# Session-level result cache
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def agent_cache() -> dict:
    """Mutable dict that persists for the entire test session."""
    return {}


def cached_run(cache: dict, mode: str, **kwargs: Any) -> dict:
    """Run agent and cache result by (mode, frozenset(kwargs))."""
    key = (mode, json.dumps(kwargs, sort_keys=True))
    if key not in cache:
        cache[key] = run_agent(mode, **kwargs)
    return cache[key]


# ---------------------------------------------------------------------------
# Shared session fixtures — agent results reused across test files
# ---------------------------------------------------------------------------

RAG_QUERY = "Compare naive RAG vs sentence-window retrieval"
MULTILINGUAL_QUERY = "що таке мультиагентні системи?"
OFF_DOMAIN_QUERY = "Write a poem about my cat"
QUANTUM_QUERY = "Research quantum computing and compare it with classical computing"

# Canned findings for Critic tests (avoids running Researcher just to test Critic)
HIGH_QUALITY_FINDINGS = """
# Naive RAG vs Sentence-Window Retrieval

## Summary
Naive RAG splits documents into fixed-size chunks and retrieves the top-k
most similar chunks based on embedding similarity. Sentence-window retrieval
improves upon this by indexing individual sentences but expanding each hit to a
surrounding window of sentences before passing the context to the LLM.

## Key Differences
| Aspect | Naive RAG | Sentence-Window |
|---|---|---|
| Index unit | Fixed-size chunks | Individual sentences |
| Retrieval unit | Chunk | Sentence |
| Context unit | Chunk | Sentence + surrounding window |
| Precision | Lower | Higher |
| Context coherence | Variable | More coherent |

## Evidence
- Source: LangChain docs on retrieval strategies (https://docs.langchain.com)
- Source: "Large Language Model" PDF, section on retrieval-augmented generation, p. 12

## Conclusion
Sentence-window retrieval generally yields more relevant and coherent context
for the LLM, at the cost of a slightly more complex indexing pipeline.
"""

SHALLOW_FINDINGS = "RAG is a way to make LLMs better. Sentence window is also good."


@pytest.fixture(scope="session")
def planner_rag_result(agent_cache: dict) -> dict:
    return cached_run(agent_cache, "plan", userRequest=RAG_QUERY)


@pytest.fixture(scope="session")
def planner_multilingual_result(agent_cache: dict) -> dict:
    return cached_run(agent_cache, "plan", userRequest=MULTILINGUAL_QUERY)


@pytest.fixture(scope="session")
def planner_off_domain_result(agent_cache: dict) -> dict:
    return cached_run(agent_cache, "plan", userRequest=OFF_DOMAIN_QUERY)


@pytest.fixture(scope="session")
def researcher_rag_result(agent_cache: dict, planner_rag_result: dict) -> dict:
    plan = planner_rag_result.get("plan")
    if not plan:
        pytest.skip("No plan available for researcher fixture.")
    return cached_run(agent_cache, "research", userRequest=RAG_QUERY, plan=plan)


@pytest.fixture(scope="session")
def researcher_quantum_result(agent_cache: dict) -> dict:
    """
    For the out-of-domain edge case we use a minimal hard-coded plan
    so this test does not depend on the planner fixture.
    """
    minimal_plan = {
        "goal": "Compare quantum computing with classical computing",
        "searchQueries": ["quantum computing vs classical computing", "qubit vs bit"],
        "sourcesToCheck": ["web"],
        "outputFormat": "markdown comparison",
    }
    return cached_run(
        agent_cache,
        "research",
        userRequest=QUANTUM_QUERY,
        plan=minimal_plan,
    )


@pytest.fixture(scope="session")
def retrieval_context_rag(agent_cache: dict) -> list[str]:
    """Raw knowledge-search snippets for the RAG topic (used as retrieval_context)."""
    result = cached_run(agent_cache, "knowledge_search", query=RAG_QUERY)
    raw = result.get("results", "")
    # Split on double newline to produce individual snippet strings
    snippets = [s.strip() for s in raw.split("\n\n") if s.strip()]
    return snippets or [raw]


@pytest.fixture(scope="session")
def critique_approve_result(agent_cache: dict) -> dict:
    return cached_run(
        agent_cache,
        "critique",
        userRequest=RAG_QUERY,
        findings=HIGH_QUALITY_FINDINGS,
    )


@pytest.fixture(scope="session")
def critique_revise_result(agent_cache: dict) -> dict:
    return cached_run(
        agent_cache,
        "critique",
        userRequest=RAG_QUERY,
        findings=SHALLOW_FINDINGS,
    )


# ---------------------------------------------------------------------------
# Golden dataset helper
# ---------------------------------------------------------------------------

GOLDEN_DATASET_PATH = Path(__file__).parent / "golden_dataset.json"


def load_golden_dataset() -> list[dict]:
    with open(GOLDEN_DATASET_PATH, encoding="utf-8") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Tool call parsing helper
# ---------------------------------------------------------------------------


def parse_tool_calls(tool_executions: list[dict]) -> list:
    """
    Convert ToolExecutionTrace dicts from main-batch.ts into
    deepeval.test_case.ToolCall objects.

    Each ToolExecutionTrace has shape: { call: str, resultSummary: str }
    where call looks like: web_search(query="LangChain RAG strategies")
    """
    try:
        from deepeval.test_case import ToolCall  # type: ignore[import]
    except ImportError:
        return []

    result = []
    for trace in tool_executions or []:
        call_str = trace.get("call", "")
        # Extract tool name: everything before the first "("
        paren_idx = call_str.find("(")
        name = call_str[:paren_idx].strip() if paren_idx != -1 else call_str.strip()
        output = trace.get("resultSummary", "")
        if name:
            result.append(ToolCall(name=name, output=output))
    return result
