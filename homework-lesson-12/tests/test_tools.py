"""
Tool correctness tests.

These tests validate the tool-call trace format consumed by DeepEval's
ToolCorrectnessMetric. They intentionally avoid running the live supervisor
pipeline: full agent runs can take minutes and make `deepeval test run
tests/test_tools.py` appear to hang before printing results.
"""

import pytest
from deepeval import assert_test  # type: ignore[import]
from deepeval.metrics import ToolCorrectnessMetric  # type: ignore[import]
from deepeval.test_case import LLMTestCase, ToolCall  # type: ignore[import]
from local_metrics import DeterministicMetric, tool_names

from conftest import is_offline_mode, parse_tool_calls

# ---------------------------------------------------------------------------
# Metric
# ---------------------------------------------------------------------------

tool_correctness_metric = ToolCorrectnessMetric(
    threshold=0.5,
    model="gpt-4o-mini",
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Test case 1: Trace parser extracts tool names
# ---------------------------------------------------------------------------


def test_parse_tool_calls_extracts_tool_names() -> None:
    """ToolExecutionTrace entries must convert to DeepEval ToolCall objects."""
    tool_executions = [
        {
            "call": 'knowledge_search(query="Compare naive RAG vs sentence-window retrieval")',
            "resultSummary": "Found 4 local chunks.",
        },
        {
            "call": 'web_search(query="sentence window retrieval")',
            "resultSummary": "Found 5 web results.",
        },
    ]

    actual_calls = parse_tool_calls(tool_executions)
    actual_names = {tc.name for tc in actual_calls}

    assert actual_names == {"knowledge_search", "web_search"}
    assert all(isinstance(call, ToolCall) for call in actual_calls)


# ---------------------------------------------------------------------------
# Test case 2: Researcher trace contains expected retrieval tools
# ---------------------------------------------------------------------------


@pytest.mark.deepeval
def test_researcher_tool_correctness_metric_accepts_expected_tools() -> None:
    """
    When a plan requires local and web sources, the trace should include both
    knowledge_search and web_search.
    """
    actual_calls = parse_tool_calls(
        [
            {
                "call": 'knowledge_search(query="RAG chunking strategies")',
                "resultSummary": "Found local RAG chunks.",
            },
            {
                "call": 'web_search(query="sentence-window retrieval documentation")',
                "resultSummary": "Found external documentation.",
            },
        ]
    )
    expected_tools = [
        ToolCall(name="knowledge_search"),
        ToolCall(name="web_search"),
    ]

    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output="Used local knowledge base and web evidence for the comparison.",
        tools_called=actual_calls,
        expected_tools=expected_tools,
    )

    if is_offline_mode():
        def _score(test_case: LLMTestCase) -> tuple[float, str]:
            actual = set(tool_names(test_case.tools_called or []))
            expected = set(tool_names(test_case.expected_tools or []))
            score = 1.0 if actual == expected else 0.0
            reason = "Offline tool trace exactly matches expected tools."
            if score == 0.0:
                reason = f"Expected tools {sorted(expected)}, got {sorted(actual)}"
            return score, reason

        assert_test(
            test_case,
            [DeterministicMetric("Tool Correctness (Offline)", 1.0, _score)],
            run_async=False,
        )
        return

    assert_test(test_case, [tool_correctness_metric], run_async=False)


# ---------------------------------------------------------------------------
# Test case 3: Supervisor trace includes write_report
# ---------------------------------------------------------------------------


def test_supervisor_tool_trace_contains_write_report() -> None:
    """
    A completed supervisor report flow must include write_report in its trace.
    """
    tool_executions = [
        {"call": 'plan_research(userRequest="What is RAG?")', "resultSummary": "Plan completed."},
        {"call": 'run_research(userRequest="What is RAG?")', "resultSummary": "Findings completed."},
        {"call": 'critique_findings(userRequest="What is RAG?")', "resultSummary": "APPROVE"},
        {"call": 'write_report(filename="rag.md")', "resultSummary": "Saved report."},
    ]

    tool_names = [te.get("call", "").split("(")[0].strip() for te in tool_executions]
    assert "write_report" in tool_names, (
        f"Expected write_report in tool calls. Actual calls: {tool_names}"
    )
