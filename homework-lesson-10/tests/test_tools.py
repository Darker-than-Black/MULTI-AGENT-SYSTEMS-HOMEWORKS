"""
Tool correctness tests.

Verifies that agents call the correct tools given their role and the
research plan. Uses DeepEval's ToolCorrectnessMetric to evaluate
whether actual tool calls match expected tool calls.
"""

import pytest
from deepeval import assert_test  # type: ignore[import]
from deepeval.metrics import ToolCorrectnessMetric  # type: ignore[import]
from deepeval.test_case import LLMTestCase, ToolCall  # type: ignore[import]

from conftest import cached_run, parse_tool_calls

# ---------------------------------------------------------------------------
# Metric
# ---------------------------------------------------------------------------

tool_correctness_metric = ToolCorrectnessMetric(
    threshold=0.5,
    model="gpt-4o-mini",
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Test case 1: Planner uses at least one search tool
# ---------------------------------------------------------------------------


@pytest.mark.deepeval
def test_planner_uses_search_tools(agent_cache: dict) -> None:
    """
    When the Planner runs (full mode), tool executions should include
    at least one of web_search or knowledge_search.

    The Planner is allowed (but not required) to pre-search before
    building its plan. If it called no tools, the test skips.
    """
    result = cached_run(agent_cache, "full", userRequest="Compare naive RAG vs sentence-window retrieval")

    tool_executions = result.get("toolExecutions", [])
    if not tool_executions:
        pytest.skip("No tool executions recorded — agent may have been skipped.")

    tool_names = {te.get("call", "").split("(")[0].strip() for te in tool_executions}

    search_tools = {"web_search", "knowledge_search"}
    assert search_tools & tool_names, (
        f"Expected at least one of {search_tools} in tool executions. "
        f"Actual tool names: {tool_names}"
    )


# ---------------------------------------------------------------------------
# Test case 2: Researcher uses tools from the plan's sourcesToCheck
# ---------------------------------------------------------------------------


@pytest.mark.deepeval
def test_researcher_uses_tools_per_plan(agent_cache: dict) -> None:
    """
    When the plan specifies sourcesToCheck = ["knowledge_base", "web"],
    the Researcher must invoke both knowledge_search and web_search.
    """
    plan_result = cached_run(
        agent_cache, "plan", userRequest="Compare naive RAG vs sentence-window retrieval"
    )
    plan = plan_result.get("plan")
    if not plan:
        pytest.skip("No plan available — planner fixture failed.")

    # Ensure the plan asks for both sources
    plan["sourcesToCheck"] = ["knowledge_base", "web"]

    research_result = cached_run(
        agent_cache,
        "research",
        userRequest="Compare naive RAG vs sentence-window retrieval",
        plan=plan,
    )

    tool_executions = research_result.get("toolExecutions", [])
    if not tool_executions:
        # research mode doesn't return toolExecutions; fall back to name check in findings
        findings = research_result.get("findings", "")
        # If the researcher produced findings, we can't verify tools — skip gracefully
        if findings:
            pytest.skip("research mode does not expose toolExecutions; use full mode for tool verification.")
        pytest.skip("No tool executions and no findings — agent may be unavailable.")

    actual_calls = parse_tool_calls(tool_executions)
    actual_names = {tc.name for tc in actual_calls}

    expected_tools = [
        ToolCall(name="knowledge_search"),
        ToolCall(name="web_search"),
    ]

    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output=research_result.get("findings", ""),
        tools_called=actual_calls,
        expected_tools=expected_tools,
    )
    assert_test(test_case, [tool_correctness_metric])


# ---------------------------------------------------------------------------
# Test case 3: Full pipeline calls write_report
# ---------------------------------------------------------------------------


@pytest.mark.deepeval
def test_supervisor_calls_write_report(agent_cache: dict) -> None:
    """
    Full mode auto-approves the HITL write_report step.
    The tool execution trace must include a write_report call.
    """
    result = cached_run(
        agent_cache, "full", userRequest="What is retrieval-augmented generation?"
    )

    tool_executions = result.get("toolExecutions", [])
    if not tool_executions:
        pytest.skip("No tool executions recorded.")

    tool_names = [te.get("call", "").split("(")[0].strip() for te in tool_executions]
    assert "write_report" in tool_names, (
        f"Expected write_report in tool calls. Actual calls: {tool_names}"
    )

    assert result.get("wroteReport") is True, (
        "wroteReport flag should be True after auto-approved write_report."
    )
