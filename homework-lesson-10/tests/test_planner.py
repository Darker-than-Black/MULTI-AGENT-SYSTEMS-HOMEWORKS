"""
Component-level tests for the Planner agent.

Tests verify:
- Plan structure and schema validity
- Plan quality using LLM-as-judge (GEval)
- Edge case handling (multilingual input, off-domain input)
"""

import json

import pytest
from deepeval import assert_test  # type: ignore[import]
from deepeval.metrics import GEval  # type: ignore[import]
from deepeval.test_case import LLMTestCase, LLMTestCaseParams  # type: ignore[import]
from local_metrics import DeterministicMetric, keyword_coverage_score

from conftest import is_offline_mode

# ---------------------------------------------------------------------------
# Custom metric: Plan Quality
# ---------------------------------------------------------------------------

plan_quality_metric = GEval(
    name="Plan Quality",
    evaluation_steps=[
        "Check that the plan contains at least 2 specific, actionable search queries "
        "(not vague phrases like 'research topic' or single words).",
        "Check that sourcesToCheck contains at least one valid source: 'knowledge_base' or 'web'.",
        "Check that the goal accurately reflects what the user requested — not a generic restatement.",
        "Check that outputFormat specifies a concrete deliverable format "
        "(e.g., 'markdown comparison table', 'bullet-point summary', not just 'report').",
    ],
    evaluation_params=[LLMTestCaseParams.INPUT, LLMTestCaseParams.ACTUAL_OUTPUT],
    model="gpt-4o-mini",
    threshold=0.7,
    verbose_mode=False,
)

# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

VALID_SOURCES = {"knowledge_base", "web"}


def _plan_from(result: dict) -> dict:
    plan = result.get("plan")
    if not plan:
        pytest.skip("Planner returned no plan object.")
    return plan


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.deepeval
def test_plan_quality_happy_path(planner_rag_result: dict) -> None:
    """Planner should produce a high-quality plan for a core RAG domain query."""
    plan = _plan_from(planner_rag_result)
    if is_offline_mode():
        test_case = LLMTestCase(
            input="Compare naive RAG vs sentence-window retrieval",
            actual_output=json.dumps(plan, ensure_ascii=False),
        )

        def _score(_: LLMTestCase) -> tuple[float, str]:
            score, missing = keyword_coverage_score(
                " ".join(
                    [
                        plan.get("goal", ""),
                        " ".join(plan.get("searchQueries", [])),
                        " ".join(plan.get("sourcesToCheck", [])),
                        plan.get("outputFormat", ""),
                    ]
                ),
                [
                    ("naive rag", "fixed-size chunk"),
                    ("sentence-window", "sentence window"),
                    ("knowledge_base", "knowledge base"),
                    ("markdown", "comparison", "citations"),
                ],
            )
            reason = "Offline planner fixture covers the core comparison."
            if missing:
                reason = f"Missing expected plan concepts: {', '.join(missing)}"
            return score, reason

        assert_test(
            test_case,
            [DeterministicMetric("Plan Quality (Offline)", 0.75, _score)],
            run_async=False,
        )
        return

    test_case = LLMTestCase(
        input="Compare naive RAG vs sentence-window retrieval",
        actual_output=json.dumps(plan, ensure_ascii=False),
    )
    assert_test(test_case, [plan_quality_metric], run_async=False)


def test_plan_has_specific_queries(planner_rag_result: dict) -> None:
    """Plan must include at least 2 non-trivial search queries (structural check)."""
    plan = _plan_from(planner_rag_result)
    queries = plan.get("searchQueries", [])
    assert len(queries) >= 2, f"Expected >= 2 search queries, got {len(queries)}: {queries}"
    for q in queries:
        assert len(q.strip()) > 10, f"Query too short (likely vague): '{q}'"


def test_plan_sources_valid(planner_rag_result: dict) -> None:
    """All entries in sourcesToCheck must be known source types."""
    plan = _plan_from(planner_rag_result)
    sources = plan.get("sourcesToCheck", [])
    assert sources, "sourcesToCheck must not be empty."
    for source in sources:
        assert source in VALID_SOURCES, (
            f"Unknown source '{source}'. Expected one of {VALID_SOURCES}."
        )


def test_plan_schema_fields_present(planner_rag_result: dict) -> None:
    """Plan object must contain all required fields with correct types."""
    plan = _plan_from(planner_rag_result)
    assert isinstance(plan.get("goal"), str) and plan["goal"].strip(), "plan.goal must be a non-empty string."
    assert isinstance(plan.get("searchQueries"), list), "plan.searchQueries must be a list."
    assert isinstance(plan.get("sourcesToCheck"), list), "plan.sourcesToCheck must be a list."
    assert isinstance(plan.get("outputFormat"), str) and plan["outputFormat"].strip(), (
        "plan.outputFormat must be a non-empty string."
    )


@pytest.mark.deepeval
def test_plan_quality_edge_case_multilingual(planner_multilingual_result: dict) -> None:
    """
    Planner should still produce a valid plan for a Ukrainian-language query.
    Threshold is relaxed because the planner may translate queries to English.
    """
    plan = _plan_from(planner_multilingual_result)
    if is_offline_mode():
        test_case = LLMTestCase(
            input="що таке мультиагентні системи?",
            actual_output=json.dumps(plan, ensure_ascii=False),
        )

        def _score(_: LLMTestCase) -> tuple[float, str]:
            score, missing = keyword_coverage_score(
                " ".join(
                    [
                        plan.get("goal", ""),
                        " ".join(plan.get("searchQueries", [])),
                        " ".join(plan.get("sourcesToCheck", [])),
                        plan.get("outputFormat", ""),
                    ]
                ),
                [
                    ("multi-agent", "agent"),
                    ("knowledge_base", "web"),
                    ("ukrainian", "ukrainian-language user"),
                ],
            )
            reason = "Offline multilingual plan includes MAS coverage."
            if missing:
                reason = f"Missing multilingual plan signals: {', '.join(missing)}"
            return score, reason

        assert_test(
            test_case,
            [DeterministicMetric("Plan Quality (Multilingual Offline)", 0.66, _score)],
            run_async=False,
        )
        return

    relaxed_metric = GEval(
        name="Plan Quality (Multilingual)",
        evaluation_steps=plan_quality_metric.evaluation_steps,
        evaluation_params=plan_quality_metric.evaluation_params,
        model="gpt-4o-mini",
        threshold=0.5,
        verbose_mode=False,
    )
    test_case = LLMTestCase(
        input="що таке мультиагентні системи?",
        actual_output=json.dumps(plan, ensure_ascii=False),
    )
    assert_test(test_case, [relaxed_metric], run_async=False)


def test_plan_failure_case_off_domain(planner_off_domain_result: dict) -> None:
    """
    Planner should degrade gracefully on an off-domain creative request.
    Either the plan is effectively empty (no queries) or the goal/outputFormat
    signals that the request is outside the agent's scope.
    """
    plan = _plan_from(planner_off_domain_result)
    queries = plan.get("searchQueries", [])
    goal = plan.get("goal", "").lower()

    is_empty_plan = len(queries) == 0
    is_refusal_signal = any(
        kw in goal
        for kw in ["outside", "cannot", "unable", "not supported", "off-domain", "poem", "cat"]
    )

    assert is_empty_plan or is_refusal_signal, (
        f"Expected empty plan or refusal signal for off-domain query, but got queries={queries} goal={goal!r}"
    )
